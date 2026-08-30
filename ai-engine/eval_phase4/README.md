Evaluation: FYP-II Phase 4
=========================

Dataset format (dataset.json):
- `resumes`: array of {id, text}
- `jobs`: array of {id, title, description}
- `pairs`: array of {resume_id, job_id, label}

Label meaning:
- `0` — Not relevant
- `1` — Moderately relevant / some overlap
- `2` — Highly relevant / clear match

Binary evaluation mapping used by the script:
- Positive (relevant) = label >= 1
- Negative (not relevant) = label == 0

Classification thresholds (fixed before running evaluation):
- Baseline (`baseline_score` from `matcher.match_jobs`): threshold = 0.5 (scores are in [0,1])
- FYP-II (`improved_score` from `matcher.match_jobs`): threshold = 50.0 (scores are in [0,100])

Ranking metrics:
- Precision@K (K=1,3) averaged across resumes.

Reproducible command (run from project root):
```
".venv/Scripts/python.exe" ai-engine/eval_phase4/eval_phase4.py
```
