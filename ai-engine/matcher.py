"""
matcher.py — matchHire.ai AI Engine
Reads input from stdin as JSON, runs TF-IDF matching, outputs results as JSON to stdout.
Node.js communicates with this script via child_process (stdin → stdout).

Input JSON shape (sent by Node.js):
{
  "resume": "resume text here...",
  "jobs": [
    { "title": "Job Title", "description": "Job description text..." },
    ...
  ]
}

Output JSON shape (read by Node.js):
[
  { "title": "Job Title", "description": "...", "score": 0.31 },
  ...
]
"""

import sys
import json
import re
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# ---------------------------------------------------------------------------
# Stopwords — common words that carry no matching signal
# ---------------------------------------------------------------------------
STOPWORDS = {
    "i", "me", "my", "we", "our", "you", "your", "he", "she", "it", "they",
    "them", "this", "that", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "a", "an", "the", "and", "or", "but", "in",
    "on", "at", "to", "for", "of", "with", "by", "from", "up", "about",
    "as", "into", "through", "during", "then", "than", "so", "if", "while",
}


def preprocess(text: str) -> str:
    """Lowercase, strip non-alpha chars, remove stopwords."""
    text = text.lower()
    text = re.sub(r"[^a-z\s]", "", text)
    tokens = [w for w in text.split() if w not in STOPWORDS]
    return " ".join(tokens)


def match_jobs(resume: str, job_descriptions: list, top_n: int = 5) -> list:
    """Return top N jobs ranked by TF-IDF cosine similarity to the resume."""
    if not job_descriptions:
        return []

    corpus = [preprocess(resume)] + [preprocess(j["description"]) for j in job_descriptions]

    vectorizer = TfidfVectorizer(sublinear_tf=True, min_df=1)
    tfidf_matrix = vectorizer.fit_transform(corpus)

    scores = cosine_similarity(tfidf_matrix[0], tfidf_matrix[1:]).flatten()

    results = [
        {
            "title": job_descriptions[i]["title"],
            "description": job_descriptions[i]["description"],
            "score": round(float(scores[i]), 4),
        }
        for i in range(len(job_descriptions))
    ]

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:top_n]


# ---------------------------------------------------------------------------
# Entry point — read JSON from stdin, write JSON to stdout
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    try:
        # Node.js writes JSON to Python's stdin
        raw_input = sys.stdin.read()
        data = json.loads(raw_input)

        resume = data.get("resume", "")
        jobs = data.get("jobs", [])

        top_matches = match_jobs(resume, jobs, top_n=5)

        # Write result JSON to stdout — Node.js will read this
        print(json.dumps(top_matches))

    except Exception as e:
        # On error, output a JSON error object so Node.js can handle it cleanly
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
