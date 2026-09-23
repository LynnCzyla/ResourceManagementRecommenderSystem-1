"""
Skill Extraction / Classification Accuracy Evaluator
======================================================
Implements the "Skill Classification Accuracy" method from your thesis
evaluation guide: sample noun phrases the NLP+ML pipeline actually
extracted from real test resumes, have a human label them as ground
truth, then build the confusion matrix (Accuracy / Precision / Recall / F1)
-- the same way as the guide's sentiment-analysis example.

This is different from `python -m modules.skill_classifier`, which only
scores the model against phrases already reviewed in your Supabase
`feedback_training` table (train/test split of past feedback). This
script instead runs your production pipeline end-to-end
(NLPProcessor._extract_candidates -> NLPProcessor._is_likely_skill,
which includes the KB layer + the ML classifier + the Layer-3 fallback,
exactly like a real resume upload does) against test resumes you choose,
so the number you get reflects real-world extraction accuracy, not just
accuracy on the training feedback.

--------------------------------------------------------------------
STEP 1 -- generate a CSV to label
--------------------------------------------------------------------
    python skill_extraction_eval.py extract ^
        --resumes ./test_resumes ^
        --out sample_for_labeling.csv ^
        --sample-size 150

    - Put your test resumes as PLAIN TEXT files (.txt) in --resumes,
      one resume per file. This should be the OCR'd/extracted text your
      pipeline works on (module1_ocr's output), not the raw PDF/DOCX --
      if you don't already save that text somewhere, run your OCR step
      once per test resume and dump the result into a .txt file here.
    - Run this from inside your `python` project folder (the one that
      directly contains the `modules/` package), OR pass
      --project-root "D:/ResourceManagementRecommenderSystem/python".
    - This calls the exact same candidate-extraction + classification
      code your app uses in production, and writes every distinct
      candidate phrase plus what the system predicted for it.

--------------------------------------------------------------------
STEP 2 -- label it
--------------------------------------------------------------------
    Open sample_for_labeling.csv in Excel/Sheets/Google Sheets. Fill the
    empty `human_label` column with exactly "Skill" or "Not Skill" for
    every row -- this is your ground truth. Per the guide, ideally have
    someone else (or you, working "blind" without looking at the
    predicted_label column) do the labeling so it's independent.

--------------------------------------------------------------------
STEP 3 -- score it
--------------------------------------------------------------------
    python skill_extraction_eval.py evaluate ^
        --labeled sample_for_labeling.csv ^
        --out results.txt

    Prints (and saves) the confusion matrix, Accuracy, Precision, Recall,
    and F1 -- ready to paste into your results section.
"""

import argparse
import csv
import random
import sys
from pathlib import Path


# ------------------------------------------------------------------
# EXTRACT MODE
# ------------------------------------------------------------------

def _add_project_root_to_path(explicit_root):
    if explicit_root:
        root = Path(explicit_root).resolve()
    else:
        # Assume this script was dropped into the same "python" folder
        # that directly contains modules/ (same layout skill_classifier.py
        # expects). Override with --project-root if you keep it elsewhere.
        root = Path(__file__).resolve().parent
    root_str = str(root)
    if root_str not in sys.path:
        sys.path.insert(0, root_str)
    return root


def _load_nlp_processor(project_root):
    _add_project_root_to_path(project_root)
    from modules.module2_nlp import NLPProcessor  # noqa: local import by design
    print("[eval] Loading NLPProcessor (spaCy model + classifier)...")
    return NLPProcessor()


def _predicted_label_and_confidence(result):
    """
    Mirrors NLPProcessor._is_likely_skill()'s return shapes:
      - False                                -> rejected      => Not Skill
      - a truthy string                      -> KB/fallback match => Skill
      - (skill_name, status, ml_meta_or_None) -> status in
        ('auto_approved', 'needs_review')    => Skill either way
        (both mean the system extracts it as a skill; the distinction
        between the two is a review-workload detail, not a Skill/Not-Skill
        prediction)
    """
    if result is False or result is None:
        return "Not Skill", ""
    if isinstance(result, tuple):
        ml_meta = result[2] if len(result) >= 3 else None
        confidence = ml_meta.get("confidence") if ml_meta else ""
        return "Skill", confidence
    # Plain truthy string
    return "Skill", ""


