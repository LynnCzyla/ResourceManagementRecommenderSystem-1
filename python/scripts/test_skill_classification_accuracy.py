"""
Skill Classification Accuracy Test (ML-only, isolated)
========================================================
Measures the TF-IDF + Logistic Regression classifier (skill_classifier.py)
DIRECTLY - bypassing the Knowledge Base lookup and "trusted section" bypass
in module2_nlp.py. This is the correct way to isolate "ML accuracy" from
the full pipeline: if you sample phrases from a live/production resume run
instead, most common phrases get short-circuited by the KB before the ML
model ever sees them (see the chat notes / capstone methodology section),
which would silently inflate your reported accuracy.

------------------------------------------------------------------------------
HOW TO SET THIS UP
------------------------------------------------------------------------------
1. Build a ground-truth CSV: one phrase per row, manually labeled by a human
   as "Skill" or "Not Skill". IMPORTANT: include phrases that are NOT already
   in your 1000+ skill knowledge base - novel/unseen phrases are exactly what
   the ML layer exists to judge. A mix of:
     - genuine skills phrased in new ways ("bid preparation for tenders")
     - near-miss non-skills (job titles, field labels, dates, names)
   gives you a much more honest number than only testing on things the KB
   already knows.

   ground_truth.csv:
       phrase,label
       bid preparation for tenders,Skill
       Senior CAD Drafter,Not Skill
       explosion-proof lighting systems,Skill
       Employee ID,Not Skill
       ...

2. Run:
       python test_skill_classification_accuracy.py --ground-truth ground_truth.csv

   Optional:
       --output-dir DIR         Where to write results (default: ./results)
       --thresholds 0.65,0.75,0.85
                                 Report auto-approve precision/recall at each
                                 candidate threshold (for the "magic number"
                                 sensitivity-analysis section of your paper).

3. The confusion matrix, formulas, and metrics are printed straight to the
   console/log when the script runs (see print_confusion_matrix() /
   print_formulas() below) - no need to open results.md just to read them.
   results.md/.json/.csv are still written for pasting into your paper or
   further analysis.
------------------------------------------------------------------------------
"""
import sys
import csv
import json
import argparse
from pathlib import Path

# modules/ lives one level UP from this script (python/modules/, while this
# file sits in python/scripts/) - matches the same sys.path setup runner.py
# uses, so run this from anywhere as long as it stays inside scripts/.
sys.path.append(str(Path(__file__).resolve().parent.parent))
from modules.skill_classifier import SkillClassifier


def load_ground_truth(path):
    rows = []
    with open(path, 'r', encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        for r in reader:
            phrase = (r.get('phrase') or '').strip()
            label = (r.get('label') or '').strip()
            if not phrase or label not in ('Skill', 'Not Skill'):
                continue
            rows.append((phrase, label))
    return rows


def confusion_counts(y_true, y_pred):
    """y_true/y_pred are lists of 1 (Skill) / 0 (Not Skill)."""
    tp = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 1)
    tn = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 0)
    fp = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 1)
    fn = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 0)
    return tp, tn, fp, fn


def safe_div(a, b):
    return a / b if b else 0.0


def metrics_from_counts(tp, tn, fp, fn):
    n = tp + tn + fp + fn
    accuracy = safe_div(tp + tn, n)
    precision = safe_div(tp, tp + fp)
    recall = safe_div(tp, tp + fn)
    f1 = safe_div(2 * precision * recall, precision + recall)
    return {
        'n': n, 'tp': tp, 'tn': tn, 'fp': fp, 'fn': fn,
        'accuracy': round(accuracy, 4), 'precision': round(precision, 4),
        'recall': round(recall, 4), 'f1_score': round(f1, 4),
    }


# ---------------------------------------------------------------------------
# NEW: console/log printing helpers - confusion matrix + formulas, plugged
# straight into stdout so you don't have to open results.md just to read
# the numbers for your paper.
# ---------------------------------------------------------------------------
def print_confusion_matrix(m):
    print("\n" + "-" * 60)
    print("CONFUSION MATRIX")
    print("-" * 60)
    print(f"{'':<20}{'Predicted: Skill':<20}{'Predicted: Not Skill':<20}")
    print(f"{'Actual: Skill':<20}{'TP = ' + str(m['tp']):<20}{'FN = ' + str(m['fn']):<20}")
    print(f"{'Actual: Not Skill':<20}{'FP = ' + str(m['fp']):<20}{'TN = ' + str(m['tn']):<20}")


def print_formulas(m):
    print("\n" + "-" * 60)
    print("FORMULAS")
    print("-" * 60)
    print(f"Accuracy  = (TP + TN) / (TP + TN + FP + FN) "
          f"= ({m['tp']} + {m['tn']}) / {m['n']} = {m['accuracy']:.1%}")
    print(f"Precision = TP / (TP + FP) "
          f"= {m['tp']} / {m['tp'] + m['fp']} = {m['precision']:.1%}")
    print(f"Recall    = TP / (TP + FN) "
          f"= {m['tp']} / {m['tp'] + m['fn']} = {m['recall']:.1%}")
    print(f"F1-score  = 2 x (Precision x Recall) / (Precision + Recall) "
          f"= {m['f1_score']:.1%}")


