const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { listFavorites, addFavorite, removeFavorite } = require('../controllers/favoriteController');

const router = express.Router();
router.use(authMiddleware);
router.get('/', listFavorites);
router.post('/', addFavorite);
router.delete('/:jobId', removeFavorite);

module.exports = router;
