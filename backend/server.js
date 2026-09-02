require("dotenv").config();
const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");       // MongoDB Atlas connection

const jobsRouter = require("./routes/jobs");
const matchRouter = require("./routes/match");
const uploadRouter = require("./routes/upload");
const authRouter = require("./routes/auth");
const favoritesRouter = require("./routes/favorites");
const profileRouter = require("./routes/profile");
const resumeRouter = require("./routes/resume");

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/jobs", jobsRouter);
app.use("/api/match", matchRouter);
app.use("/api/upload-resume", uploadRouter);
app.use('/api/auth', authRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/profile', profileRouter);
app.use('/api/resume', resumeRouter);

app.get("/", (req, res) => {
    res.send("matchHire.ai backend running 🚀");
});

const PORT = process.env.PORT || 5000;

// Connect to MongoDB Atlas first, then start the server
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
});
