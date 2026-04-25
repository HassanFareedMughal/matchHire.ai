const { spawn } = require("child_process");
const path = require("path");

/**
 * POST /api/match
 *
 * Expects a JSON body:
 * {
 *   "resume":   "resume text...",
 *   "jobs":     [ { "title": "...", "description": "..." }, ... ]
 * }
 *
 * Spawns the Python hybrid-scoring engine, sends input via stdin,
 * reads the JSON result from stdout, and returns top 5 matches with
 * full score_breakdown for frontend transparency.
 */
const getMatchedJobs = (req, res) => {
    const { resume, jobs } = req.body;

    // Basic validation
    if (!resume || !jobs || !Array.isArray(jobs) || jobs.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Please provide 'resume' (string) and 'jobs' (array).",
        });
    }

    // Absolute path to the Python script
    const scriptPath = path.join(__dirname, "../../ai-engine/matcher.py");

    // Spawn the Python process
    const python = spawn("python", [scriptPath]);

    let outputData = "";  // collects stdout from Python
    let errorData  = "";  // collects stderr from Python (for debugging)

    // Send the input JSON to Python's stdin, then close the stream
    python.stdin.write(JSON.stringify({ resume, jobs }));
    python.stdin.end();

    // Accumulate Python's stdout output
    python.stdout.on("data", (chunk) => {
        outputData += chunk.toString();
    });

    // Accumulate any Python errors (e.g. import errors, tracebacks)
    python.stderr.on("data", (chunk) => {
        errorData += chunk.toString();
    });

    // When the Python process finishes, parse the result and respond
    python.on("close", (exitCode) => {
        if (exitCode !== 0) {
            console.error("Python script error:\n", errorData);
            return res.status(500).json({
                success: false,
                message: "AI engine failed to process the request.",
                debug:   errorData,
            });
        }

        try {
            const matches = JSON.parse(outputData);

            // If Python returned an error object
            if (matches.error) {
                return res.status(500).json({ success: false, message: matches.error });
            }

            res.status(200).json({
                success: true,
                count:   matches.length,
                matches,   // each item includes score + score_breakdown
            });
        } catch (parseError) {
            console.error("Failed to parse Python output:", outputData);
            res.status(500).json({
                success: false,
                message: "Could not parse AI engine response.",
            });
        }
    });
};

module.exports = { getMatchedJobs };