def extract_mode(args):
    nlp = _load_nlp_processor(args.project_root)

    resumes_dir = Path(args.resumes)
    txt_files = sorted(resumes_dir.glob("*.txt"))
    if not txt_files:
        print(f"[eval] No .txt files found in {resumes_dir}.")
        print("[eval] Save each test resume's extracted text as a .txt file there first "
              "(see the docstring at the top of this script).")
        sys.exit(1)

    print(f"[eval] Found {len(txt_files)} resume file(s). Extracting candidates...")

    seen = {}  # normalized phrase -> row dict (first occurrence kept)
    for f in txt_files:
        text = f.read_text(encoding="utf-8", errors="ignore")
        if not text.strip():
            print(f"[eval]   {f.name}: empty, skipping")
            continue
        candidates, _trusted = nlp._extract_candidates(text)
        for candidate in candidates:
            key = nlp._normalize_skill_text(candidate)
            if not key or key in seen:
                continue
            result = nlp._is_likely_skill(candidate)
            predicted_label, confidence = _predicted_label_and_confidence(result)
            seen[key] = {
                "phrase": candidate,
                "predicted_label": predicted_label,
                "confidence": confidence,
                "source_file": f.name,
                "human_label": "",  # <-- you fill this in during Step 2
            }
        print(f"[eval]   {f.name}: {len(candidates)} candidate phrase(s) seen "
              f"({len(seen)} unique so far)")

    rows = list(seen.values())
    if not rows:
        print("[eval] No candidate phrases were extracted from any resume. Nothing to write.")
        sys.exit(1)

    random.seed(42)  # reproducible sample
    random.shuffle(rows)
    if args.sample_size and len(rows) > args.sample_size:
        rows = rows[: args.sample_size]

    fieldnames = ["phrase", "predicted_label", "confidence", "source_file", "human_label"]
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    n_skill = sum(1 for r in rows if r["predicted_label"] == "Skill")
    n_not_skill = len(rows) - n_skill
    print()
    print(f"[eval] Wrote {len(rows)} phrases to {args.out}")
    print(f"[eval]   System predicted Skill: {n_skill}  |  Not Skill: {n_not_skill}")
    print(f"[eval] Next: open {args.out}, fill in 'human_label' for every row "
          f"with exactly 'Skill' or 'Not Skill', then run the 'evaluate' command.")


# ------------------------------------------------------------------
# EVALUATE MODE
# ------------------------------------------------------------------

def _normalize_label(raw):
    if raw is None:
        return None
    v = raw.strip().lower()
    if v in ("skill", "1", "yes", "y", "true"):
        return "Skill"
    if v in ("not skill", "not_skill", "0", "no", "n", "false"):
        return "Not Skill"
    return None


def evaluate_mode(args):
    labeled_path = Path(args.labeled)
    if not labeled_path.exists():
        print(f"[eval] File not found: {labeled_path}")
        sys.exit(1)

    tp = fp = fn = tn = 0
    skipped = 0
    total_rows = 0

    with open(labeled_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if "human_label" not in (reader.fieldnames or []):
            print("[eval] CSV has no 'human_label' column -- did you run 'extract' first "
                  "and fill it in?")
            sys.exit(1)
        for row in reader:
            total_rows += 1
            predicted = _normalize_label(row.get("predicted_label"))
            actual = _normalize_label(row.get("human_label"))
            if predicted is None or actual is None:
                skipped += 1
                continue
            if actual == "Skill" and predicted == "Skill":
                tp += 1
            elif actual == "Skill" and predicted == "Not Skill":
                fn += 1
            elif actual == "Not Skill" and predicted == "Skill":
                fp += 1
            else:
                tn += 1

    scored = tp + fp + fn + tn
    if scored == 0:
        print("[eval] No fully-labeled rows found. Make sure 'human_label' is filled in "
              "with exactly 'Skill' or 'Not Skill' for each row.")
        sys.exit(1)

    accuracy = (tp + tn) / scored
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

    report_lines = [
        "Skill Classification Accuracy -- Evaluation Results",
        "=" * 55,
        f"Total rows in CSV:        {total_rows}",
        f"Scored (both labels ok):  {scored}",
        f"Skipped (missing/bad label): {skipped}",
        "",
        "Confusion Matrix",
        "-" * 55,
        f"{'':22}{'Predicted: Skill':>18}{'Predicted: Not Skill':>22}",
        f"{'Actual: Skill':22}{tp:>18}{fn:>22}",
        f"{'Actual: Not Skill':22}{fp:>18}{tn:>22}",
        "",
        f"Accuracy:  {accuracy:.2%}  ((TP+TN)/(TP+TN+FP+FN))",
        f"Precision: {precision:.2%}  (TP/(TP+FP))",
        f"Recall:    {recall:.2%}  (TP/(TP+FN))",
        f"F1 Score:  {f1:.2%}   (2*P*R/(P+R))",
    ]
    report = "\n".join(report_lines)
    print()
    print(report)

    if args.out:
        Path(args.out).write_text(report, encoding="utf-8")
        print(f"\n[eval] Saved to {args.out}")


# ------------------------------------------------------------------
# CLI
# ------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p_extract = sub.add_parser("extract", help="Extract candidate phrases + predictions from test resumes into a CSV for labeling")
    p_extract.add_argument("--resumes", required=True, help="Folder of .txt resume files")
    p_extract.add_argument("--out", default="sample_for_labeling.csv", help="Output CSV path")
    p_extract.add_argument("--sample-size", type=int, default=150, help="Max number of phrases to sample (0 = no limit)")
    p_extract.add_argument("--project-root", default=None, help='Path to the "python" folder containing modules/ (defaults to this script\'s folder)')
    p_extract.set_defaults(func=extract_mode)

    p_eval = sub.add_parser("evaluate", help="Score a labeled CSV and print the confusion matrix + metrics")
    p_eval.add_argument("--labeled", required=True, help="CSV produced by 'extract' with human_label filled in")
    p_eval.add_argument("--out", default=None, help="Optional path to save the results as a text file")
    p_eval.set_defaults(func=evaluate_mode)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
