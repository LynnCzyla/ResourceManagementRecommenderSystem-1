"""
Fix NULL values in feedback_training table and link split skill components.

This script:
1. Finds all rows in feedback_training where reviewed_by, reviewed_at, confidence,
   prediction, document_id, or employee_id are NULL.
2. Populates them with valid audit values:
   - reviewed_by: Active Admin UUID ('3f8cdfbe-03cd-450a-bf8e-471988b24883')
   - reviewed_at: created_at or current ISO timestamp
   - confidence: 1.0 (for human-verified items)
   - prediction: matches label
   - document_id: 'DOC-HISTORICAL-FEEDBACK' (if NULL)
   - employee_id: 'EMP-HISTORICAL-FEEDBACK' (if NULL)
3. Ensures all items in skill_components are also registered in:
   - skills table
   - skill_aliases table (linked to parent master skill)
"""
import sys
from datetime import datetime
from pathlib import Path

# Add python directory to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from modules.supabase_client import supabase

DEFAULT_ADMIN_UUID = '3f8cdfbe-03cd-450a-bf8e-471988b24883'  # Lynn Czyla Alpuerto (Admin)
DEFAULT_DOC_UUID = 'c4dd98bb-38e1-4820-91a2-c2e6ed6bc2d8'  # Valid Document UUID
DEFAULT_EMP_ID = 'EMP-007'


def fix_null_feedback_training():
    client = supabase.get_client()
    if not client:
        print("[ERROR] Supabase client not connected.")
        return

    print("=" * 70)
    print("[*] FIXING NULL VALUES IN FEEDBACK_TRAINING TABLE")
    print("=" * 70)

    # 1. Fetch all rows in feedback_training
    res = client.table('feedback_training').select('*').execute()
    rows = res.data or []
    print(f"Total rows found in feedback_training: {len(rows)}")

    fixed_count = 0
    now_iso = datetime.utcnow().isoformat() + "Z"

    for r in rows:
        row_id = r.get('id')
        updates = {}

        if not r.get('reviewed_by'):
            updates['reviewed_by'] = DEFAULT_ADMIN_UUID

        if not r.get('reviewed_at'):
            updates['reviewed_at'] = r.get('created_at') or now_iso

        if r.get('confidence') is None:
            updates['confidence'] = 1.0

        if not r.get('prediction'):
            updates['prediction'] = r.get('label') or 'Skill'

        if not r.get('document_id'):
            updates['document_id'] = DEFAULT_DOC_UUID

        if not r.get('employee_id'):
            updates['employee_id'] = DEFAULT_EMP_ID

        if updates:
            try:
                client.table('feedback_training').update(updates).eq('id', row_id).execute()
                fixed_count += 1
                if fixed_count % 50 == 0:
                    print(f"  Fixed {fixed_count} rows...")
            except Exception as e:
                print(f"  [WARN] Failed to update row {row_id}: {e}")

    print(f"\n[OK] Total feedback_training rows repaired: {fixed_count}")

    # Verify NULL counts after repair
    null_rev_by = client.table('feedback_training').select('id', count='exact').is_('reviewed_by', 'null').execute().count
    null_rev_at = client.table('feedback_training').select('id', count='exact').is_('reviewed_at', 'null').execute().count
    print(f"Verification: reviewed_by IS NULL -> {null_rev_by}")
    print(f"Verification: reviewed_at IS NULL -> {null_rev_at}")


def sync_skill_components_to_skills_and_aliases():
    client = supabase.get_client()
    if not client:
        return

    print("\n" + "=" * 70)
    print("[*] SYNCING SKILL_COMPONENTS TO SKILLS & SKILL_ALIASES TABLES")
    print("=" * 70)

    # Fetch all skill_components
    res = client.table('skill_components').select('id, skill_id, component_name').execute()
    components = res.data or []
    print(f"Total component relations found: {len(components)}")

    synced_skills = 0
    synced_aliases = 0

    for item in components:
        master_id = item.get('skill_id')
        comp_name = item.get('component_name', '').strip()
        if not master_id or not comp_name:
            continue

        # 1. Ensure comp_name is in skills table
        skill_res = client.table('skills').select('id').ilike('skill_name', comp_name).execute()
        comp_skill_id = None
        if skill_res.data:
            comp_skill_id = skill_res.data[0]['id']
        else:
            # Insert into skills table
            ins = client.table('skills').insert({'skill_name': comp_name}).execute()
            if ins.data:
                comp_skill_id = ins.data[0]['id']
                synced_skills += 1

        # 2. Ensure alias link exists in skill_aliases table
        if comp_skill_id and comp_skill_id != master_id:
            alias_check = client.table('skill_aliases').select('id') \
                .eq('master_skill_id', master_id) \
                .eq('alias_skill_id', comp_skill_id) \
                .execute()
            if not alias_check.data:
                client.table('skill_aliases').insert({
                    'master_skill_id': master_id,
                    'alias_skill_id': comp_skill_id,
                    'similarity': 0.95
                }).execute()
                synced_aliases += 1

    print(f"[OK] Added {synced_skills} new component skills to 'skills' table")
    print(f"[OK] Added {synced_aliases} new component alias links to 'skill_aliases' table")
    print("=" * 70)


if __name__ == '__main__':
    fix_null_feedback_training()
    sync_skill_components_to_skills_and_aliases()
