const express = require("express");
const router = express.Router();

const { uploadResume } = require("../controllers/uploadController");
const authMiddleware = require('../middleware/authMiddleware');

// POST /api/upload-resume (requires authentication)
router.post("/", authMiddleware, uploadResume);

module.exports = router;
