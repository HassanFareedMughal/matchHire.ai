"""
matcher.py — matchHire.ai AI Engine (Hybrid Scoring v3 — NER-Enhanced)

Reads input from stdin as JSON, runs a multi-signal hybrid scoring pipeline
with NER-enhanced skill extraction, and outputs ranked job matches as JSON
to stdout.

Node.js communicates with this script via child_process (stdin → stdout).

=============================================================================
SKILL EXTRACTION PIPELINE (NER-Enhanced)
=============================================================================

The extraction layer now uses 3 complementary techniques:

  1. spaCy NER + Lemmatization
     ─────────────────────────
     - Process text through spaCy's en_core_web_sm pipeline to get:
       (a) Lemmatized tokens (e.g. "developing" → "develop")
       (b) Named-entity labels (PERSON, ORG, GPE, etc.)
     - NER is used to FILTER OUT noise: person names, company names,
       and locations are excluded from the skill search so they can't
       accidentally match keywords (e.g. "Java" the island vs "Java"
       the programming language IF it appears inside a GPE entity).

  2. spaCy PhraseMatcher (Dictionary-Based)
     ───────────────────────────────────────
     - The curated TECH_SKILLS dictionary is loaded into spaCy's
       PhraseMatcher, which does linguistically-aware matching.
     - This is more robust than raw regex: it respects token boundaries,
       handles punctuation attached to words, and matches multi-word
       phrases naturally.

  3. Fallback Regex + Synonym + Fuzzy Layer
     ──────────────────────────────────────
     - Any skills NOT already found by PhraseMatcher are searched again
       via regex and synonym expansion (same as v2).
     - RapidFuzz partial_ratio (threshold ≥ 85) catches typos and minor
       variations.

=============================================================================
SCORING MODEL (4 weighted signals — unchanged from v2)
=============================================================================

  final_score = 0.55 × skill_recall_score
              + 0.20 × tfidf_semantic_score
              + 0.15 × position_bonus_score
              + 0.10 × extra_skills_bonus

=============================================================================

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
  {
    "title": "Job Title",
    "description": "...",
    "score": 0.72,
    "score_breakdown": {
      "skill_recall":      0.80,
      "tfidf_semantic":    0.35,
      "position_bonus":    0.60,
      "extra_skills":      0.40,
      "matched_skills":    ["Python", "Django", "PostgreSQL"],
      "missing_skills":    ["Kubernetes", "Redis"],
      "extra_skills_list": ["FastAPI", "Docker", "CI/CD"]
    }
  },
  ...
]
"""

import sys
import json
import re
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from rapidfuzz import fuzz
try:
    import spacy
    from spacy.matcher import PhraseMatcher
    SPACY_AVAILABLE = True
except Exception:
    spacy = None
    PhraseMatcher = None
    SPACY_AVAILABLE = False

# ---------------------------------------------------------------------------
# Load spaCy model once at module level (avoids reloading per call)
# Attempts to auto-download the small English model if missing, and
# falls back to a blank English pipeline if download/load fails.
# ---------------------------------------------------------------------------
if SPACY_AVAILABLE:
    try:
        nlp = spacy.load("en_core_web_sm")
    except Exception:
        try:
            from spacy.cli import download as spacy_download
            spacy_download("en_core_web_sm")
            nlp = spacy.load("en_core_web_sm")
        except Exception:
            try:
                nlp = spacy.blank("en")
            except Exception:
                # If even this fails, mark spaCy unavailable at runtime
                nlp = None
                SPACY_AVAILABLE = False
else:
    nlp = None

