const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true },
  password: { type: String }, // hashed password (optional for OAuth users)
  googleId: { type: String, index: true, sparse: true },
  avatar: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
