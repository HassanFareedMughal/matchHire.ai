const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { getResume } = require('../controllers/resumeController');

const router = express.Router();
router.use(authMiddleware);
router.get('/', getResume);

module.exports = router;