# ---------------------------------------------------------------------------
# Curated tech-skills keyword list (used for PhraseMatcher + regex fallback)
# ---------------------------------------------------------------------------
TECH_SKILLS = {
    # Languages
    "python", "javascript", "typescript", "java", "c++", "c#", "ruby", "go",
    "golang", "rust", "kotlin", "swift", "scala", "php", "r", "matlab",
    "bash", "shell", "perl", "dart",
    # Web / Frontend
    "react", "angular", "vue", "nextjs", "nuxtjs", "svelte", "html", "css",
    "sass", "tailwind", "bootstrap", "webpack", "vite", "jquery",
    # Backend / Frameworks
    "nodejs", "express", "django", "flask", "fastapi", "spring", "rails",
    "laravel", "nestjs", "graphql", "rest", "grpc",
    # Databases
    "sql", "mysql", "postgresql", "postgres", "mongodb", "redis", "sqlite",
    "oracle", "cassandra", "dynamodb", "elasticsearch", "firebase",
    "neo4j", "supabase",
    # Cloud / DevOps
    "aws", "azure", "gcp", "docker", "kubernetes", "k8s", "terraform",
    "ansible", "jenkins", "github actions", "ci/cd", "linux", "nginx",
    "apache", "helm", "prometheus", "grafana", "vault",
    # ML / AI / Data
    "machine learning", "deep learning", "nlp", "computer vision",
    "tensorflow", "pytorch", "keras", "scikit-learn", "sklearn", "pandas",
    "numpy", "matplotlib", "huggingface", "openai", "langchain",
    "data analysis", "data science", "big data", "spark", "hadoop",
    "tableau", "power bi", "airflow", "dbt",
    # Architecture / Practices
    "microservices", "api", "rest api", "agile", "scrum", "kanban",
    "tdd", "unit testing", "integration testing", "ci/cd", "devops",
    "system design", "oop", "functional programming", "design patterns",
    # Mobile
    "android", "ios", "react native", "flutter", "xamarin",
    # Security
    "cybersecurity", "oauth", "jwt", "ssl", "penetration testing", "owasp",
    # Soft / Generic Tech
    "git", "github", "gitlab", "bitbucket", "jira", "confluence", "figma",
    "postman", "linux", "agile", "scrum",
}

# ---------------------------------------------------------------------------
# Synonym / abbreviation map
# ---------------------------------------------------------------------------
SYNONYMS = {
    "js":              "javascript",
    "ts":              "typescript",
    "py":              "python",
    "ml":              "machine learning",
    "dl":              "deep learning",
    "cv":              "computer vision",
    "k8s":             "kubernetes",
    "kube":            "kubernetes",
    "tf":              "tensorflow",
    "pt":              "pytorch",
    "pg":              "postgresql",
    "postgres":        "postgresql",
    "gcp":             "google cloud",
    "node":            "nodejs",
    "node.js":         "nodejs",
    "react.js":        "react",
    "vue.js":          "vue",
    "next.js":         "nextjs",
    "nuxt.js":         "nuxtjs",
    "sklearn":         "scikit-learn",
    "scikit learn":    "scikit-learn",
    "hf":              "huggingface",
    "nlp":             "natural language processing",
    "rest":            "rest api",
    "restful":         "rest api",
}

# Also build a reverse synonym map so canonical → all known aliases
REVERSE_SYNONYMS = {}
for alias, canonical in SYNONYMS.items():
    REVERSE_SYNONYMS.setdefault(canonical, set()).add(alias)

# ---------------------------------------------------------------------------
# NER entity labels to EXCLUDE from skill matching
# These entity spans are "masked" so the word Python in "Python Island"
# (tagged as GPE) doesn't count as a skill match.
# ---------------------------------------------------------------------------
NER_EXCLUDE_LABELS = {"PERSON", "ORG", "GPE", "LOC", "DATE", "MONEY", "CARDINAL"}

# ---------------------------------------------------------------------------
# Common stopwords for TF-IDF preprocessing
# ---------------------------------------------------------------------------
STOPWORDS = {
    "i", "me", "my", "we", "our", "you", "your", "he", "she", "it", "they",
    "them", "this", "that", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "a", "an", "the", "and", "or", "but", "in",
    "on", "at", "to", "for", "of", "with", "by", "from", "up", "about",
    "as", "into", "through", "during", "then", "than", "so", "if", "while",
}

FUZZY_THRESHOLD = 85
POSITION_CUTOFF = 0.30
POSITION_MULTIPLIER = 1.5

# ---------------------------------------------------------------------------
# Build the spaCy PhraseMatcher with our skill dictionary
# ---------------------------------------------------------------------------

