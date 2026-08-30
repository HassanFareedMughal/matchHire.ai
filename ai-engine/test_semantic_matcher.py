"""
test_semantic_matcher.py — matchHire.ai FYP-II Phase 1 Test
=============================================================

Tests the SemanticMatcher independently using four realistic examples:

  1. Resume     : Python + ML + Flask + SQL developer
  2. JD-A (HIGH): ML Engineering role — closely matches the resume
  3. JD-B (LOW) : Graphic Designer role — clearly unrelated
  4. JD-C (MED) : Backend Engineer (Python, APIs, DBs) — related but
                  uses different terminology (no "machine learning" mentioned)

Expected outcome:
  score(JD-A) > score(JD-C) > score(JD-B)

This test does NOT compare against TF-IDF. That controlled comparison
is deferred to a later FYP-II phase. The only goal here is to verify
that the semantic-similarity component produces sensible, ordered scores.
"""

import sys
import os
import time

# ── Make sure we can import from the ai-engine directory ──────────────────────
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from semantic_matcher import SemanticMatcher

# =============================================================================
# Test fixtures
# =============================================================================

RESUME = """
Experienced software engineer with 3 years of Python development.
Skilled in machine learning model development using scikit-learn, pandas, and numpy.
Built and deployed Flask REST APIs serving ML model predictions.
Proficient in SQL and PostgreSQL for data storage and querying.
Experience with data preprocessing, feature engineering, and model evaluation.
Familiar with Git, Linux command-line tools, and basic Docker usage.
Academic background in Computer Science with coursework in algorithms and statistics.
"""

# Closely matches: ML Engineer role — same domain and many overlapping terms
JD_A_HIGH_MATCH = """
Machine Learning Engineer

We are looking for a Machine Learning Engineer to join our data science team.

Responsibilities:
- Develop and deploy predictive machine learning models for production use
- Build data preprocessing and feature engineering pipelines using Python and pandas
- Expose trained models as REST APIs using Flask or FastAPI
- Query and manage training datasets using SQL and PostgreSQL databases
- Collaborate with the data science team on model evaluation and performance tuning
- Work with version control using Git in a Linux development environment

Requirements:
- Strong Python programming skills
- Hands-on experience with scikit-learn, numpy, and pandas
- Experience building REST APIs
- Familiarity with SQL and relational databases
- Understanding of the machine learning lifecycle
"""

# Clearly unrelated: Graphic Designer — different field entirely
JD_B_LOW_MATCH = """
Senior Graphic Designer

We are hiring a talented Senior Graphic Designer for our creative department.

Responsibilities:
- Design marketing materials including brochures, banners, social media graphics
- Create brand identities and visual style guides for clients
- Use Adobe Photoshop, Illustrator, and InDesign to produce high-quality artwork
- Collaborate with the marketing and content teams on visual campaigns
- Present creative concepts and iterate based on client feedback
- Manage multiple design projects under tight deadlines

Requirements:
- Degree in Graphic Design, Visual Arts, or related field
- Proficiency in Adobe Creative Suite (Photoshop, Illustrator, InDesign)
- Strong portfolio demonstrating typography, layout, and colour theory skills
- Experience with print and digital design production
- Excellent visual communication and presentation skills
"""

# Related but different terminology: Backend Engineer — Python and databases
# but framed as "services", "endpoints", "scalability", not "ML" or "models"
JD_C_MEDIUM_MATCH = """
Backend Software Engineer

We are looking for a Backend Engineer to build scalable server-side systems.

Responsibilities:
- Design and implement RESTful API endpoints using Python-based frameworks
- Integrate with relational and NoSQL databases to store and retrieve application data
- Write clean, testable, and well-documented backend code
- Optimize query performance and ensure database schema integrity
- Participate in code reviews and contribute to engineering best practices
- Deploy and monitor services in a containerised environment

Requirements:
- Proficiency in Python for backend development
- Experience with web frameworks such as Django or Flask
- Solid understanding of relational databases and SQL
- Familiarity with API design principles
- Basic knowledge of Docker and Linux environments
- Good understanding of software engineering fundamentals
"""


# =============================================================================
# Test runner
# =============================================================================

