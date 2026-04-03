const express = require("express");
const router = express.Router();

const { smartMatch } = require("../controllers/jobController");

// POST /api/match
router.post("/", smartMatch);

module.exports = router;