def _build_phrase_matcher():
    """Build a spaCy PhraseMatcher preloaded with TECH_SKILLS + synonym keys.

    If spaCy is not available, return None so callers can fall back to
    regex-based extraction.
    """
    if not SPACY_AVAILABLE or nlp is None:
        return None

    matcher = PhraseMatcher(nlp.vocab, attr="LOWER")

    # Add all canonical skill names
    all_terms = set(TECH_SKILLS)
    # Also add synonym aliases so "node.js" or "k8s" get matched directly
    all_terms.update(SYNONYMS.keys())

    # Create spaCy Doc patterns for each term
    patterns = []
    for term in all_terms:
        try:
            doc = nlp.make_doc(term)
            patterns.append(doc)
        except Exception:
            pass

    if patterns:
        matcher.add("TECH_SKILL", patterns)

    return matcher

phrase_matcher = _build_phrase_matcher()


# ---------------------------------------------------------------------------
# Text utilities
# ---------------------------------------------------------------------------

def preprocess(text: str) -> str:
    """Lowercase, strip non-alpha chars, remove stopwords."""
    text = text.lower()
    text = re.sub(r"[^a-z\s]", " ", text)
    tokens = [w for w in text.split() if w not in STOPWORDS]
    return " ".join(tokens)


def lemmatize_text(text: str) -> str:
    """Use spaCy to lemmatize text for better TF-IDF matching."""
    if SPACY_AVAILABLE and nlp is not None:
        try:
            doc = nlp(text)
            return " ".join(
                token.lemma_.lower() for token in doc
                if not token.is_stop and not token.is_punct and not token.is_space
            )
        except Exception:
            pass
    # Fallback: basic preprocessing when spaCy is unavailable
    return preprocess(text)


def normalize_skill(skill: str) -> str:
    """Apply synonym map to a skill token."""
    lowered = skill.lower().strip()
    return SYNONYMS.get(lowered, lowered)


def _get_ner_excluded_spans(doc) -> set[tuple[int, int]]:
    """
    Return a set of (start_char, end_char) spans for entities that should
    be excluded from skill matching (names, orgs, locations, etc.).

    IMPORTANT: If the entity text matches a known tech skill or synonym,
    we do NOT exclude it. This prevents spaCy's general NER model from
    incorrectly filtering out tech terms it misclassifies
    (e.g. Pandas → PERSON, NumPy → GPE, TensorFlow → ORG).
    """
    # Build a lookup of all known skill terms (lowercase)
    known_tech = {s.lower() for s in TECH_SKILLS}
    known_tech.update(alias.lower() for alias in SYNONYMS.keys())

    excluded = set()
    if not SPACY_AVAILABLE or doc is None:
        return excluded

    for ent in doc.ents:
        if ent.label_ in NER_EXCLUDE_LABELS:
            ent_text = ent.text.lower().strip()
            # Only exclude if this entity is NOT a known tech skill
            if ent_text not in known_tech:
                excluded.add((ent.start_char, ent.end_char))
    return excluded


def _span_overlaps_excluded(match_start: int, match_end: int, excluded: set) -> bool:
    """Check if a skill match span overlaps with any NER-excluded entity."""
    for (ex_start, ex_end) in excluded:
        if match_start < ex_end and match_end > ex_start:
            return True
    return False


