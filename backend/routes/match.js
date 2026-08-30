const express = require("express");
const router = express.Router();

const { smartMatch } = require("../controllers/jobController");
const optionalAuth = require('../middleware/optionalAuthMiddleware');

// POST /api/match
router.post("/", optionalAuth, smartMatch);

module.exports = router;