def run_tests():
    print("=" * 65)
    print("  matchHire.ai — FYP-II Phase 1: Sentence-BERT Semantic Matcher")
    print("=" * 65)
    print(f"  Model : all-MiniLM-L6-v2")
    print(f"  Python: {sys.version.split()[0]}")
    print()

    # ── Load model ────────────────────────────────────────────────────────────
    print("Step 1: Loading Sentence-BERT model ...")
    try:
        matcher = SemanticMatcher()
    except RuntimeError as exc:
        print(f"\n[FAIL] Could not load model:\n  {exc}")
        sys.exit(1)

    print(f"  → Model loaded in {matcher.load_time}s\n")

    # ── Batch inference ───────────────────────────────────────────────────────
    jd_texts = [JD_A_HIGH_MATCH, JD_B_LOW_MATCH, JD_C_MEDIUM_MATCH]
    jd_labels = [
        "JD-A  (HIGH match — ML Engineer)",
        "JD-B  (LOW  match — Graphic Designer)",
        "JD-C  (MED  match — Backend Engineer)",
    ]

    print("Step 2: Running batch semantic scoring ...")
    results = matcher.score_batch(RESUME, jd_texts)
    print()

    # ── Print results ─────────────────────────────────────────────────────────
    print("-" * 65)
    print(f"{'JD Description':<42} {'Score':>7}  {'Inf. (ms)':>10}")
    print("-" * 65)

    scores = []
    for label, res in zip(jd_labels, results):
        score = res["score"]
        inf_ms = res["inference_ms"]
        err = res.get("error")
        scores.append(score)
        status = f"  [ERROR: {err}]" if err else ""
        print(f"  {label:<40} {score:>7.4f}  {inf_ms:>8.1f} ms{status}")

    print("-" * 65)
    print()

    # ── Individual score_single call (verifying single-API also works) ────────
    print("Step 3: Verifying score_single() API ...")
    single_result = matcher.score_single(RESUME, JD_A_HIGH_MATCH)
    print(f"  score_single(JD-A) → {single_result['score']:.4f}  "
          f"(inference: {single_result['inference_ms']:.1f} ms)")
    print()

    # ── Edge-case / robustness tests ──────────────────────────────────────────
    print("Step 4: Edge-case robustness checks ...")
    edge_cases = [
        ("Empty resume",    "",    JD_A_HIGH_MATCH),
        ("None resume",     None,  JD_A_HIGH_MATCH),
        ("Empty JD",        RESUME, ""),
        ("None JD",         RESUME, None),
        ("Both empty",      "",    ""),
        ("Whitespace only", "   ", "  "),
        ("Non-string types","", 12345),
    ]
    all_edge_passed = True
    for desc, res_text, jd_text in edge_cases:
        r = matcher.score_single(res_text, jd_text)
        has_error = r["error"] is not None
        score_zero = r["score"] == 0.0
        passed = has_error and score_zero
        status = "PASS" if passed else "FAIL"
        if not passed:
            all_edge_passed = False
        print(f"  [{status}] {desc:<22} → score={r['score']:.4f}, error='{r['error']}'")

    print()

    # ── Ordering assertion ────────────────────────────────────────────────────
    print("Step 5: Validating score ordering  (JD-A > JD-C > JD-B) ...")
    score_a, score_b, score_c = scores[0], scores[1], scores[2]

    ordering_pass = (score_a > score_c) and (score_c > score_b)
    ordering_label = "PASS" if ordering_pass else "FAIL"
    print(f"  JD-A (ML Eng.)     = {score_a:.4f}")
    print(f"  JD-C (Backend Eng) = {score_c:.4f}")
    print(f"  JD-B (Graphic Des) = {score_b:.4f}")
    print(f"  Ordering check: [{ordering_label}]")
    print()

    # ── Summary ───────────────────────────────────────────────────────────────
    print("=" * 65)
    overall = ordering_pass and all_edge_passed
    if overall:
        print("  ✓  PHASE 1 TEST PASSED — Sentence-BERT component is working.")
    else:
        print("  ✗  PHASE 1 TEST HAD FAILURES — review output above.")
    print()
    print("  FYP-II Phase 1 complete. Awaiting approval before Phase 2.")
    print("=" * 65)

    return overall


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