def extract_skills(text: str) -> list[str]:
    """
    NER-Enhanced Skill Extraction Pipeline:

    1. Process text through spaCy → get NER entities + tokenisation
    2. Build a set of character spans to EXCLUDE (PERSON, ORG, GPE, etc.)
    3. Run PhraseMatcher against the doc → find dictionary skill matches
    4. Filter out matches that overlap with NER-excluded spans
    5. Fallback: regex + synonym search for anything PhraseMatcher missed
    6. Normalise all found skills through the SYNONYMS map
    7. Return deduplicated list
    """
    found = set()

    # If spaCy or PhraseMatcher isn't available, fall back to simpler
    # regex + synonym matching so the script can still run.
    if not SPACY_AVAILABLE or nlp is None or phrase_matcher is None:
        lowered_text = " " + text.lower() + " "

        # Match multi-word skills first
        multi_word_skills = sorted(
            [s for s in TECH_SKILLS if " " in s or "/" in s],
            key=len, reverse=True
        )
        for skill in multi_word_skills:
            if normalize_skill(skill) in found:
                continue
            pattern = r"(?<![a-z])" + re.escape(skill) + r"(?![a-z])"
            if re.search(pattern, lowered_text):
                found.add(normalize_skill(skill))

        # Single-token skills
        for skill in TECH_SKILLS:
            if " " in skill or "/" in skill:
                continue
            if normalize_skill(skill) in found:
                continue
            pattern = r"(?<![a-z])" + re.escape(skill) + r"(?![a-z])"
            if re.search(pattern, lowered_text):
                found.add(normalize_skill(skill))

        # Synonym aliases
        for alias, canonical in SYNONYMS.items():
            if canonical in found:
                continue
            pattern = r"(?<![a-z])" + re.escape(alias) + r"(?![a-z])"
            if re.search(pattern, lowered_text):
                found.add(canonical)

        return list(found)

    # ── Full spaCy pipeline when available ──
    doc = nlp(text.lower())
    excluded_spans = _get_ner_excluded_spans(doc)

    # ── Step 1: PhraseMatcher (linguistically-aware dictionary matching) ──
    matches = phrase_matcher(doc)
    for match_id, start, end in matches:
        span = doc[start:end]
        match_text = span.text.lower().strip()
        start_char = span.start_char
        end_char   = span.end_char

        # Skip if this span overlaps with a named entity (e.g. a person named "Ruby")
        if _span_overlaps_excluded(start_char, end_char, excluded_spans):
            continue

        found.add(normalize_skill(match_text))

    # ── Step 2: Lemma-based matching ──
    for token in doc:
        lemma = token.lemma_.lower()
        if lemma in TECH_SKILLS:
            if not _span_overlaps_excluded(token.idx, token.idx + len(token.text), excluded_spans):
                found.add(normalize_skill(lemma))

    # ── Step 3: Regex fallback for multi-word skills PhraseMatcher may miss ──
    lowered_text = " " + text.lower() + " "
    multi_word_skills = sorted(
        [s for s in TECH_SKILLS if " " in s or "/" in s],
        key=len, reverse=True
    )
    for skill in multi_word_skills:
        if normalize_skill(skill) in found:
            continue
        pattern = r"(?<![a-z])" + re.escape(skill) + r"(?![a-z])"
        if re.search(pattern, lowered_text):
            found.add(normalize_skill(skill))

    # ── Step 4: Synonym alias fallback ──
    for alias, canonical in SYNONYMS.items():
        if canonical in found:
            continue
        pattern = r"(?<![a-z])" + re.escape(alias) + r"(?![a-z])"
        if re.search(pattern, lowered_text):
            found.add(canonical)

    return list(found)


def fuzzy_match(skill: str, resume_skills: set, threshold: int = FUZZY_THRESHOLD) -> bool:
    """Return True if `skill` fuzzy-matches any skill in `resume_skills`."""
    for rs in resume_skills:
        if fuzz.partial_ratio(skill.lower(), rs.lower()) >= threshold:
            return True
    return False


# ---------------------------------------------------------------------------
# Sub-score 1: Skill Recall
# ---------------------------------------------------------------------------

def compute_skill_recall(resume: str, jd_skills: list[str]) -> tuple[float, list, list]:
    """
    Returns:
        recall_score  — fraction of JD skills found in resume  [0, 1]
        matched       — list of matched skill names
        missing       — list of unmatched skill names
    """
    if not jd_skills:
        return 0.0, [], []

    resume_skills = set(extract_skills(resume))
    matched, missing = [], []

    for skill in jd_skills:
        norm = normalize_skill(skill)
        # Exact match
        if norm in resume_skills:
            matched.append(skill)
        # Fuzzy match
        elif fuzzy_match(norm, resume_skills):
            matched.append(skill)
        else:
            missing.append(skill)

    score = len(matched) / len(jd_skills)
    return score, matched, missing


# ---------------------------------------------------------------------------
# Sub-score 2: TF-IDF Semantic Baseline (now with lemmatization)
# ---------------------------------------------------------------------------

