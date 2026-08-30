const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const register = async (req, res) => {
  const { name, email, password } = req.body || {};
  const errors = {};
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const pwdRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/; // min 8 chars, letters+numbers

  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    errors.name = 'Name is required (2-100 characters).';
  }
  if (!email || !emailRegex.test(email)) {
    errors.email = 'A valid email address is required.';
  }
  if (!password || !pwdRegex.test(password)) {
    errors.password = 'Password must be at least 8 characters and include letters and numbers.';
  }
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ success: false, message: 'Validation failed.', errors });
  }

  try {
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(409).json({ success: false, message: 'Email already registered.' });

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const user = await User.create({ name: name.trim(), email: email.toLowerCase().trim(), password: hash });

    const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'dev_jwt_secret');
    if (!jwtSecret) {
      console.error('JWT_SECRET is not set.');
      return res.status(500).json({ success: false, message: 'Server misconfiguration.' });
    }
    const token = jwt.sign({ id: user._id, email: user.email }, jwtSecret, { expiresIn: process.env.JWT_EXPIRES || '7d' });

    return res.status(201).json({ success: true, user: { id: user._id, name: user.name, email: user.email }, token });
  } catch (err) {
    console.error('register error:', err.message);
    return res.status(500).json({ success: false, message: 'Registration failed.' });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body || {};
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required.' });
  if (!emailRegex.test(email)) return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !user.password) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    const jwtSecret2 = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'dev_jwt_secret');
    if (!jwtSecret2) {
      console.error('JWT_SECRET is not set.');
      return res.status(500).json({ success: false, message: 'Server misconfiguration.' });
    }
    const token = jwt.sign({ id: user._id, email: user.email }, jwtSecret2, { expiresIn: process.env.JWT_EXPIRES || '7d' });

    return res.status(200).json({ success: true, user: { id: user._id, name: user.name, email: user.email }, token });
  } catch (err) {
    console.error('login error:', err.message);
    return res.status(500).json({ success: false, message: 'Login failed.' });
  }
};

const { OAuth2Client } = require('google-auth-library');

// POST /api/auth/google
const googleAuth = async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ success: false, message: 'Missing Google credential.' });

  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  if (!googleClientId) {
    console.error('GOOGLE_CLIENT_ID not set in server environment');
    return res.status(500).json({ success: false, message: 'Server misconfiguration.' });
  }

  try {
    const client = new OAuth2Client(googleClientId);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: googleClientId });
    const payload = ticket.getPayload();
    const email = payload.email;
    if (!email) return res.status(400).json({ success: false, message: 'Google account has no email.' });

    // Find existing user by email
    let user = await User.findOne({ email: email.toLowerCase().trim() });

    if (user) {
      // If the user exists and has a local password but no googleId, do not silently link — require explicit linking
      if (!user.googleId && user.password) {
        console.info('Google sign-in attempt for email already registered with local password:', email);
        return res.status(409).json({ success: false, message: 'An account with this email already exists. Please log in with your email/password and link Google from account settings.' });
      }
      // If user exists and has googleId recorded, ensure it matches payload.sub
      if (user.googleId && user.googleId !== payload.sub) {
        console.warn('Google sub does not match stored googleId for user:', email);
        return res.status(409).json({ success: false, message: 'Google account mismatch.' });
      }
      // If user exists and is an OAuth user, update avatar/name if missing
      if (!user.googleId) user.googleId = payload.sub;
      if (!user.avatar && payload.picture) user.avatar = payload.picture;
      if (!user.name && payload.name) user.name = payload.name;
      await user.save();
    } else {
      // Create a new user (no password)
      user = await User.create({
        name: payload.name || 'Google User',
        email: email.toLowerCase().trim(),
        googleId: payload.sub,
        avatar: payload.picture || undefined,
      });
    }

    const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'dev_jwt_secret');
    if (!jwtSecret) return res.status(500).json({ success: false, message: 'Server misconfiguration.' });

    const token = jwt.sign({ id: user._id, email: user.email }, jwtSecret, { expiresIn: process.env.JWT_EXPIRES || '7d' });
    return res.status(200).json({ success: true, user: { id: user._id, name: user.name, email: user.email, avatar: user.avatar }, token });
  } catch (err) {
    console.error('googleAuth error:', err.message);
    return res.status(401).json({ success: false, message: 'Invalid Google credential.' });
  }
};

module.exports = { register, login, googleAuth };
