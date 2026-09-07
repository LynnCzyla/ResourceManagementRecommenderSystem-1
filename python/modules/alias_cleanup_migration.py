"""
Alias cleanup / rebuild migration for `skill_aliases`.

WHAT THIS DOES
---------------
Re-validates every existing row in `skill_aliases` against the NEW
true-equivalence rules in module2_nlp.NLPProcessor.is_true_alias(), and:

  1. Backs up the current skill_aliases table to a timestamped JSON file
     (before touching anything).
  2. Classifies every alias as KEEP (still passes is_true_alias) or
     SUSPICIOUS (fails the new rules — was created under the old, looser
     "semantic similarity is enough" logic).
  3. Prints a before/after count and a sample of what would be removed.
  4. In DRY RUN mode (the default) it stops here — nothing is written.
  5. Only with --apply does it actually delete the SUSPICIOUS rows from
     skill_aliases (never from `skills` — no skill is ever deleted) and
     invalidate the local Supabase facts cache so the next NLP process
     picks up the change immediately.

This script does NOT re-run alias *generation* — it only re-validates
alias pairs that already exist in the DB. To generate fresh aliases under
the new rules, run NLPProcessor.merge_synonyms_dynamically() as normal
(e.g. via your existing document-processing flow) after this cleanup.

USAGE
-----
    python alias_cleanup_migration.py                 # dry run (default) — safe, read-only
    python alias_cleanup_migration.py --apply          # actually delete the SUSPICIOUS rows
    python alias_cleanup_migration.py --apply --limit 500   # cap how many suspicious rows get deleted in one run

Run the dry run first, read the printed report, THEN run --apply.
"""
import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Make sure `module2_nlp` and `modules.*` are importable regardless of CWD.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from module2_nlp import NLPProcessor  # reuses the exact same is_true_alias() logic
from modules.supabase_client import supabase


def _backup_path():
    base_dir = Path(__file__).parent
    backup_dir = base_dir / 'shared-data' / 'skills_db' / 'alias_backups'
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    return backup_dir / f'skill_aliases_backup_{stamp}.json'


def _fetch_all_aliases(client):
    """Pull every skill_aliases row plus the skill names each id resolves to."""
    alias_rows = []
    page_size = 1000
    offset = 0

    while True:
        response = (
            client.table('skill_aliases')
            .select('id, master_skill_id, alias_skill_id, similarity')
            .range(offset, offset + page_size - 1)
            .execute()
        )

        page = response.data or []
        alias_rows.extend(page)

        print(
            f"[MIGRATION] Fetched alias rows {offset + 1}-"
            f"{offset + len(page)}"
        )

        if len(page) < page_size:
            break

        offset += page_size

    skills_rows = []
    offset = 0

    while True:
        response = (
            client.table('skills')
            .select('id, skill_name')
            .range(offset, offset + page_size - 1)
            .execute()
        )

        page = response.data or []
        skills_rows.extend(page)

        if len(page) < page_size:
            break

        offset += page_size

    id_to_name = {row['id']: row['skill_name'] for row in skills_rows}

    return alias_rows, id_to_name