def compute_tfidf_score(resume: str, jd_text: str) -> float:
    """Return cosine similarity between resume and JD using TF-IDF."""
    try:
        # Use lemmatized text for better semantic matching
        corpus = [lemmatize_text(resume), lemmatize_text(jd_text)]
        vectorizer = TfidfVectorizer(sublinear_tf=True, min_df=1)
        matrix = vectorizer.fit_transform(corpus)
        score = float(cosine_similarity(matrix[0], matrix[1])[0][0])
    except Exception:
        score = 0.0
    return round(score, 4)


# ---------------------------------------------------------------------------
# Sub-score 3: Position-Aware Bonus
# ---------------------------------------------------------------------------

def compute_position_bonus(resume: str, matched_skills: list[str]) -> float:
    """
    Skills appearing in the top POSITION_CUTOFF fraction of the resume
    earn a placement bonus. Returns a normalised sub-score [0, 1].
    """
    if not matched_skills:
        return 0.0

    cutoff_idx = int(len(resume) * POSITION_CUTOFF)
    top_section = resume[:cutoff_idx].lower()

    bonus_count = sum(
        1 for skill in matched_skills
        if skill.lower() in top_section or normalize_skill(skill) in top_section
    )

    score = (bonus_count / len(matched_skills)) if matched_skills else 0.0
    return round(score, 4)


# ---------------------------------------------------------------------------
# Sub-score 4: Extra Skills Bonus
# ---------------------------------------------------------------------------

def compute_extra_skills_bonus(resume: str, jd_skills: list[str]) -> tuple[float, list]:
    """
    Resume skills NOT present in JD indicate breadth of knowledge.
    Returns a normalised bonus [0, 1] and the list of extra skills.
    Capped so it never exceeds 0.5 of its raw value.
    """
    jd_skills_set = {normalize_skill(s) for s in jd_skills}
    resume_skills = set(extract_skills(resume))
    extra = [s for s in resume_skills if s not in jd_skills_set]

    raw = min(len(extra) / max(len(jd_skills), 1), 0.5)
    score = raw * 2  # normalise [0, 0.5] → [0, 1]
    return round(score, 4), extra


# ---------------------------------------------------------------------------
# Main matcher function
# ---------------------------------------------------------------------------

def _compute_semantic_scores(resume: str, job_descriptions: list) -> dict:
    """
    Compute Sentence-BERT semantic similarity for each job using a single
    batch encode pass per request. This is intentionally lazy: if the model
    is not available or fails to load, the baseline TF-IDF match still works
    and the semantic values simply remain null with an explanatory error.
    """
    if not job_descriptions:
        return {}

    try:
        from semantic_matcher import get_matcher
        matcher = get_matcher()
        jd_texts = [str(job.get("description", "") or "") for job in job_descriptions]
        batch_results = matcher.score_batch(resume, jd_texts)

        semantic_by_idx = {}
        for i, job in enumerate(job_descriptions):
            jd_idx = job.get("_idx", i)
            result = batch_results[i] if i < len(batch_results) else {"score": 0.0, "error": "missing result"}
            semantic_by_idx[jd_idx] = {
                "semantic_similarity": None if result.get("error") else result.get("score"),
                "semantic_error": result.get("error"),
                "semantic_inference_ms": result.get("inference_ms"),
            }
        return semantic_by_idx
    except Exception as exc:
        semantic_by_idx = {}
        for i, job in enumerate(job_descriptions):
            jd_idx = job.get("_idx", i)
            semantic_by_idx[jd_idx] = {
                "semantic_similarity": None,
                "semantic_error": str(exc),
            }
        return semantic_by_idx


