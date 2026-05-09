const { spawn } = require("child_process");
const path = require("path");
const { getJobsCached } = require("../services/jobService");

// ---------------------------------------------------------------------------
// GET /api/jobs?keyword=developer&location=remote
// Returns a flat list of jobs — checks Redis → MongoDB → JSearch API
// ---------------------------------------------------------------------------
const searchJobs = async (req, res) => {
    const { keyword = "developer", location = "remote" } = req.query;

    try {
        const jobs = await getJobsCached(keyword, location);

        if (jobs.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No jobs found for the given keyword and location.",
            });
        }

        res.status(200).json({
            success: true,
            count: jobs.length,
            jobs: jobs.map((j) => ({
                title: j.title,
                company: j.company,
                location: j.location_str,
                applyLink: j.applyLink,
            })),
        });
    } catch (error) {
        console.error("searchJobs error:", error.message);
        res.status(500).json({
            success: false,
            message: "Failed to fetch jobs. Please try again later.",
        });
    }
};

// ---------------------------------------------------------------------------
// POST /api/match  (called by the match route)
// POST /api/jobs/smart-match  (also reachable via jobs route)
//
// 1. Fetch jobs via 3-tier cache (Redis → MongoDB → JSearch)
// 2. Send resume + job descriptions to Python AI matcher
// 3. Merge AI scores back with full job data
// 4. Return top matches sorted by score
// ---------------------------------------------------------------------------
const smartMatch = async (req, res) => {
    const { resume, keyword = "developer", location = "remote" } = req.body;

    if (!resume || resume.trim() === "") {
        return res.status(400).json({
            success: false,
            message: "Please provide a 'resume' in the request body.",
        });
    }

    // ------------------------------------------------------------------
    // Step 1 — Get jobs from cache (Redis → MongoDB → JSearch API)
    // ------------------------------------------------------------------
    let jobs;
    try {
        jobs = await getJobsCached(keyword, location);
    } catch (error) {
        console.error("Job fetch error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch jobs. Please try again later.",
        });
    }

    if (!jobs || jobs.length === 0) {
        return res.status(404).json({
            success: false,
            message: "No jobs found for the given keyword and location.",
        });
    }

    // ------------------------------------------------------------------
    // Step 2 — Build the payload for Python (needs title + description)
    // ------------------------------------------------------------------
    const jobsForPython = jobs.map((job) => ({
        title: job.title,
        description: job.description || "",
        applyLink: job.applyLink,
        company: job.company,
        location: job.location_str,
    }));

    // ------------------------------------------------------------------
    // Step 3 — Spawn Python matcher, send via stdin, read from stdout
    // ------------------------------------------------------------------
    const scriptPath = path.join(__dirname, "../../ai-engine/matcher.py");

    const pythonResult = await new Promise((resolve, reject) => {
        const python = spawn("python", [scriptPath]);

        let outputData = "";
        let errorData = "";

        python.stdin.write(JSON.stringify({ resume, jobs: jobsForPython }));
        python.stdin.end();

        python.stdout.on("data", (chunk) => { outputData += chunk.toString(); });
        python.stderr.on("data", (chunk) => { errorData += chunk.toString(); });

        python.on("close", (exitCode) => {
            if (exitCode !== 0) {
                console.error("Python error:\n", errorData, "\nOutput:\n", outputData);
                return reject(new Error("Python script exited with an error. Output: " + outputData));
            }
            try {
                resolve(JSON.parse(outputData));
            } catch (_) {
                reject(new Error("Could not parse Python output."));
            }
        });
    }).catch((err) => ({ error: err.message }));

    if (pythonResult.error) {
        return res.status(500).json({
            success: false,
            message: pythonResult.error,
        });
    }

    // ------------------------------------------------------------------
    // Step 4 — Merge AI scores back with the full job data
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
            score: match.score,
            score_breakdown: match.score_breakdown,
        };
    });

    mergedResults.sort((a, b) => b.score - a.score);

    res.status(200).json({
        success: true,
        count: mergedResults.length,
        matches: mergedResults,
    });
};

module.exports = { searchJobs, smartMatch };
