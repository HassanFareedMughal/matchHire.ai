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
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`✅ MongoDB connected: ${conn.connection.host}`);
    } catch (error) {
        console.error("❌ MongoDB connection failed:", error.message);
        // Exit the process if the DB connection fails — no point running without storage
        process.exit(1);
    }
};

module.exports = connectDB;