def run(apply_changes: bool, limit: int):
    client = supabase.get_client()
    if not client:
        print("[MIGRATION] No Supabase client available — aborting. Check your Supabase credentials/config.")
        return 1

    print("[MIGRATION] Fetching current skill_aliases + skills from Supabase...")
    alias_rows, id_to_name = _fetch_all_aliases(client)
    before_count = len(alias_rows)
    print(f"[MIGRATION] Found {before_count} existing alias rows.")

    # ---- 1. Backup, unconditionally, before anything else ----
    backup_file = _backup_path()
    with open(backup_file, 'w', encoding='utf-8') as f:
        json.dump({
            'backed_up_at': datetime.now().isoformat(),
            'alias_rows': alias_rows,
            'id_to_name': id_to_name,
        }, f, indent=2, ensure_ascii=False)
    print(f"[MIGRATION] Backup written to: {backup_file}")

    # ---- 2. Load an NLPProcessor so we reuse the exact production is_true_alias() logic ----
    print("[MIGRATION] Loading NLP processor (this loads the spaCy model — may take a moment)...")
    nlp = NLPProcessor()

    keep, suspicious, unresolved = [], [], []
    for row in alias_rows:
        master_name = id_to_name.get(row['master_skill_id'])
        alias_name = id_to_name.get(row['alias_skill_id'])
        if not master_name or not alias_name:
            unresolved.append(row)
            continue

        accepted, category, reasons, sig = nlp._evaluate_equivalence(master_name, alias_name)
        record = {
            'row': row,
            'master': master_name,
            'alias': alias_name,
            'category': category,
            'reasons': reasons,
            'similarity': sig.get('similarity'),
        }
        (keep if accepted else suspicious).append(record)

    print("\n[MIGRATION] ===== REPORT =====")
    print(f"  Total existing aliases : {before_count}")
    print(f"  Still valid (KEEP)     : {len(keep)}")
    print(f"  Fails new rules (DROP) : {len(suspicious)}")
    print(f"  Unresolvable (skipped) : {len(unresolved)}  (dangling id reference — not touched)")

    def _sim_display(sim):
        # `similarity` is legitimately None when a pair was rejected by
        # the cheap lexical pre-filter in _evaluate_equivalence() before
        # spaCy similarity was ever computed - that's expected output,
        # not missing data, so display it as "N/A" instead of crashing
        # on `None:.2f`. Purely a display helper - the underlying record,
        # classification (KEEP/DROP), and reasons are untouched.
        return f"{sim:.2f}" if sim is not None else "N/A"

    if keep:
        # ============ REPORTING-ONLY ADDITION ============
        # Prints every KEEP record in full (no truncation - these are the
        # rows that would NOT be deleted, so the person reviewing the dry
        # run needs to see all of them, not a sample) before any --apply
        # decision is made. Does not touch is_true_alias(),
        # _evaluate_equivalence(), thresholds, or which rows land in
        # `keep` vs `suspicious` - that classification already happened
        # above; this only prints what's already in `keep`.
        print(f"\n[MIGRATION] All {len(keep)} KEEP aliases (would NOT be removed):")
        for rec in keep:
            print(f"    - \"{rec['alias']}\" <-> \"{rec['master']}\"  "
                  f"[{rec['category']}] sim={_sim_display(rec['similarity'])}  reason={'; '.join(rec['reasons'])}")
        # ====================================================

    if suspicious:
        print(f"\n[MIGRATION] Sample of aliases that would be REMOVED (showing up to 15 of {len(suspicious)}):")
        for rec in suspicious[:15]:
            print(f"    - \"{rec['alias']}\" <-> \"{rec['master']}\"  "
                  f"[{rec['category']}] sim={_sim_display(rec['similarity'])}  reason={'; '.join(rec['reasons'])}")

    if not apply_changes:
        print("\n[MIGRATION] DRY RUN — nothing was deleted. Re-run with --apply to remove the "
              f"{len(suspicious)} suspicious rows above. `skills` table is never touched by this script.")
        return 0

    to_delete = suspicious[:limit] if limit else suspicious
    print(f"\n[MIGRATION] --apply set — deleting {len(to_delete)} suspicious alias row(s) from skill_aliases "
          f"(skills table is NOT touched)...")

    deleted = 0
    for rec in to_delete:
        try:
            client.table('skill_aliases').delete().eq('id', rec['row']['id']).execute()
            deleted += 1
        except Exception as e:
            print(f"[MIGRATION] Error deleting alias row id={rec['row']['id']}: {e}")

    nlp._invalidate_facts_cache()

    after_count = before_count - deleted
    print(f"\n[MIGRATION] Done. Deleted {deleted} row(s).")
    print(f"[MIGRATION] Before: {before_count}  ->  After: {after_count}")
    print("[MIGRATION] Facts cache invalidated — the next NLP process will refetch fresh data from Supabase.")
    if len(suspicious) > deleted:
        print(f"[MIGRATION] {len(suspicious) - deleted} suspicious rows were left in place due to --limit; "
              f"re-run to continue.")
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--apply', action='store_true',
                         help='Actually delete the suspicious alias rows. Without this flag, the script only reports what it would do.')
    parser.add_argument('--limit', type=int, default=0,
                         help='Optional cap on how many suspicious rows to delete in one run (0 = no limit).')
    args = parser.parse_args()
    sys.exit(run(apply_changes=args.apply, limit=args.limit))