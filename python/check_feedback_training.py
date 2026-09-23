# check_feedback_training.py
"""
Inspect the contents/health of the feedback_training table:
  - total rows
  - how many are "human-reviewed" per the classifier's own definition
    (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  - how many have reviewed_by as an EMPTY STRING '' (passes IS NOT NULL
    but isn't really "reviewed" by anyone - this is the gotcha we
    discussed)
  - Skill vs Not Skill balance, both overall and within reviewed-only
  - duplicate phrases (same phrase, possibly different label/review state)
  - a quick sample dump you can eyeball

Run from the `python` folder (same place you already run check_skills.py):
    python check_feedback_training.py
    python check_feedback_training.py --export results\feedback_training_dump.csv
"""
import sys
import os
import argparse
import csv
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from modules.supabase_client import supabase


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--export', default=None,
                         help='Optional path to dump ALL rows to CSV for manual review')
    args = parser.parse_args()

    client = supabase.get_client()
    if not client:
        print("[ERROR] Could not connect to Supabase. Check .env / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.")
        return

    print("=" * 70)
    print("FEEDBACK_TRAINING TABLE HEALTH CHECK")
    print("=" * 70)

    # Pull everything relevant in one shot - table is small enough (thousands
    # of rows at most) that this is fine as a one-off diagnostic script.
    response = client.table('feedback_training') \
        .select('id, phrase, label, reviewed_by, reviewed_at, created_at') \
        .execute()
    rows = response.data or []

    total = len(rows)
    print(f"\nTotal rows in feedback_training: {total}")

    if total == 0:
        print("Table is empty - nothing else to check.")
        return

    # ---- Reviewed vs not, per the classifier's exact definition ----
    def is_null_or_missing(v):
        return v is None

    def is_blank_string(v):
        return isinstance(v, str) and v.strip() == ''

    reviewed_strict = [
        r for r in rows
        if not is_null_or_missing(r.get('reviewed_by')) and not is_null_or_missing(r.get('reviewed_at'))
    ]
    reviewed_but_blank_reviewer = [
        r for r in reviewed_strict if is_blank_string(r.get('reviewed_by'))
    ]
    not_reviewed_null_reviewer = [
        r for r in rows if is_null_or_missing(r.get('reviewed_by'))
    ]
    not_reviewed_null_date = [
        r for r in rows if is_null_or_missing(r.get('reviewed_at'))
    ]

    print(f"\n--- Reviewed status (classifier's definition: reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL) ---")
    print(f"  Counted as 'human-reviewed' (used for training): {len(reviewed_strict)}")
    print(f"  Of those, reviewed_by is an EMPTY STRING '' (passes NULL check but nobody really reviewed it): {len(reviewed_but_blank_reviewer)}")
    print(f"  reviewed_by is NULL (excluded from training): {len(not_reviewed_null_reviewer)}")
    print(f"  reviewed_at is NULL (excluded from training): {len(not_reviewed_null_date)}")

    if reviewed_but_blank_reviewer:
        print(f"\n  [WARNING] {len(reviewed_but_blank_reviewer)} rows have reviewed_by = '' - these ARE")
        print(f"  being included in training as if human-reviewed, but nobody's name/id is actually there.")
        print(f"  Sample phrases:")
        for r in reviewed_but_blank_reviewer[:10]:
            print(f"    - {r.get('phrase')!r} (label={r.get('label')})")

    # ---- Label balance ----
    def label_counts(row_list):
        c = Counter(r.get('label') for r in row_list)
        return c

    print(f"\n--- Label balance (ALL rows) ---")
    for label, count in label_counts(rows).items():
        print(f"  {label}: {count}")

    print(f"\n--- Label balance (REVIEWED rows only - what the model actually trains on) ---")
    reviewed_label_counts = label_counts(reviewed_strict)
    for label, count in reviewed_label_counts.items():
        print(f"  {label}: {count}")
    skill_n = reviewed_label_counts.get('Skill', 0)
    not_skill_n = reviewed_label_counts.get('Not Skill', 0)
    if skill_n + not_skill_n > 0:
        ratio = skill_n / (skill_n + not_skill_n) * 100
        print(f"  -> Skill makes up {ratio:.1f}% of reviewed training data")
        if ratio > 70 or ratio < 30:
            print(f"  [WARNING] Class imbalance - consider adding more of the minority class.")

    # ---- Invalid labels (not 'Skill' or 'Not Skill') ----
    invalid_labels = [r for r in rows if r.get('label') not in ('Skill', 'Not Skill')]
    if invalid_labels:
        print(f"\n--- Rows with unexpected label values (excluded from training regardless of review status): {len(invalid_labels)} ---")
        for label, count in Counter(r.get('label') for r in invalid_labels).items():
            print(f"  {label!r}: {count}")

    # ---- Duplicate phrases ----
    phrase_counter = Counter(
        str(r.get('phrase')).strip().lower() for r in rows if r.get('phrase')
    )
    dupes = {p: c for p, c in phrase_counter.items() if c > 1}
    print(f"\n--- Duplicate phrases (same phrase text appears more than once): {len(dupes)} unique phrases ---")
    if dupes:
        # Show the ones with the most duplication first
        for phrase, count in sorted(dupes.items(), key=lambda x: -x[1])[:15]:
            print(f"    x{count}: {phrase!r}")
        if len(dupes) > 15:
            print(f"    ... and {len(dupes) - 15} more")

    # ---- Empty/whitespace-only phrases ----
    empty_phrases = [r for r in rows if not str(r.get('phrase') or '').strip()]
    if empty_phrases:
        print(f"\n--- Rows with empty/blank phrase text (always excluded from training): {len(empty_phrases)} ---")

    # ---- Sample of reviewed data ----
    print(f"\n--- Sample of REVIEWED rows (first 10) ---")
    for r in reviewed_strict[:10]:
        print(f"    [{r.get('label')}] {r.get('phrase')!r}  (reviewed_by={r.get('reviewed_by')!r})")

    print(f"\n--- Sample of UNREVIEWED rows (first 10) ---")
    unreviewed = [r for r in rows if r not in reviewed_strict]
    for r in unreviewed[:10]:
        print(f"    [{r.get('label')}] {r.get('phrase')!r}  (reviewed_by={r.get('reviewed_by')!r}, reviewed_at={r.get('reviewed_at')!r})")

    # ---- Optional CSV export of everything for manual review ----
    if args.export:
        os.makedirs(os.path.dirname(args.export) or '.', exist_ok=True)
        with open(args.export, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['id', 'phrase', 'label', 'reviewed_by', 'reviewed_at', 'created_at', 'is_reviewed_strict'])
            reviewed_ids = {r.get('id') for r in reviewed_strict}
            for r in rows:
                writer.writerow([
                    r.get('id'), r.get('phrase'), r.get('label'),
                    r.get('reviewed_by'), r.get('reviewed_at'), r.get('created_at'),
                    r.get('id') in reviewed_ids
                ])
        print(f"\n[OK] Exported {total} rows to {args.export}")

    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"  Total rows:                {total}")
    print(f"  Human-reviewed (trainable): {len(reviewed_strict)}")
    print(f"  Reviewed but blank reviewer_by: {len(reviewed_but_blank_reviewer)}  <- check this!")
    print(f"  Unreviewed (not used):     {total - len(reviewed_strict)}")
    print(f"  Duplicate phrases:         {len(dupes)}")
    print("=" * 70)


if __name__ == '__main__':
    main()
