const axios = require("axios");
const Job = require("../models/Job");
const redisClient = require("../config/redis");

/**
 * Cache TTL in seconds — how long Redis holds a cached result.
 * Defaults to 1 hour (3600s). Override via REDIS_TTL_SECONDS in .env
 */
const CACHE_TTL = parseInt(process.env.REDIS_TTL_SECONDS) || 3600;

/**
 * Build a consistent Redis cache key for a keyword + location pair.
 * Format:  jobs:react:remote
 */
const buildCacheKey = (keyword, location) =>
    `jobs:${keyword.toLowerCase().trim()}:${location.toLowerCase().trim()}`;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetch raw jobs from the JSearch RapidAPI.
 * Returns an array of simplified job objects.
 */
const fetchFromJSearch = async (keyword, location) => {
    const response = await axios.get("https://jsearch.p.rapidapi.com/search", {
        params: {
            query: `${keyword} in ${location}`,
            page: "1",
            num_pages: "1",
        },
        headers: {
            "x-rapidapi-key": process.env.RAPIDAPI_KEY,
            "x-rapidapi-host": "jsearch.p.rapidapi.com",
        },
    });

    const rawJobs = response.data.data || [];

    // Normalize to our internal shape
    return rawJobs.map((job) => ({
        title: job.job_title,
        company: job.employer_name,
        location_str: job.job_city
            ? `${job.job_city}, ${job.job_country}`
            : job.job_country,
        applyLink: job.job_apply_link || "",
        description: job.job_description || "",
    }));
};

/**
 * Save an array of normalized jobs to MongoDB under a keyword + location key.
 */
const saveToMongo = async (jobs, keyword, location) => {
    const kw = keyword.toLowerCase().trim();
    const loc = location.toLowerCase().trim();

    const docs = jobs.map((job) => ({
        keyword: kw,
        location: loc,
        title: job.title,
        company: job.company,
        location_str: job.location_str,
        applyLink: job.applyLink,
        description: job.description,
        fetchedAt: new Date(),
    }));

    await Job.insertMany(docs, { ordered: false }); // ordered:false = don't stop on dup errors
    console.log(`💾 MongoDB: saved ${docs.length} jobs for "${kw}:${loc}"`);
};

/**
 * Save a jobs array to Redis with TTL.
 */
const saveToRedis = async (cacheKey, jobs) => {
    await redisClient.set(cacheKey, JSON.stringify(jobs), "EX", CACHE_TTL);
    console.log(`⚡ Redis: cached ${jobs.length} jobs → key "${cacheKey}" (TTL: ${CACHE_TTL}s)`);
};

// ---------------------------------------------------------------------------
// Main exported function — the 3-tier lookup
// ---------------------------------------------------------------------------

/**
 * getJobsCached(keyword, location)
 *
 * Tier 1 → Redis cache (fastest, ~1ms)
 * Tier 2 → MongoDB Atlas (fast, ~50ms)
 * Tier 3 → JSearch API (slowest, ~1-3s) — only if both caches miss
 *
 * Always returns an array of job objects in a consistent shape:
 * [ { title, company, location_str, applyLink, description }, ... ]
 */
const getJobsCached = async (keyword, location) => {
    const cacheKey = buildCacheKey(keyword, location);
    const kw = keyword.toLowerCase().trim();
    const loc = location.toLowerCase().trim();

    // ── TIER 1: Redis ──────────────────────────────────────────────────────
    try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
            console.log(`✅ Cache HIT (Redis) for key "${cacheKey}"`);
            return JSON.parse(cached);
        }
    } catch (redisErr) {
        // Don't crash the request if Redis is temporarily unavailable
        console.warn("⚠️  Redis read failed, falling through to MongoDB:", redisErr.message);
    }

    console.log(`❌ Cache MISS (Redis) for key "${cacheKey}" — checking MongoDB...`);

    // ── TIER 2: MongoDB ────────────────────────────────────────────────────
    const dbJobs = await Job.find({ keyword: kw, location: loc }).lean();

    if (dbJobs.length > 0) {
        console.log(`✅ DB HIT (MongoDB): found ${dbJobs.length} jobs — caching in Redis...`);

        // Map Mongo docs back to our normalized shape
        const normalized = dbJobs.map((j) => ({
            title: j.title,
            company: j.company,
            location_str: j.location_str,
            applyLink: j.applyLink,
            description: j.description,
        }));

        // Back-fill Redis so the next request is instant
        await saveToRedis(cacheKey, normalized);
        return normalized;
    }

    console.log(`❌ DB MISS (MongoDB) — fetching from JSearch API...`);

    // ── TIER 3: JSearch API ────────────────────────────────────────────────
    const apiJobs = await fetchFromJSearch(keyword, location);

    if (apiJobs.length === 0) {
        return []; // No results found anywhere
    }

    // Persist to both layers for future requests
    await saveToMongo(apiJobs, keyword, location);
    await saveToRedis(cacheKey, apiJobs);

    return apiJobs;
};

module.exports = { getJobsCached };
