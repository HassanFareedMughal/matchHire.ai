const User = require('../models/User');

const getResume = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('resumeText resumeFileName resumeUpdatedAt');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    return res.status(200).json({
      success: true,
      resume: {
        text: user.resumeText || '',
        fileName: user.resumeFileName || '',
        updatedAt: user.resumeUpdatedAt || null,
      },
    });
  } catch (error) {
    console.error('getResume error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load resume.' });
  }
};

module.exports = { getResume };
