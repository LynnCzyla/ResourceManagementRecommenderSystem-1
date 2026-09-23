"""
extraction_recall_test.py

Measures EXTRACTION RECALL: out of all the skills a human reader can find
in a resume, how many did the pipeline's extraction step actually surface
(as a candidate, whether it ended up auto_approved OR needs_review)?

This is DIFFERENT from the ML classifier accuracy test
(test_skill_classification_accuracy.py). That one asks "given a phrase,
did the classifier label it correctly?" This one asks "did the phrase
ever make it into the candidate list in the first place?" A skill that
never gets extracted can never be classified correctly, no matter how
good the ML model is - so this measures a different, earlier failure
point in the pipeline.

===========================================================================
FOLDER SETUP (do this before running)
===========================================================================
Put your test resumes and their matching "expected skills" files in the
SAME folder, using this naming convention:

    ocr_test_samples/
        cv_01.pdf
        cv_01_expected.txt      <- one skill per line, YOU write this
                                    by reading cv_01.pdf yourself
        cv_02.pdf
        cv_02_expected.txt
        ...

Each *_expected.txt should contain the skills a human reading that resume
would list - one per line, plain text, no numbering/bullets needed:

    Microsoft Excel
    Technical Quotation and Proposal Preparation
    Project Coordination and Monitoring
    Inside Sales Engineering
    ...

===========================================================================
USAGE
===========================================================================
    cd D:\\ResourceManagementRecommenderSystem\\python\\scripts
    python extraction_recall_test.py --folder ocr_test_samples

Writes results\\extraction_recall_results.csv and prints a summary table.
"""

import argparse
import csv
import json
import re
import subprocess
import sys
from pathlib import Path


def normalize(text):
    """Lowercase, strip leading bullet/garbage chars and punctuation,
    collapse whitespace. Mirrors the kind of cleanup the pipeline itself
    should eventually do, so matching isn't unfairly punished by known
    OCR bullet artifacts like '¢ ' or stray 'E '."""
    text = text.strip()
    # strip common OCR bullet artifacts at the start of the line
    text = re.sub(r'^[¢•\-\*eE]+\s+', '', text)
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def is_match(expected_norm, extracted_norm):
    """Permissive containment match in either direction - same spirit as
    the existing [DIAG] trace_skill check in module2_nlp.py
    ('trace_skill in c.lower()'). A hit either way counts as found,
    since resume skill phrasing rarely matches ground truth word-for-word."""
    if not expected_norm or not extracted_norm:
        return False
    return expected_norm in extracted_norm or extracted_norm in expected_norm


def run_pipeline(resume_path, employee_id="RECALL-TEST"):
    """Calls runner.py process_document and returns the parsed JSON result.
    stdout is reserved for the final JSON payload only (see runner.py's
    stdout/stderr contract) - all diagnostic prints go to stderr, so this
    capture is clean."""
    cmd = [sys.executable, "runner.py", "process_document",
           str(resume_path), employee_id, "resume"]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if proc.returncode != 0:
        raise RuntimeError(f"runner.py exited {proc.returncode}. stderr tail:\n"
                            f"{proc.stderr[-1000:]}")
    try:
        return json.loads(proc.stdout.strip())
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Could not parse JSON from stdout: {e}\n"
                            f"stdout was: {proc.stdout[:500]}")


def get_all_extracted_skills(result):
    """Pull every candidate skill the pipeline surfaced, regardless of
    whether the classifier auto-approved it or sent it for review - we
    want to know if it was EXTRACTED at all, not whether it was approved."""
    nlp = result.get("nlp", {}) or {}
    skills = set(nlp.get("skills", []) or [])
    skills.update(nlp.get("auto_approved", []) or [])
    skills.update(nlp.get("needs_review", []) or [])
    return skills


def main():
    ap = argparse.ArgumentParser(description="Extraction recall batch test")
    ap.add_argument("--folder", default="ocr_test_samples",
                     help="Folder containing resumes + *_expected.txt files")
    ap.add_argument("--pattern", default="*.pdf",
                     help="Glob pattern for resume files (default: *.pdf)")
    args = ap.parse_args()

    folder = Path(args.folder)
    resumes = sorted(folder.glob(args.pattern))
    if not resumes:
        print(f"[ERROR] No files matching '{args.pattern}' found in {folder}")
        return

    out_dir = Path("results")
    out_dir.mkdir(exist_ok=True)
    csv_path = out_dir / "extraction_recall_results.csv"

    rows = []
    total_expected = 0
    total_found = 0

    for resume_path in resumes:
        expected_path = resume_path.with_name(resume_path.stem + "_expected.txt")
        if not expected_path.exists():
            print(f"[SKIP] {resume_path.name} - no matching {expected_path.name} found")
            continue

        expected_skills = [
            line.strip() for line in expected_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        if not expected_skills:
            print(f"[SKIP] {resume_path.name} - {expected_path.name} is empty")
            continue

        print(f"[RUN] {resume_path.name} ({len(expected_skills)} expected skills)...")
        try:
            result = run_pipeline(resume_path)
        except RuntimeError as e:
            print(f"[ERROR] {resume_path.name}: {e}")
            continue

        extracted_raw = get_all_extracted_skills(result)
        extracted_norm = [normalize(s) for s in extracted_raw]

        missing = []
        found_count = 0
        for exp in expected_skills:
            exp_norm = normalize(exp)
            hit = any(is_match(exp_norm, ext_norm) for ext_norm in extracted_norm)
            if hit:
                found_count += 1
            else:
                missing.append(exp)

        recall = found_count / len(expected_skills) if expected_skills else 0.0
        total_expected += len(expected_skills)
        total_found += found_count

        rows.append({
            "resume": resume_path.name,
            "expected_count": len(expected_skills),
            "found_count": found_count,
            "recall_pct": round(recall * 100, 1),
            "missing_skills": "; ".join(missing),
        })

        print(f"       recall = {found_count}/{len(expected_skills)} "
              f"({recall*100:.1f}%)")
        if missing:
            print(f"       missing: {missing}")

    if not rows:
        print("\n[ERROR] No resumes were successfully tested. "
              "Check that *_expected.txt files exist and match resume filenames.")
        return

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "resume", "expected_count", "found_count", "recall_pct", "missing_skills"
        ])
        writer.writeheader()
        writer.writerows(rows)

    overall_recall = (total_found / total_expected * 100) if total_expected else 0.0

    print("\n" + "=" * 60)
    print(" EXTRACTION RECALL SUMMARY")
    print("=" * 60)
    print(f"{'Resume':<20} {'Expected':<10} {'Found':<10} {'Recall'}")
    print("-" * 60)
    for r in rows:
        print(f"{r['resume']:<20} {r['expected_count']:<10} "
              f"{r['found_count']:<10} {r['recall_pct']}%")
    print("-" * 60)
    print(f"{'OVERALL':<20} {total_expected:<10} {total_found:<10} "
          f"{overall_recall:.1f}%")
    print("=" * 60)
    print(f"\nWrote: {csv_path}")


if __name__ == "__main__":
    main()
