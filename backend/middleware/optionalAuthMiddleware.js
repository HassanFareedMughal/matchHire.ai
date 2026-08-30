const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Try to authenticate from Authorization header but do not reject if missing/invalid.
// Use the same JWT secret fallback as authController to allow local/dev tokens.
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();
  const token = authHeader.split(' ')[1];
  const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'dev_jwt_secret');
  if (!jwtSecret) return next();
  try {
    const decoded = jwt.verify(token, jwtSecret);
    const user = await User.findById(decoded.id).select('-password');
    if (user) req.user = user;
  } catch (err) {
    // ignore errors — this is optional auth
  }
  return next();
};

module.exports = optionalAuth;
