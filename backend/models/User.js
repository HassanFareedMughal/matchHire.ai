const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true },
  password: { type: String }, // hashed password (optional for OAuth users)
  googleId: { type: String, index: true, sparse: true },
  avatar: { type: String },
  resumeText: { type: String, default: '' },
  resumeFileName: { type: String, default: '' },
  resumeUpdatedAt: { type: Date },
  favorites: [{
    jobId: { type: String, required: true },
    title: { type: String, required: true },
    company: { type: String, default: "N/A" },
    location: { type: String, default: "N/A" },
    applyLink: { type: String, default: "" },
    score: { type: Number },
    baseline_score: { type: Number },
    improved_score: { type: Number },
    score_breakdown: { type: mongoose.Schema.Types.Mixed },
    savedAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
