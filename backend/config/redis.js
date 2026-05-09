const Redis = require("ioredis");

/**
 * Redis client for Upstash (cloud Redis).
 *
 * Upstash provides a rediss:// URL (with TLS). ioredis handles TLS
 * automatically when the URL starts with "rediss://".
 *
 * Set REDIS_URL in your .env to the URL from your Upstash dashboard.
 * Example: rediss://:your_password@your-upstash-host.upstash.io:6380
 */
const redisClient = new Redis(process.env.REDIS_URL, {
    // Required for Upstash TLS connections
    tls: {
        rejectUnauthorized: false,
    },
    // Retry strategy: wait 1 second between retries, give up after 3 attempts
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
        if (times > 3) {
            console.error("❌ Redis: too many failed retries. Giving up.");
            return null; // stop retrying
        }
        return Math.min(times * 100, 1000); // wait 100ms, 200ms, up to 1000ms
    },
});

redisClient.on("connect", () => {
    console.log("✅ Redis connected (Upstash)");
});

redisClient.on("error", (err) => {
    console.error("❌ Redis error:", err.message);
});

module.exports = redisClient;
