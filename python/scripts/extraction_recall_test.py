"""
extraction_recall_test.py

Measures EXTRACTION RECALL: of the skills a human finds in a resume, how many
did the pipeline surface as candidates (auto_approved OR needs_review)?

Reports two matching modes so you can show sensitivity:
  - strict : exact match, or containment where the shorter phrase covers
             >= 50% of the words of the longer one
  - loose  : any containment either way (original, permissive behavior)

Also groups results by tier (baseline/easy/medium/hard) from the filename
suffix, e.g. cv_01_hard.pdf -> tier "hard".

Folder layout:
    cv_01_easy.pdf
    cv_01_easy_expected.txt     <- one skill per line

Usage (run from the folder that contains runner.py):
    python extraction_recall_test.py --folder ocr_test_samples_v2
    python extraction_recall_test.py --folder ocr_test_samples_v2 --out-name recall_v2
"""
import argparse
import csv
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

TIER_ORDER = ["baseline", "easy", "medium", "hard"]


def normalize(text):
    text = text.strip()
    text = re.sub(r'^[¢•\-\*eE]+\s+', '', text)   # OCR bullet artifacts
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s]', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def match_loose(exp, ext):
    if not exp or not ext:
        return False
    return exp in ext or ext in exp


def match_strict(exp, ext):
    if not exp or not ext:
        return False
    if exp == ext:
        return True
    short, long_ = sorted([exp, ext], key=len)
    if short not in long_:
        return False
    return len(short.split()) / len(long_.split()) >= 0.5


def run_pipeline(resume_path, employee_id="RECALL-TEST"):
    cmd = [sys.executable, "runner.py", "process_document",
           str(resume_path), employee_id, "resume"]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if proc.returncode != 0:
        raise RuntimeError(f"runner.py exited {proc.returncode}. stderr tail:\n{proc.stderr[-1000:]}")
    try:
        return json.loads(proc.stdout.strip())
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Could not parse JSON: {e}\nstdout: {proc.stdout[:500]}")


def get_all_extracted_skills(result):
    nlp = result.get("nlp", {}) or {}
    skills = set(nlp.get("skills", []) or [])
    skills.update(nlp.get("auto_approved", []) or [])
    skills.update(nlp.get("needs_review", []) or [])
    return skills


def tier_of(stem):
    suffix = stem.rsplit("_", 1)[-1]
    return suffix if suffix in TIER_ORDER else "untiered"


def score(expected_skills, extracted_norm, matcher):
    found, missing = 0, []
    for exp in expected_skills:
        e = normalize(exp)
        if any(matcher(e, x) for x in extracted_norm):
            found += 1
        else:
            missing.append(exp)
    return found, missing


def main():
    ap = argparse.ArgumentParser(description="Extraction recall batch test")
    ap.add_argument("--folder", default="ocr_test_samples_v2")
    ap.add_argument("--pattern", default="*.pdf")
    ap.add_argument("--out-name", default="extraction_recall_results",
                    help="Output CSV base name (avoids overwriting old runs)")
    args = ap.parse_args()

    folder = Path(args.folder)
    resumes = sorted(folder.glob(args.pattern))
    if not resumes:
        print(f"[ERROR] No files matching '{args.pattern}' in {folder}")
        return

    out_dir = Path("results")
    out_dir.mkdir(exist_ok=True)
    csv_path = out_dir / f"{args.out_name}.csv"

    rows = []
    tiers = defaultdict(lambda: dict(docs=0, exp=0, strict=0, loose=0))

    for resume_path in resumes:
        expected_path = resume_path.with_name(resume_path.stem + "_expected.txt")
        if not expected_path.exists():
            print(f"[SKIP] {resume_path.name} - no {expected_path.name}")
            continue
        expected = [l.strip() for l in expected_path.read_text(encoding="utf-8").splitlines() if l.strip()]
        if not expected:
            print(f"[SKIP] {resume_path.name} - {expected_path.name} is empty")
            continue

        print(f"[RUN] {resume_path.name} ({len(expected)} expected skills)...")
        try:
            result = run_pipeline(resume_path)
        except RuntimeError as e:
            print(f"[ERROR] {resume_path.name}: {e}")
            continue

        extracted_norm = [normalize(s) for s in get_all_extracted_skills(result)]
        f_strict, miss_strict = score(expected, extracted_norm, match_strict)
        f_loose, _ = score(expected, extracted_norm, match_loose)

        tier = tier_of(resume_path.stem)
        t = tiers[tier]
        t["docs"] += 1
        t["exp"] += len(expected)
        t["strict"] += f_strict
        t["loose"] += f_loose

        rows.append({
            "resume": resume_path.name,
            "tier": tier,
            "expected_count": len(expected),
            "found_strict": f_strict,
            "recall_strict_pct": round(f_strict / len(expected) * 100, 1),
            "found_loose": f_loose,
            "recall_loose_pct": round(f_loose / len(expected) * 100, 1),
            "missing_skills_strict": "; ".join(miss_strict),
        })
        print(f"       strict={f_strict}/{len(expected)} ({f_strict/len(expected)*100:.1f}%)  "
              f"loose={f_loose}/{len(expected)} ({f_loose/len(expected)*100:.1f}%)")
        if miss_strict:
            print(f"       missing (strict): {miss_strict}")

    if not rows:
        print("\n[ERROR] No resumes were tested. Check *_expected.txt names.")
        return

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    print("\n" + "=" * 72)
    print(" EXTRACTION RECALL BY TIER")
    print("=" * 72)
    print(f"{'Tier':<10}{'Docs':<7}{'Expected':<10}{'Strict':<16}{'Loose'}")
    print("-" * 72)
    tot = dict(docs=0, exp=0, strict=0, loose=0)
    for tier in TIER_ORDER + ["untiered"]:
        t = tiers.get(tier)
        if not t or not t["exp"]:
            continue
        print(f"{tier:<10}{t['docs']:<7}{t['exp']:<10}"
              f"{t['strict']:>3} ({t['strict']/t['exp']*100:5.1f}%)   "
              f"{t['loose']:>3} ({t['loose']/t['exp']*100:5.1f}%)")
        for k in tot:
            tot[k] += t[k]
    print("-" * 72)
    print(f"{'OVERALL':<10}{tot['docs']:<7}{tot['exp']:<10}"
          f"{tot['strict']:>3} ({tot['strict']/tot['exp']*100:5.1f}%)   "
          f"{tot['loose']:>3} ({tot['loose']/tot['exp']*100:5.1f}%)")
    print("=" * 72)
    print(f"\nWrote: {csv_path}")


if __name__ == "__main__":
    main()