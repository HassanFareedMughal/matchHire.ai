"""Reproducible evaluation script for FYP-II Phase 4.

Runs the existing FYP-I baseline and the FYP-II improved matcher on the
same dataset (`dataset.json`) and writes per-pair outputs and summary
metrics to `results.json` and `results.csv`.

Usage (from repo root with venv activated):
    .venv\Scripts\python.exe ai-engine/eval_phase4/eval_phase4.py
"""
import json
import csv
import os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
DATA_PATH = os.path.join(os.path.dirname(__file__), "dataset.json")
OUT_JSON = os.path.join(os.path.dirname(__file__), "results.json")
OUT_CSV = os.path.join(os.path.dirname(__file__), "results.csv")

# Evaluation thresholds (fixed)
BASELINE_THRESHOLD = 0.5   # baseline_score in [0,1]
IMPROVED_THRESHOLD = 50.0  # improved_score in [0,100]


def load_dataset(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def binary_label(label):
    return 1 if label >= 1 else 0


def compute_confusion_counts(y_true, y_pred):
    tp = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 1)
    tn = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 0)
    fp = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 1)
    fn = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 0)
    return tp, tn, fp, fn


def precision_recall_f1(tp, tn, fp, fn):
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    return precision, recall, f1


def precision_at_k(relevance_list, k):
    # relevance_list: list of binary relevance for top-ranked items
    k = min(k, len(relevance_list))
    if k == 0:
        return 0.0
    return sum(relevance_list[:k]) / k


def run_evaluation():
    data = load_dataset(DATA_PATH)
    resumes = {r["id"]: r for r in data["resumes"]}
    jobs = {j["id"]: j for j in data["jobs"]}

    # Build lookup of pairs
    pairs = data["pairs"]

    # For efficient scoring, group jobs as a list and map indices
    job_list = list(data["jobs"])  # preserve order
    # Prepare job dicts as expected by matcher.match_jobs (include _idx)
    jobs_for_call = []
    job_index_map = {}
    for i, j in enumerate(job_list):
        jd = {"_idx": i, "title": j.get("title"), "description": j.get("description")}
        jobs_for_call.append(jd)
        job_index_map[i] = j["id"]

    # Import matcher from ai-engine
    import sys
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    from matcher import match_jobs

    # Collect per-pair outputs
    records = []

    # For ranking metrics, group results per resume
    ranking_results = defaultdict(list)

    # For each resume, run match_jobs once (batch semantic is used internally)
    for r_id, r in resumes.items():
        resume_text = r["text"]
        results = match_jobs(resume_text, jobs_for_call, top_n=len(jobs_for_call))
        # Build map idx->result
        res_map = {res["_idx"]: res for res in results}

        # For all jobs, ensure we have an entry (match_jobs sorts by baseline but returns all)
        for i, j in enumerate(job_list):
            job_id = j["id"]
            pair_label = next(p["label"] for p in pairs if p["resume_id"] == r_id and p["job_id"] == job_id)
            # Some match_jobs implementations may omit entries if top_n smaller; default zeros
            out = res_map.get(i, None)
            if out is None:
                baseline_score = 0.0
                improved_score = 0.0
                semantic_used = None
            else:
                baseline_score = out.get("baseline_score", 0.0)
                improved_score = out.get("improved_score", 0.0)
                semantic_used = out.get("improved_score_components", {}).get("semantic_used")

            baseline_pred = 1 if baseline_score >= BASELINE_THRESHOLD else 0
            improved_pred = 1 if improved_score >= IMPROVED_THRESHOLD else 0

            records.append({
                "resume_id": r_id,
                "job_id": job_id,
                "label": pair_label,
                "label_binary": binary_label(pair_label),
                "baseline_score": baseline_score,
                "baseline_pred": baseline_pred,
                "improved_score": improved_score,
                "improved_pred": improved_pred,
                "semantic_used": semantic_used,
            })

        # Ranking: sort jobs by baseline and improved scores and compute Precision@K
        # We need binary relevances per ranked list
        # Baseline ranking
        baseline_sorted = sorted(records[-len(job_list):], key=lambda x: x["baseline_score"], reverse=True)
        improved_sorted = sorted(records[-len(job_list):], key=lambda x: x["improved_score"], reverse=True)

        baseline_rels = [r["label_binary"] for r in baseline_sorted]
        improved_rels = [r["label_binary"] for r in improved_sorted]

        ranking_results[r_id] = {
            "baseline_rels": baseline_rels,
            "improved_rels": improved_rels,
        }

    # Compute global confusion/metrics for both models
    y_true = [rec["label_binary"] for rec in records]
    y_pred_baseline = [rec["baseline_pred"] for rec in records]
    y_pred_improved = [rec["improved_pred"] for rec in records]

    tp_b, tn_b, fp_b, fn_b = compute_confusion_counts(y_true, y_pred_baseline)
    tp_i, tn_i, fp_i, fn_i = compute_confusion_counts(y_true, y_pred_improved)

    precision_b, recall_b, f1_b = precision_recall_f1(tp_b, tn_b, fp_b, fn_b)
    precision_i, recall_i, f1_i = precision_recall_f1(tp_i, tn_i, fp_i, fn_i)

    # Ranking metrics: Precision@K averaged across resumes
    Ks = [1, 3]
    p_at_k_baseline = {k: [] for k in Ks}
    p_at_k_improved = {k: [] for k in Ks}
    for r_id, vals in ranking_results.items():
        for k in Ks:
            p_at_k_baseline[k].append(precision_at_k(vals["baseline_rels"], k))
            p_at_k_improved[k].append(precision_at_k(vals["improved_rels"], k))

    p_at_k_baseline_avg = {k: sum(v) / len(v) if v else 0.0 for k, v in p_at_k_baseline.items()}
    p_at_k_improved_avg = {k: sum(v) / len(v) if v else 0.0 for k, v in p_at_k_improved.items()}

    summary = {
        "dataset_size": len(records),
        "num_resumes": len(resumes),
        "num_jobs": len(job_list),
        "num_positive_examples": sum(y_true),
        "num_negative_examples": len(y_true) - sum(y_true),
        "baseline": {
            "tp": tp_b, "tn": tn_b, "fp": fp_b, "fn": fn_b,
            "precision": precision_b, "recall": recall_b, "f1": f1_b,
            "precision_at_k": p_at_k_baseline_avg,
            "threshold": BASELINE_THRESHOLD,
        },
        "improved": {
            "tp": tp_i, "tn": tn_i, "fp": fp_i, "fn": fn_i,
            "precision": precision_i, "recall": recall_i, "f1": f1_i,
            "precision_at_k": p_at_k_improved_avg,
            "threshold": IMPROVED_THRESHOLD,
        }
    }

    # Write per-pair CSV for manual inspection
    with open(OUT_CSV, "w", newline='', encoding="utf-8") as csvf:
        writer = csv.DictWriter(csvf, fieldnames=list(records[0].keys()))
        writer.writeheader()
        for r in records:
            writer.writerow(r)

    # Write JSON results
    with open(OUT_JSON, "w", encoding="utf-8") as jf:
        json.dump({"summary": summary, "records": records}, jf, indent=2)

    # Print a concise summary to stdout
    print("Evaluation complete. Summary:")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    run_evaluation()
