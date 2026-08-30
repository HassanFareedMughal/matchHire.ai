const mongoose = require("mongoose");

/**
 * connectDB()
 * Connects Mongoose to your MongoDB Atlas cluster.
 * The connection string comes from MONGO_URI in your .env file.
 *
 * Call this once in server.js before starting the Express listener.
 */
const connectDB = async () => {
    try {
        if (!process.env.MONGO_URI) {
            console.warn('⚠️ MONGO_URI not set — skipping MongoDB connection for smoke tests.');
            return;
        }
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`✅ MongoDB connected: ${conn.connection.host}`);
    } catch (error) {
        console.error("❌ MongoDB connection failed:", error.message);
        // For smoke tests, do not exit the process; surface the error and continue.
        console.error("Continuing without MongoDB for local smoke test.");
    }
};

module.exports = connectDB;
