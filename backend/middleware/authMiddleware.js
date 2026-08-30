const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Enforce JWT authentication. Use same dev fallback secret used by authController.
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Missing or invalid Authorization header.' });
  }

  const token = authHeader.split(' ')[1];
  const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'dev_jwt_secret');
  if (!jwtSecret) return res.status(500).json({ success: false, message: 'Server misconfiguration.' });

  try {
    const decoded = jwt.verify(token, jwtSecret);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ success: false, message: 'User not found.' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

module.exports = authMiddleware;
