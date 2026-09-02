const User = require('../models/User');

const publicProfile = user => ({
  id: user._id,
  name: user.name,
  email: user.email,
  avatar: user.avatar,
  provider: user.googleId ? 'Google' : 'Email',
});

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    return res.status(200).json({ success: true, user: publicProfile(user) });
  } catch (error) {
    console.error('getProfile error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load profile.' });
  }
};

const updateProfile = async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (name.length < 2 || name.length > 100) return res.status(400).json({ success: false, message: 'Name must be between 2 and 100 characters.' });
  try {
    const user = await User.findByIdAndUpdate(req.user._id, { $set: { name } }, { new: true, runValidators: true }).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    return res.status(200).json({ success: true, user: publicProfile(user) });
  } catch (error) {
    console.error('updateProfile error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
};

module.exports = { getProfile, updateProfile };
