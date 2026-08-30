"""Phase 5 evaluation runner.

This script expects `dataset_candidates.json` to have `pairs_to_label` where
`label` values are integers (0,1,2). It will refuse to run if any label is null.

Usage (after labeling):
    .venv\Scripts\python.exe ai-engine/eval_phase5/eval_phase5.py
"""
import json
import os
import sys
from collections import defaultdict

HERE = os.path.dirname(__file__)
DATA_PATH = os.path.join(HERE, "dataset_candidates.json")
OUT_JSON = os.path.join(HERE, "results_phase5.json")
OUT_CSV = os.path.join(HERE, "results_phase5.csv")

BASELINE_THRESHOLD = 0.5
IMPROVED_THRESHOLD = 50.0

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
    k = min(k, len(relevance_list))
    if k == 0:
        return 0.0
    return sum(relevance_list[:k]) / k

def main():
    data = load_dataset(DATA_PATH)

    # validate labels are present
    for p in data.get("pairs_to_label", []):
        if p.get("label") is None:
            print("Error: some pair labels are null. Please label dataset before running Phase 5.")
            sys.exit(2)

    resumes = {r["id"]: r for r in data["resumes"]}
    jobs = {j["id"]: j for j in data["jobs"]}

    # Build job_list for matcher input
    job_list = list(data["jobs"])  # maintain order
    jobs_for_call = []
    job_index_map = {}
    for i, j in enumerate(job_list):
        jd = {"_idx": i, "title": j.get("title"), "description": j.get("description")}
        jobs_for_call.append(jd)
        job_index_map[i] = j["id"]

    # import matcher
    sys.path.insert(0, os.path.abspath(os.path.join(HERE, "..")))
    from matcher import match_jobs

    # Run per-resume
    records = []
    ranking_results = defaultdict(dict)

    pairs = data["pairs_to_label"]
    # iterate resumes, run match_jobs once per resume
    resume_ids = sorted({p["resume_id"] for p in pairs})
    for r_id in resume_ids:
        resume_text = resumes[r_id]["text"]
        results = match_jobs(resume_text, jobs_for_call, top_n=len(job_list))
        res_map = {res["_idx"]: res for res in results}

        # for each pair with this resume
        pairs_for_resume = [p for p in pairs if p["resume_id"] == r_id]
        for p in pairs_for_resume:
            job_id = p["job_id"]
            label = p["label"]
            # find job index
            idx = next(i for i, j in enumerate(job_list) if j["id"] == job_id)
            out = res_map.get(idx)
            baseline_score = out.get("baseline_score", 0.0) if out else 0.0
            improved_score = out.get("improved_score", 0.0) if out else 0.0
            semantic_used = None
            skill_recall = None
            if out:
                comp = out.get("improved_score_components", {})
                semantic_used = comp.get("semantic_used")
                skill_recall = comp.get("skill_recall")

            baseline_pred = 1 if baseline_score >= BASELINE_THRESHOLD else 0
            improved_pred = 1 if improved_score >= IMPROVED_THRESHOLD else 0

            records.append({
                "resume_id": r_id,
                "job_id": job_id,
                "label": label,
                "label_binary": 1 if label >= 1 else 0,
                "baseline_score": baseline_score,
                "baseline_pred": baseline_pred,
                "improved_score": improved_score,
                "improved_pred": improved_pred,
                "semantic_used": semantic_used,
                "skill_recall": skill_recall,
            })

        # ranking lists for this resume
        baseline_sorted = sorted([rec for rec in records if rec["resume_id"] == r_id], key=lambda x: x["baseline_score"], reverse=True)
        improved_sorted = sorted([rec for rec in records if rec["resume_id"] == r_id], key=lambda x: x["improved_score"], reverse=True)
        baseline_rels = [r["label_binary"] for r in baseline_sorted]
        improved_rels = [r["label_binary"] for r in improved_sorted]
        ranking_results[r_id]["baseline_rels"] = baseline_rels
        ranking_results[r_id]["improved_rels"] = improved_rels

    # compute metrics
    y_true = [r["label_binary"] for r in records]
    y_pred_b = [r["baseline_pred"] for r in records]
    y_pred_i = [r["improved_pred"] for r in records]

    tp_b, tn_b, fp_b, fn_b = compute_confusion_counts(y_true, y_pred_b)
    tp_i, tn_i, fp_i, fn_i = compute_confusion_counts(y_true, y_pred_i)
    prec_b, rec_b, f1_b = precision_recall_f1(tp_b, tn_b, fp_b, fn_b)
    prec_i, rec_i, f1_i = precision_recall_f1(tp_i, tn_i, fp_i, fn_i)

    Ks = [1, 3]
    p_at_k_b = {k: [] for k in Ks}
    p_at_k_i = {k: [] for k in Ks}
    for r_id, vals in ranking_results.items():
        for k in Ks:
            p_at_k_b[k].append(precision_at_k(vals["baseline_rels"], k))
            p_at_k_i[k].append(precision_at_k(vals["improved_rels"], k))

    p_at_k_b_avg = {k: sum(v)/len(v) if v else 0.0 for k, v in p_at_k_b.items()}
    p_at_k_i_avg = {k: sum(v)/len(v) if v else 0.0 for k, v in p_at_k_i.items()}

    summary = {
        "dataset_size": len(records),
        "num_resumes": len(set(r["resume_id"] for r in records)),
        "num_jobs": len(set(r["job_id"] for r in records)),
        "num_positive_examples": sum(r["label_binary"] for r in records),
        "num_negative_examples": len(records) - sum(r["label_binary"] for r in records),
        "baseline": {"tp": tp_b, "tn": tn_b, "fp": fp_b, "fn": fn_b, "precision": prec_b, "recall": rec_b, "f1": f1_b, "precision_at_k": p_at_k_b_avg, "threshold": BASELINE_THRESHOLD},
        "improved": {"tp": tp_i, "tn": tn_i, "fp": fp_i, "fn": fn_i, "precision": prec_i, "recall": rec_i, "f1": f1_i, "precision_at_k": p_at_k_i_avg, "threshold": IMPROVED_THRESHOLD}
    }

    # write outputs
    import csv
    if records:
        keys = list(records[0].keys())
        with open(OUT_CSV, "w", newline='', encoding='utf-8') as cf:
            writer = csv.DictWriter(cf, fieldnames=keys)
            writer.writeheader()
            for r in records:
                writer.writerow(r)

    with open(OUT_JSON, "w", encoding='utf-8') as jf:
        json.dump({"summary": summary, "records": records}, jf, indent=2)

    print("Phase 5 evaluation complete. Summary:\n")
    print(json.dumps(summary, indent=2))

if __name__ == '__main__':
    main()
