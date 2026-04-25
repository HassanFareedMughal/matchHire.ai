const axios = require("axios");
const { spawn } = require("child_process");
const path = require("path");

// GET /api/jobs?keyword=developer&location=New+York
const searchJobs = async (req, res) => {
    const { keyword = "developer", location = "remote" } = req.query;

    try {
        const response = await axios.get(
            "https://jsearch.p.rapidapi.com/search",
            {
                params: {
                    query: `${keyword} in ${location}`,
                    page: "1",
                    num_pages: "1",
                },
                headers: {
                    "x-rapidapi-key": process.env.RAPIDAPI_KEY,
                    "x-rapidapi-host": "jsearch.p.rapidapi.com",
                },
            }
        );

        // Simplify the response — return only the fields we need
        const jobs = response.data.data.map((job) => ({
            title: job.job_title,
            company: job.employer_name,
            location: job.job_city
                ? `${job.job_city}, ${job.job_country}`
                : job.job_country,
            applyLink: job.job_apply_link,
        }));

        res.status(200).json({
            success: true,
            count: jobs.length,
            jobs,
        });
    } catch (error) {
        console.error("JSearch API error:", error.message);
        res.status(500).json({
            success: false,
            message: "Failed to fetch jobs. Please try again later.",
        });
    }
};

// ---------------------------------------------------------------------------
// POST /api/jobs/smart-match
// 1. Fetch real jobs from JSearch API using keyword + location
// 2. Send resume + job descriptions to Python matcher via child_process
// 3. Merge AI similarity scores back with the original job data
// 4. Return top matches sorted by score
// ---------------------------------------------------------------------------
const smartMatch = async (req, res) => {
    const { resume, keyword = "developer", location = "remote" } = req.body;

    // Validate that a resume was provided
    if (!resume || resume.trim() === "") {
        return res.status(400).json({
            success: false,
            message: "Please provide a 'resume' in the request body.",
        });
    }

    // ------------------------------------------------------------------
    // Step 1 — Fetch jobs from JSearch API
    // ------------------------------------------------------------------
    let rawJobs;
    try {
        const response = await axios.get(
            "https://jsearch.p.rapidapi.com/search",
            {
                params: {
                    query: `${keyword} in ${location}`,
                    page: "1",
                    num_pages: "1",
                },
                headers: {
                    "x-rapidapi-key": process.env.RAPIDAPI_KEY,
                    "x-rapidapi-host": "jsearch.p.rapidapi.com",
                },
            }
        );
        rawJobs = response.data.data;
    } catch (error) {
        console.error("JSearch API error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch jobs from JSearch API.",
        });
    }

    if (!rawJobs || rawJobs.length === 0) {
        return res.status(404).json({
            success: false,
            message: "No jobs found for the given keyword and location.",
        });
    }

    // ------------------------------------------------------------------
    // Step 2 — Build a simplified jobs list to send to Python
    // We include applyLink here so we can merge it back after scoring
    // ------------------------------------------------------------------
    const jobsForPython = rawJobs.map((job) => ({
        title: job.job_title,
        description: job.job_description || "",   // used for TF-IDF matching
        applyLink: job.job_apply_link,             // preserved for the final response
        company: job.employer_name,
        location: job.job_city
            ? `${job.job_city}, ${job.job_country}`
            : job.job_country,
    }));

    // ------------------------------------------------------------------
    // Step 3 — Spawn Python matcher, send data via stdin, read from stdout
    // ------------------------------------------------------------------
    const scriptPath = path.join(__dirname, "../../ai-engine/matcher.py");

    const pythonResult = await new Promise((resolve, reject) => {
        const python = spawn("python", [scriptPath]);

        let outputData = "";  // stdout from Python
        let errorData = "";  // stderr from Python (errors / tracebacks)

        // Send resume + jobs as JSON to Python's stdin
        python.stdin.write(JSON.stringify({ resume, jobs: jobsForPython }));
        python.stdin.end();

        python.stdout.on("data", (chunk) => { outputData += chunk.toString(); });
        python.stderr.on("data", (chunk) => { errorData += chunk.toString(); });

        python.on("close", (exitCode) => {
            if (exitCode !== 0) {
                console.error("Python error metadata:\n", errorData, "\nOutput:\n", outputData);
                return reject(new Error("Python script exited with an error. Output: " + outputData));
            }
            try {
                resolve(JSON.parse(outputData));  // parse the ranked results
            } catch (_) {
                reject(new Error("Could not parse Python output."));
            }
        });
    }).catch((err) => {
        return { error: err.message };
    });

    // Handle Python-level errors
    if (pythonResult.error) {
        return res.status(500).json({
            success: false,
            message: pythonResult.error,
        });
    }

    // ------------------------------------------------------------------
    // Step 4 — Merge AI scores back with the full job data (incl. applyLink)
    // Python returns objects with {title, description, score}
    // We match them back to the original jobs by title to restore all fields
    // ------------------------------------------------------------------
    const jobMap = {};
    jobsForPython.forEach((job) => { jobMap[job.title] = job; });

    const mergedResults = pythonResult.map((match) => {
        const original = jobMap[match.title] || {};
        return {
            title: match.title,
            company: original.company || "N/A",
            location: original.location || "N/A",
            applyLink: original.applyLink || "N/A",
            score: match.score,              // AI similarity score (0-1)
            score_breakdown: match.score_breakdown, // Breakdown of the hybrid score
        };
    });

    // Already sorted by Python, but ensure descending order
    mergedResults.sort((a, b) => b.score - a.score);

    res.status(200).json({
        success: true,
        count: mergedResults.length,
        matches: mergedResults,
    });
};

module.exports = { searchJobs, smartMatch };
