const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { getJobsCached, checkCacheStatus } = require("../services/jobService");

// ---------------------------------------------------------------------------
// GET /api/jobs/status?keyword=...&location=...
// Returns cache/db/refresh status for a given keyword+location key
// ---------------------------------------------------------------------------
const statusJobs = async (req, res) => {
    const { keyword = "developer", location = "remote" } = req.query;

    try {
        const status = await checkCacheStatus(keyword, location);
        return res.status(200).json({ success: true, status });
    } catch (err) {
        console.error('statusJobs error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to check status.' });
    }
};

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
    // _idx is a numeric index added so Python can echo it back unchanged.
    // This lets us merge AI results back with full job data even when
    // multiple jobs share the same title (e.g. two "Software Engineer" listings).
    const jobsForPython = jobs.map((job, index) => ({
        _idx: index,
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

    // Always prefer the project AI-engine virtual environment when it exists.
    // This prevents the backend from falling back to the incompatible global
    // Python installation that does not match the project's tested runtime.
    const venvPythonExecutable =
        process.platform === "win32"
            ? path.resolve(__dirname, "../../ai-engine/.venv/Scripts/python.exe")
            : path.resolve(__dirname, "../../ai-engine/.venv/bin/python");

    const pythonExecutable =
        fs.existsSync(venvPythonExecutable)
            ? venvPythonExecutable
            : (process.env.PYTHON_PATH || (process.platform === "win32" ? "py" : "python3"));

    const pythonResult = await new Promise((resolve, reject) => {
        const python = spawn(pythonExecutable, [scriptPath]);

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
    // Key the map by _idx (unique numeric index) instead of title.
    // This is safe even when multiple jobs share the same title string.
    const jobMap = {};
    jobsForPython.forEach((job) => { jobMap[job._idx] = job; });

    const mergedResults = pythonResult.map((match) => {
        const original = jobMap[match._idx] ?? {};
        const semanticSimilarity = match.semantic_similarity ?? null;
        const semanticError = match.semantic_error ?? null;

        return {
            title: match.title,
            company: original.company || "N/A",
            location: original.location || "N/A",
            applyLink: original.applyLink || "N/A",
            // Preserve existing baseline score (FYP-I)
            score: match.score,
            semantic_similarity: semanticSimilarity,
            semantic_error: semanticError,
            score_breakdown: {
                ...(match.score_breakdown || {}),
                semantic_similarity: semanticSimilarity,
                semantic_error: semanticError,
            },
            // FYP-II Phase 3: improved score and components (optional fields)
            baseline_score: match.baseline_score ?? match.score,
            improved_score: match.improved_score ?? null,
            improved_score_components: match.improved_score_components ?? null,
        };
    });

    mergedResults.sort((a, b) => b.score - a.score);

    res.status(200).json({
        success: true,
        count: mergedResults.length,
        matches: mergedResults,
        user: req.user ? { id: req.user._id, email: req.user.email } : null,
    });
};

module.exports = { searchJobs, smartMatch, statusJobs };
