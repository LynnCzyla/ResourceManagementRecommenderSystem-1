"""
Make paper-ready tables from rating_ranking_results.csv (output of rating_ranking_demo.js).
Run:  python make_sop5_tables.py rating_ranking_results.csv
Saves: sop5_rating_examples.csv  (open in Excel, copy into the paper)
"""
import sys, csv
from pathlib import Path

src = Path(sys.argv[1] if len(sys.argv) > 1 else "rating_ranking_results.csv")
rows = list(csv.DictReader(open(src, encoding="utf-8-sig")))
for r in rows:
    # accept alternative column names from earlier runs
    if "client_rating_avg_of_5" in r and "pm_rating_avg_of_5" not in r:
        r["pm_rating_avg_of_5"] = r.pop("client_rating_avg_of_5")
    if "pm_rating" in r and "pm_rating_avg_of_5" not in r:
        r["pm_rating_avg_of_5"] = r.pop("pm_rating")
    for k in ("project_id", "rank_before_no_rating", "rank_after_with_rating", "rank_change"):
        r[k] = int(float(r[k]))
    for k in ("pm_rating_avg_of_5", "perf_before", "perf_after", "score_before", "score_after"):
        r[k] = float(r[k])

# a REAL PM rating = performance differs from the 0.70 default
real = [r for r in rows if abs(r["perf_after"] - r["perf_before"]) > 1e-9]
moved = [r for r in real if r["rank_change"] != 0]
# keep only moves that match the rating direction (high rating -> up, low rating -> down)
clean = [r for r in moved if (r["rank_change"] > 0) == (r["perf_after"] > r["perf_before"])]
clean.sort(key=lambda r: (-abs(r["rank_change"]), -abs(r["score_after"] - r["score_before"])))

print(f"Rows (employee x project): {len(rows)}   Projects: {len({r['project_id'] for r in rows})}")
print(f"With a real PM rating: {len(real)}   Of those, changed rank: {len(moved)}")
print(f"Ranks that moved in the direction of the rating: {len(clean)}")

# best move UP and best move DOWN for EVERY project, so all projects show up
by_proj = {}
for r in clean:
    by_proj.setdefault(r["project_id"], []).append(r)
picked = []
for pid in sorted(by_proj):
    picked += [x for x in by_proj[pid] if x["rank_change"] > 0][:1]
    picked += [x for x in by_proj[pid] if x["rank_change"] < 0][:1]
picked.sort(key=lambda r: (r["project_id"], -abs(r["rank_change"])))
print(f"Projects with a usable example: {len(by_proj)}\n")

hdr = ["Project", "Employee", "PM rating", "Performance before->after", "Rank before", "Rank after", "Move", "Score before->after"]
print(" | ".join(hdr))
out = [hdr]
for r in picked:
    line = [r["project_id"], r["employee"], f"{r['pm_rating_avg_of_5']:.1f}/5",
            f"{r['perf_before']:.0%} -> {r['perf_after']:.0%}",
            r["rank_before_no_rating"], r["rank_after_with_rating"],
            f"{r['rank_change']:+d}", f"{r['score_before']:.3f} -> {r['score_after']:.3f}"]
    out.append(line)
    print(" | ".join(str(x) for x in line))

with open("sop5_rating_examples.csv", "w", newline="", encoding="utf-8-sig") as f:
    csv.writer(f).writerows(out)
print("\nSaved: sop5_rating_examples.csv")
print("Tip: pick 4-6 rows (mix of up and down) for the paper table. Check the score really beat the neighbors (no ties).")