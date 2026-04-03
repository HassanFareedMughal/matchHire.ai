const express = require("express");
const router = express.Router();

const { uploadResume } = require("../controllers/uploadController");

// POST /api/upload-resume
router.post("/", uploadResume);

module.exports = router;
