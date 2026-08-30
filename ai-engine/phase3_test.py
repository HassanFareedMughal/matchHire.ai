"""
phase3_test.py — Controlled test suite for FYP-II Phase 3 improved scoring

Runs the current matcher (which includes the TF-IDF baseline) and reports
both the baseline score and the new improved FYP-II score for comparison.

This script uses the existing `match_jobs` function from `matcher.py` so it
will exercise the integrated Sentence-BERT semantic matcher when available.
"""

import json
from matcher import match_jobs

# Fixtures: realistic resume and job descriptions
RESUME = """
Experienced software engineer with 5 years of Python backend
experience. Built REST APIs using Flask and FastAPI, worked with
PostgreSQL and Redis, and deployed services with Docker and Kubernetes.
Familiar with machine learning pipelines: data cleaning, feature
engineering, and model deployment. Comfortable with cloud platforms
(AWS) and CI/CD.
"""

# High relevance: ML/backend with matching skills
JD_HIGH = """
Senior Machine Learning Engineer

We need someone to build ML pipelines and deploy models as REST APIs.
Experience with Python, scikit-learn, pandas, Flask, SQL, and Docker is required.
"""

# Moderate relevance: Backend engineering
JD_MED = """
Backend Engineer

Design and implement RESTful APIs using Python frameworks. Work with
PostgreSQL and containerised deployments. Some familiarity with
machine learning is a plus but not required.
"""

# Low relevance: Graphic Design
JD_LOW = """
Graphic Designer

Create visual content using Adobe Photoshop and Illustrator. Responsible
for branding, layout, and marketing design projects.
"""

# Semantically related but different terminology: Data Engineer
JD_SEMANTIC = """
Data Engineer — Build data pipelines and feature warehouses. Implement ETL
jobs, optimise queries, and collaborate with ML teams to provide
scalable data infrastructure. Experience with Spark, SQL, and cloud storage.
"""

TEST_JOBS = [
    {"title": "ML Engineer", "description": JD_HIGH},
    {"title": "Backend Engineer", "description": JD_MED},
    {"title": "Graphic Designer", "description": JD_LOW},
    {"title": "Data Engineer", "description": JD_SEMANTIC},
]

if __name__ == '__main__':
    results = match_jobs(RESUME, TEST_JOBS, top_n=10)
    print(json.dumps(results, indent=2, ensure_ascii=False))