def match_jobs(resume: str, job_descriptions: list, top_n: int = 5) -> list:
    """
    Return top N jobs ranked by the hybrid score.

    Weights:
        skill_recall    55%
        tfidf_semantic  20%
        position_bonus  15%
        extra_skills    10%

    Sentence-BERT semantic similarity is calculated separately and added to each
    job result without altering the baseline final hybrid score.
    """
    if not job_descriptions:
        return []

    semantic_scores = _compute_semantic_scores(resume, job_descriptions)
    results = []

    for i, job in enumerate(job_descriptions):
        jd_text  = job.get("description", "")
        jd_title = job.get("title", "Unknown")
        jd_idx   = job.get("_idx", i)

        # Extract skills from JD using NER-enhanced pipeline
        jd_skills = extract_skills(jd_text)

        # --- Compute sub-scores ---
        recall_score, matched, missing = compute_skill_recall(resume, jd_skills)
        tfidf_score  = compute_tfidf_score(resume, jd_text)
        pos_score    = compute_position_bonus(resume, matched)
        extra_score, extra_list = compute_extra_skills_bonus(resume, jd_skills)

        # --- Weighted composite ---
        final = (
            0.55 * recall_score  +
            0.20 * tfidf_score   +
            0.15 * pos_score     +
            0.10 * extra_score
        )

        semantic_info = semantic_scores.get(jd_idx, {
            "semantic_similarity": None,
            "semantic_error": "semantic matching unavailable",
        })

        # --- Compute improved hybrid score (FYP-II Phase 3)
        # We combine the Sentence-BERT semantic similarity and the explicit
        # skill recall using the harmonic mean (analogous to F1). This is a
        # principled, parameter-free aggregator that rewards jobs where both
        # semantic similarity and skill overlap are high while remaining
        # conservative when one signal is missing.
        #
        # semantic_used: prefer Sentence-BERT when available, else fall back
        # to the TF-IDF baseline for semantic signal.
        semantic_used = semantic_info.get("semantic_similarity")
        if semantic_used is None:
            semantic_used = tfidf_score

        # Ensure numeric bounds [0,1]
        try:
            semantic_used = float(semantic_used) if semantic_used is not None else 0.0
        except Exception:
            semantic_used = 0.0

        # skill_recall is already in [0,1]
        skill_recall = float(recall_score) if recall_score is not None else 0.0

        # Harmonic mean: H = 2 * (sem * skill) / (sem + skill)  (0 if both zero)
        if semantic_used <= 0 or skill_recall <= 0:
            improved_raw = 0.0
        else:
            improved_raw = 2.0 * (semantic_used * skill_recall) / (semantic_used + skill_recall)

        # Scale to 0-100 for frontend display and ensure bounds
        improved_score_pct = max(0.0, min(100.0, round(improved_raw * 100.0, 2)))

        result = {
            "_idx":        jd_idx,
            "title":       jd_title,
            "description": jd_text,
            "score":       round(final, 4),
            "semantic_similarity": semantic_info.get("semantic_similarity"),
            "semantic_error": semantic_info.get("semantic_error"),
            "score_breakdown": {
                "skill_recall":      round(recall_score, 4),
                "tfidf_semantic":    round(tfidf_score,  4),
                "position_bonus":    round(pos_score,    4),
                "extra_skills":      round(extra_score,  4),
                "matched_skills":    matched,
                "missing_skills":    missing,
                "extra_skills_list": extra_list,
                "semantic_similarity": semantic_info.get("semantic_similarity"),
                "semantic_error":     semantic_info.get("semantic_error"),
            },
            # Preserve the existing FYP-I composite `score` as the baseline.
            # Additionally expose the improved FYP-II score and its components
            # without overwriting the original fields.
            "baseline_score": round(final, 4),
            "improved_score": improved_score_pct,
            "improved_score_components": {
                "semantic_used": round(semantic_used, 4),
                "skill_recall": round(skill_recall, 4),
                "improved_raw": round(improved_raw, 4),
            },
        }

        results.append(result)

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:top_n]


# ---------------------------------------------------------------------------
# Entry point — read JSON from stdin, write JSON to stdout
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import io
    # Force UTF-8 encoding on stdin/stdout to prevent Unicode surrogate errors on Windows
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8', errors='replace')
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

    try:
        raw_input = sys.stdin.read()
        # Clean/sanitize text by stripping out invalid surrogate characters
        clean_input = raw_input.encode('utf-8', 'ignore').decode('utf-8')
        data = json.loads(clean_input)

        resume = data.get("resume", "")
        jobs   = data.get("jobs", [])

        top_matches = match_jobs(resume, jobs, top_n=5)
        # ensure_ascii=False as requested by the user requirements
        print(json.dumps(top_matches, ensure_ascii=False))

    except Exception as e:
        # Safe fallback returning valid JSON
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
