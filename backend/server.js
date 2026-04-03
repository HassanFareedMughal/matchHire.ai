require("dotenv").config();
const express = require("express");
const cors = require("cors");

const jobsRouter = require("./routes/jobs");
const matchRouter = require("./routes/match");
const uploadRouter = require("./routes/upload");

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/jobs", jobsRouter);
app.use("/api/match", matchRouter);
app.use("/api/upload-resume", uploadRouter);

app.get("/", (req, res) => {
    res.send("matchHire.ai backend running 🚀");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
