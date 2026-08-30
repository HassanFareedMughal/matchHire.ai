const mongoose = require("mongoose");

/**
 * Job Schema
 *
 * Stores jobs fetched from JSearch API in MongoDB Atlas.
 * Documents are grouped by the (keyword + location) pair used
 * to fetch them, so we can look up "all React jobs in remote"
 * without hitting the external API again.
 */
const jobSchema = new mongoose.Schema({
    // The search params that produced this job — used for lookup
    keyword: {
        type: String,
        required: true,
        lowercase: true,   // always stored in lowercase for consistent matching
        trim: true,
    },
    location: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
    },

    // Unique identifier from the JSearch API (job_id field).
    // Used to prevent duplicate documents when the same search is run again.
    jobId: {
        type: String,
        default: "",
    },

    // Job details returned by JSearch API
    title:       { type: String, required: true },
    company:     { type: String, default: "N/A" },
    location_str: { type: String, default: "N/A" }, // human-readable "City, Country"
    applyLink:   { type: String, default: "" },
    description: { type: String, default: "" },     // used by AI matcher for TF-IDF

    // Timestamp of when this job was fetched — useful for future cache invalidation
    fetchedAt: {
        type: Date,
        default: Date.now,
    },
});

/**
 * Compound index on keyword + location.
 * This makes the MongoDB lookup for "all jobs for this query" very fast.
 */
jobSchema.index({ keyword: 1, location: 1 });

/**
 * Unique compound index on jobId + keyword + location.
 *
 * Guarantees: the same JSearch job_id is never stored more than once
 * for the same search term, even if the Redis TTL expires and the
 * JSearch API is called again. The same physical job CAN appear under
 * different keyword/location searches — that is intentional.
 *
 * sparse: true means documents with jobId: "" do not participate in
 * the uniqueness check (rare edge case where JSearch omits job_id).
 */
jobSchema.index(
    { jobId: 1, keyword: 1, location: 1 },
    { unique: true, sparse: true }
);

module.exports = mongoose.model("Job", jobSchema);
