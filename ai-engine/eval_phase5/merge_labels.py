import csv
import json
import os

HERE = os.path.dirname(__file__)
CSV_PATH = os.path.join(HERE, "pairs_to_label.csv")
JSON_PATH = os.path.join(HERE, "dataset_candidates.json")

def load_csv(path):
    rows = []
    with open(path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
    return rows

def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

def merge():
    csv_rows = load_csv(CSV_PATH)
    data = load_json(JSON_PATH)

    # Build map (resume_id, job_id) -> label from CSV
    label_map = {}
    for r in csv_rows:
        key = (r['resume_id'].strip(), r['job_id'].strip())
        label_str = r.get('label', '').strip()
        if label_str == '':
            label = None
        else:
            try:
                label = int(label_str)
            except Exception:
                label = None
        label_map[key] = label

    # Update pairs_to_label in JSON
    updated = False
    for pair in data.get('pairs_to_label', []):
        key = (pair['resume_id'], pair['job_id'])
        if key in label_map:
            if pair.get('label') != label_map[key]:
                pair['label'] = label_map[key]
                updated = True

    if updated:
        save_json(JSON_PATH, data)
        print('dataset_candidates.json updated with labels from CSV.')
    else:
        print('No changes made; labels already present or CSV empty.')

if __name__ == '__main__':
    merge()
