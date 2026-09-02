const User = require('../models/User');

const publicFavorite = favorite => ({
  jobId: favorite.jobId,
  title: favorite.title,
  company: favorite.company,
  location: favorite.location,
  applyLink: favorite.applyLink,
  score: favorite.score,
  baseline_score: favorite.baseline_score,
  improved_score: favorite.improved_score,
  score_breakdown: favorite.score_breakdown,
  savedAt: favorite.savedAt,
});

const listFavorites = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('favorites').lean();
    return res.status(200).json({ success: true, favorites: (user?.favorites || []).map(publicFavorite) });
  } catch (error) {
    console.error('listFavorites error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load favorite jobs.' });
  }
};

const addFavorite = async (req, res) => {
  const job = req.body || {};
  if (!job.jobId || !job.title) return res.status(400).json({ success: false, message: 'A job id and title are required.' });
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    const existing = user.favorites.find(favorite => favorite.jobId === String(job.jobId));
    if (existing) return res.status(200).json({ success: true, favorite: publicFavorite(existing), alreadySaved: true });
    user.favorites.push({
      jobId: String(job.jobId), title: job.title, company: job.company || 'N/A', location: job.location || 'N/A',
      applyLink: job.applyLink || '', score: job.score, baseline_score: job.baseline_score,
      improved_score: job.improved_score, score_breakdown: job.score_breakdown,
    });
    await user.save();
    return res.status(201).json({ success: true, favorite: publicFavorite(user.favorites[user.favorites.length - 1]) });
  } catch (error) {
    console.error('addFavorite error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to save favorite job.' });
  }
};

const removeFavorite = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    const before = user.favorites.length;
    user.favorites = user.favorites.filter(favorite => favorite.jobId !== String(req.params.jobId));
    if (user.favorites.length === before) return res.status(404).json({ success: false, message: 'Favorite job not found.' });
    await user.save();
    return res.status(200).json({ success: true, jobId: String(req.params.jobId) });
  } catch (error) {
    console.error('removeFavorite error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to remove favorite job.' });
  }
};

module.exports = { listFavorites, addFavorite, removeFavorite };
