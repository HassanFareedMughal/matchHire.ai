const express = require("express");
const router = express.Router();

const { searchJobs, smartMatch } = require("../controllers/jobController");

// GET /api/jobs?keyword=...&location=...
router.get("/", searchJobs);

// POST /api/jobs/smart-match
router.post("/smart-match", smartMatch);

module.exports = router;
