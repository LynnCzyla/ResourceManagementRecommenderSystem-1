"""
summarize_tiers.py
Per-tier OCR table (pooled counts) + per-CV accuracy table from results.csv.

    python summarize_tiers.py ocr_test_samples_v2/results_v7/results.csv
"""
import csv
import sys
from collections import defaultdict

path = sys.argv[1] if len(sys.argv) > 1 else "ocr_test_samples_v2/results_v7/results.csv"
ORDER = ("baseline", "easy", "medium", "hard")
tiers = defaultdict(lambda: dict(n=0, s=0, d=0, i=0, docs=0))
per_cv = defaultdict(dict)

with open(path, encoding="utf-8") as f:
    for r in csv.DictReader(f):
        name = r.get("file") or ""
        if not name.endswith(".pdf") or not r.get("substitutions"):
            continue
        cv, tier = name[:-4].rsplit("_", 1)
        t = tiers[tier]
        t["n"] += int(r["words_gt"]); t["s"] += int(r["substitutions"])
        t["d"] += int(r["deletions"]); t["i"] += int(r["insertions"]); t["docs"] += 1
        per_cv[cv][tier] = float(r["accuracy_pct"])

print("| Tier | Docs | GT words | Sub | Del | Ins | Word accuracy | WER |")
print("|---|---|---|---|---|---|---|---|")
for tier in ORDER:
    t = tiers[tier]
    if not t["n"]:
        continue
    acc = (t["n"] - t["s"] - t["d"]) / t["n"] * 100
    wer = (t["s"] + t["d"] + t["i"]) / t["n"]
    print(f"| {tier} | {t['docs']} | {t['n']} | {t['s']} | {t['d']} | {t['i']} | {acc:.1f}% | {wer:.3f} |")

print("\nPer-CV word accuracy (%):")
print("| CV | baseline | easy | medium | hard |")
print("|---|---|---|---|---|")
for cv in sorted(per_cv):
    row = per_cv[cv]
    print(f"| {cv} | " + " | ".join(f"{row[t]:.1f}" if t in row else "-" for t in ORDER) + " |")