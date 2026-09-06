const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { generateCoverLetter } = require('../controllers/coverLetterController');

const router = express.Router();
router.use(authMiddleware);
router.post('/generate', generateCoverLetter);

module.exports = router;