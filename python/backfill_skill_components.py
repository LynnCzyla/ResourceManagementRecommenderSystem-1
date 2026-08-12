# backfill_skill_components.py
"""
ONE-TIME backfill: split existing compound skills (already sitting in the
`skills` table) into atomic components and populate `skill_components`.

Why this exists: module2_nlp.py's splitter only runs when a skill gets
approved through learn_from_feedback() going forward. Any skill approved
BEFORE that feature existed never gets split unless someone re-approves it.
This script closes that gap for skills that are already in the database.

Egress-safety, by design:
  - Exactly ONE SELECT against `skills` (id, skill_name, category).
  - Exactly ONE SELECT against `skill_components` (skill_id only, to know
    what's already been split so re-running this script is a no-op for
    skills already processed).
  - Writes (upserts) only for skills that are actually compound (contain
    " and ") and aren't already backfilled. Writes don't count against
    Supabase egress the way SELECTs/downloads do.
  - Does NOT load spaCy / NLPProcessor at all, so it runs in seconds, not
    the ~10-20s a full NLP init takes.
  - Run this manually, once, whenever you want to catch up any skills
    approved outside the normal pipeline. It is NOT called automatically
    by the upload/processing pipeline, so it adds zero recurring egress.

Usage:
    cd python
    python backfill_skill_components.py            # do it for real
    python backfill_skill_components.py --dry-run   # preview only, no writes
"""
import sys
import os
import re
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from modules.supabase_client import supabase

# ============ Mirrors module2_nlp.py's LEADING_CONNECTORS / cleaning rules ============
LEADING_CONNECTORS = ('and', 'of', 'for', 'with', 'to', 'in', 'on', 'at')


def clean_candidate_text(text):
    """Same cleanup module2_nlp.py's NLPProcessor._clean_candidate_text does -
    duplicated here (pure regex, no spaCy) so this script has zero heavy deps."""
    if not text:
        return ""
    text = re.sub(r'\([^)]*\)', '', text)
    text = re.sub(r'[()]', '', text)
    text = re.sub(r'^[\s•\-\*\(\)\[\]/]+', '', text)
    text = re.sub(r'[\s•\-\*\(\)\[\]/]+$', '', text)
    if text.startswith('[') and text.endswith(']'):
        text = text[1:-1]
    text = re.sub(
        r'^(?:' + '|'.join(LEADING_CONNECTORS) + r')\s+',
        '', text, flags=re.IGNORECASE
    )
    text = re.sub(r'^[\s•\-\*\(\)\[\]]+', '', text)
    text = re.sub(r'[,;:]$', '', text)
    text = ' '.join(text.split())
    if len(text.split()) > 1:
        text = text.title()
    return text


def split_into_atomic_skills(compound_skill):
    """Identical logic to NLPProcessor._split_into_atomic_skills() in
    module2_nlp.py. Kept in sync manually - if you change one, change both."""
    if not compound_skill:
        return []

    parts = re.split(r'\s+and\s+', compound_skill.strip(), flags=re.IGNORECASE)
    if len(parts) != 2:
        return []

    left, right = parts[0].strip(), parts[1].strip()
    if not left or not right:
        return []

    left_words = left.split()
    right_words = right.split()

    trailing_word = right_words[-1] if right_words else None
    left_last_word = left_words[-1] if left_words else None

    if trailing_word and left_last_word and left_last_word.lower() != trailing_word.lower():
        left_component = f"{left} {trailing_word}"
    else:
        left_component = left

    right_component = right

    components = [clean_candidate_text(left_component), clean_candidate_text(right_component)]
    seen = set()
    result = []
    for c in components:
        if c and c.lower() not in seen:
            seen.add(c.lower())
            result.append(c)

    # Safety: bail out if either component is a single generic word (means
    # this is a shared-PREFIX compound, not the shared-SUFFIX pattern this
    # splitter targets) - see module2_nlp.py's _split_into_atomic_skills for
    # the full explanation. Keep these two functions in sync manually.
    if any(len(c.split()) < 2 for c in result):
        return []

    return result


def main():
    parser = argparse.ArgumentParser(description="Backfill skill_components from existing skills")
    parser.add_argument('--dry-run', action='store_true', help="Preview without writing to Supabase")
    args = parser.parse_args()

    client = supabase.get_client()
    if not client:
        print("[BACKFILL] ❌ Supabase client not available. Check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.")
        sys.exit(1)

    print("=" * 60)
    print("🧩 SKILL_COMPONENTS BACKFILL")
    print("=" * 60)

    # ---- 1 SELECT: all skills ----
    # NOTE: only `id, skill_name` — the live `skills` table has NO `category`
    # column (confirmed via a live Postgrest 42703 "column does not exist"
    # error), so it must never be requested or written here.
    skills_resp = client.table('skills').select('id, skill_name').execute()
    all_skills = skills_resp.data or []
    print(f"[BACKFILL] Fetched {len(all_skills)} skills from `skills` table.")

    # ---- 1 SELECT: which skill_ids already have components (so reruns are a no-op) ----
    existing_resp = client.table('skill_components').select('skill_id').execute()
    already_done_ids = {row['skill_id'] for row in (existing_resp.data or [])}
    print(f"[BACKFILL] {len(already_done_ids)} skills already have components saved.")

    to_process = [s for s in all_skills if s['id'] not in already_done_ids]
    print(f"[BACKFILL] {len(to_process)} skills left to check for compound phrasing.\n")

    compound_found = 0
    components_written = 0

    for row in to_process:
        skill_id = row['id']
        skill_name = row['skill_name']

        components = split_into_atomic_skills(skill_name)
        if not components:
            continue  # not a compound skill (no " and "), nothing to split

        compound_found += 1
        print(f"[SPLIT] '{skill_name}' -> {components}")

        if args.dry_run:
            continue

        try:
            for component_name in components:
                client.table('skill_components').upsert(
                    {'skill_id': skill_id, 'component_name': component_name},
                    on_conflict='skill_id,component_name'
                ).execute()
                components_written += 1
        except Exception as e:
            print(f"[BACKFILL] ⚠️  Error saving components for '{skill_name}': {e}")

    print("\n" + "=" * 60)
    if args.dry_run:
        print(f"[DRY RUN] Would split {compound_found} compound skills into components.")
        print("[DRY RUN] No writes were made. Re-run without --dry-run to apply.")
    else:
        print(f"[DONE] {compound_found} compound skills split, {components_written} component rows written.")
    print("=" * 60)


if __name__ == "__main__":
    main()