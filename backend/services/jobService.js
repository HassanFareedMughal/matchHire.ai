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
    if (!process.env.RAPIDAPI_KEY) {
        console.error('JSearch error: RAPIDAPI_KEY is not set in environment.');
        return [];
    }

    let response;
    try {
        response = await axios.get("https://jsearch.p.rapidapi.com/search", {
            params: {
                query: `${keyword} in ${location}`,
                page: "1",
                num_pages: "1",
            },
            headers: {
                "x-rapidapi-key": process.env.RAPIDAPI_KEY,
                "x-rapidapi-host": "jsearch.p.rapidapi.com",
            },
            timeout: 10000,
        });
    } catch (err) {
        if (err.response) {
            // Server responded with a non-2xx status
            console.error(`JSearch API error: status=${err.response.status}`, err.response.data || err.message);
        } else if (err.request) {
            // No response received
            console.error('JSearch API no response received:', err.message);
        } else {
            // Other errors
            console.error('JSearch request setup error:', err.message);
        }
        return [];
    }

    const rawJobs = (response && response.data && response.data.data) ? response.data.data : [];

    // Normalize to our internal shape
    return rawJobs.map((job) => ({
        jobId:       job.job_id || "",          // JSearch unique identifier — used for dedup
        title:       job.job_title,
        company:     job.employer_name,
        location_str: job.job_city
            ? `${job.job_city}, ${job.job_country}`
            : job.job_country,
        applyLink:   job.job_apply_link || "",
        description: job.job_description || "",
    }));
};

/**
 * Save an array of normalized jobs to MongoDB under a keyword + location key.
 */
const saveToMongo = async (jobs, keyword, location) => {
    const kw  = keyword.toLowerCase().trim();
    const loc = location.toLowerCase().trim();

    // Build upsert operations — one per job.
    // Filter key: { jobId, keyword, location } — this is what the unique index enforces.
    // $setOnInsert: only writes the document if it is new (insert), never on update.
    // This means a re-run of the same search is a no-op for already-stored jobs.
    const ops = jobs
        .filter((job) => job.jobId) // skip any jobs with an empty jobId (can't dedup them safely)
        .map((job) => ({
            updateOne: {
                filter: { jobId: job.jobId, keyword: kw, location: loc },
                update: {
                    $setOnInsert: {
                        jobId:        job.jobId,
                        keyword:      kw,
                        location:     loc,
                        title:        job.title,
                        company:      job.company,
                        location_str: job.location_str,
                        applyLink:    job.applyLink,
                        description:  job.description,
                        fetchedAt:    new Date(),
                    },
                },
                upsert: true,
            },
        }));

    if (ops.length === 0) {
        console.warn("⚠️  MongoDB: no jobs with a valid jobId to save.");
        return;
    }

    const result = await Job.bulkWrite(ops, { ordered: false });
    console.log(
        `💾 MongoDB: ${result.upsertedCount} new / ${result.matchedCount} already-stored` +
        ` jobs for "${kw}:${loc}"`
    );
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
    // Wrapped in try/catch: a transient Atlas disconnect after startup
    // (e.g. idle connection timeout) must not crash the request — fall
    // through to the JSearch API instead.
    let dbJobs = [];
    try {
        dbJobs = await Job.find({ keyword: kw, location: loc }).lean();
    } catch (dbErr) {
        console.warn("⚠️  MongoDB read failed, falling through to JSearch API:", dbErr.message);
    }

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
    // Use a short timeout for the live fetch so slow external calls don't
    // block the HTTP response. If the timed fetch doesn't return in time,
    // trigger a background refresh (non-blocking) and return quickly.
    const LOCK_KEY = `${cacheKey}:lock`;

    // If another process is already fetching, avoid duplicate work.
    try {
        const lockSet = await redisClient.set(LOCK_KEY, "1", "NX", "EX", 30);
        if (!lockSet) {
            console.log(`Another fetch in progress for ${cacheKey}; returning empty result quickly.`);
            return [];
        }
    } catch (e) {
        console.warn("Redis lock failed; continuing without lock:", e.message);
    }

    const fetchPromise = fetchFromJSearch(keyword, location);
    // Wait up to 2500ms for the external API to respond synchronously
    const TIMEOUT_MS = 1000; // 1s synchronous wait for external API
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));

    let apiJobs = await Promise.race([fetchPromise, timeoutPromise]);

    // If apiJobs is null, the fetch timed out — kick off background refresh
    if (apiJobs == null) {
        console.log(`JSearch fetch timed out after ${TIMEOUT_MS}ms for ${cacheKey}; scheduling background refresh.`);

        // Background refresh — do not await
        (async () => {
            try {
                const fresh = await fetchFromJSearch(keyword, location);
                if (fresh && fresh.length > 0) {
                    await saveToMongo(fresh, keyword, location);
                    await saveToRedis(cacheKey, fresh);
                }
            } catch (err) {
                console.error("Background JSearch refresh failed:", err.message || err);
            } finally {
                try { await redisClient.del(LOCK_KEY); } catch (_) {}
            }
        })();

        // Release lock (best-effort)
        try { await redisClient.del(LOCK_KEY); } catch (_) {}

        return [];
    }

    // Fetch completed within timeout — persist and return
    if (apiJobs.length === 0) {
        try { await redisClient.del(LOCK_KEY); } catch (_) {}
        return []; // No results found anywhere
    }

    try {
        await saveToMongo(apiJobs, keyword, location);
        await saveToRedis(cacheKey, apiJobs);
    } finally {
        try { await redisClient.del(LOCK_KEY); } catch (_) {}
    }

    return apiJobs;
};

/**
 * checkCacheStatus(keyword, location)
 * Returns an object describing whether Redis/Mongo have data and whether a
 * background refresh is in progress (lock key).
 */
const checkCacheStatus = async (keyword, location) => {
    const cacheKey = buildCacheKey(keyword, location);
    const kw = keyword.toLowerCase().trim();
    const loc = location.toLowerCase().trim();

    let cacheHit = false;
    let dbHit = false;
    let refreshInProgress = false;

    try {
        const cached = await redisClient.get(cacheKey);
        cacheHit = !!cached;
    } catch (e) {
        console.warn('Redis read failed while checking status:', e.message);
    }

    try {
        const count = await Job.countDocuments({ keyword: kw, location: loc });
        dbHit = count > 0;
    } catch (e) {
        console.warn('MongoDB read failed while checking status:', e.message);
    }

    try {
        const lock = await redisClient.get(`${cacheKey}:lock`);
        refreshInProgress = !!lock;
    } catch (e) {
        console.warn('Redis read failed while checking lock status:', e.message);
    }

    return { cacheKey, cacheHit, dbHit, refreshInProgress };
};

module.exports = { getJobsCached, checkCacheStatus };