def run(ground_truth_path, output_dir, thresholds):
    rows = load_ground_truth(ground_truth_path)
    if not rows:
        print(f"[ERROR] No valid (phrase, label) rows found in {ground_truth_path}")
        return

    print(f"[INFO] Loaded {len(rows)} labeled phrases")
    classifier = SkillClassifier()
    if not classifier.is_trained:
        print("[WARN] Classifier is_trained=False — predictions will come from "
              "the RULE-BASED FALLBACK, not the ML model. This will NOT measure "
              "the TF-IDF + Logistic Regression classifier. Check that "
              "shared-data/models/skill_classifier.pkl loads correctly before "
              "trusting these numbers.")

    per_phrase = []
    y_true, y_pred = [], []

    for phrase, label in rows:
        result = classifier.predict(phrase)
        true_bin = 1 if label == 'Skill' else 0
        pred_bin = result['prediction']

        y_true.append(true_bin)
        y_pred.append(pred_bin)

        per_phrase.append({
            'phrase': phrase,
            'true_label': label,
            'predicted_label': result['label'],
            'confidence': round(result['confidence'], 4),
            'prob_skill': round(result.get('prob_skill', 0.0), 4),
            'correct': true_bin == pred_bin,
        })

    tp, tn, fp, fn = confusion_counts(y_true, y_pred)
    overall = metrics_from_counts(tp, tn, fp, fn)

    # ---------------- threshold sensitivity (optional) ----------------
    # For each candidate auto-approve threshold t: if prob_skill >= t, treat
    # as "auto-approved" and measure precision/recall of THAT decision
    # specifically (not the raw 0.5 predict() cutoff). This is the table
    # for the "magic number" limitation/future-work section.
    threshold_rows = []
    for t in thresholds:
        auto_true, auto_pred = [], []
        for (phrase, label), pf in zip(rows, per_phrase):
            true_bin = 1 if label == 'Skill' else 0
            auto_bin = 1 if pf['prob_skill'] >= t else 0
            auto_true.append(true_bin)
            auto_pred.append(auto_bin)
        atp, atn, afp, afn = confusion_counts(auto_true, auto_pred)
        m = metrics_from_counts(atp, atn, afp, afn)
        m['threshold'] = t
        m['num_auto_approved'] = atp + afp
        threshold_rows.append(m)

    # ---------------- write outputs ----------------
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    csv_path = output_dir / 'per_phrase_results.csv'
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['phrase', 'true_label', 'predicted_label',
                                                'confidence', 'prob_skill', 'correct'])
        writer.writeheader()
        writer.writerows(per_phrase)

    json_path = output_dir / 'results.json'
    json_path.write_text(json.dumps({
        'classifier_is_trained': classifier.is_trained,
        'per_phrase': per_phrase,
        'overall': overall,
        'threshold_sensitivity': threshold_rows,
    }, indent=2), encoding='utf-8')

    md_path = output_dir / 'results.md'
    lines = []
    lines.append("# Skill Classification Accuracy (ML-only)\n")
    lines.append(f"Classifier trained: **{classifier.is_trained}**  ")
    lines.append(f"Test phrases: **{overall['n']}**\n")
    lines.append("## Confusion Matrix\n")
    lines.append("| | Predicted: Skill | Predicted: Not Skill |")
    lines.append("|---|---|---|")
    lines.append(f"| **Actual: Skill** | TP = {overall['tp']} | FN = {overall['fn']} |")
    lines.append(f"| **Actual: Not Skill** | FP = {overall['fp']} | TN = {overall['tn']} |")
    lines.append("\n## Metrics\n")
    lines.append(f"- **Accuracy:** {overall['accuracy']:.1%}")
    lines.append(f"- **Precision:** {overall['precision']:.1%}")
    lines.append(f"- **Recall:** {overall['recall']:.1%}")
    lines.append(f"- **F1-score:** {overall['f1_score']:.1%}\n")

    if threshold_rows:
        lines.append("## Auto-approve threshold sensitivity\n")
        lines.append("| Threshold | # Auto-approved | Precision | Recall | F1 |")
        lines.append("|---|---|---|---|---|")
        for m in threshold_rows:
            lines.append(f"| {m['threshold']:.2f} | {m['num_auto_approved']} | "
                         f"{m['precision']:.1%} | {m['recall']:.1%} | {m['f1_score']:.1%} |")
        lines.append("")

    lines.append("## Misclassified phrases\n")
    wrong = [p for p in per_phrase if not p['correct']]
    if wrong:
        lines.append("| Phrase | True | Predicted | Confidence |")
        lines.append("|---|---|---|---|")
        for w in wrong:
            lines.append(f"| {w['phrase']} | {w['true_label']} | {w['predicted_label']} | {w['confidence']:.1%} |")
    else:
        lines.append("- none")

    md_path.write_text('\n'.join(lines), encoding='utf-8')

    # ---------------- NEW: print confusion matrix + formulas to console ----------------
    print_confusion_matrix(overall)
    print_formulas(overall)

    print("\n" + "=" * 60)
    print(f"Accuracy={overall['accuracy']:.1%}  Precision={overall['precision']:.1%}  "
          f"Recall={overall['recall']:.1%}  F1={overall['f1_score']:.1%}  (N={overall['n']})")
    print(f"Wrote: {csv_path}")
    print(f"Wrote: {json_path}")
    print(f"Wrote: {md_path}")
    print("=" * 60)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Test the ML skill classifier against human-labeled ground truth.")
    parser.add_argument('--ground-truth', required=True, help="CSV with columns: phrase,label (label is 'Skill' or 'Not Skill')")
    parser.add_argument('--output-dir', default='results', help="Where to write results (default: ./results)")
    parser.add_argument('--thresholds', default='0.65,0.75,0.85',
                         help="Comma-separated auto-approve thresholds to test, e.g. 0.65,0.75,0.85")
    args = parser.parse_args()

    thresholds = [float(t.strip()) for t in args.thresholds.split(',') if t.strip()]
    run(args.ground_truth, args.output_dir, thresholds)