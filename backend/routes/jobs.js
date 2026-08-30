const express = require("express");
const router = express.Router();

const { searchJobs, smartMatch } = require("../controllers/jobController");
const optionalAuth = require('../middleware/optionalAuthMiddleware');

// GET /api/jobs?keyword=...&location=...
router.get("/", searchJobs);

// GET /api/jobs/status?keyword=...&location=...
router.get("/status", require("../controllers/jobController").statusJobs);

// POST /api/jobs/smart-match
router.post("/smart-match", optionalAuth, smartMatch);

module.exports = router;
