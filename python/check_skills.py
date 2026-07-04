# check_counts.py
import sys
import os
import json
from pathlib import Path

# Add python to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("=" * 60)
print("📊 SYSTEM COUNTS CHECK")
print("=" * 60)

# Get project root (one level up from python)
project_root = Path(__file__).parent.parent

# ============ CHECK learned_skills.json ============
json_path = project_root / 'shared-data' / 'skills_db' / 'learned_skills.json'

print(f"\n📁 Looking for: {json_path}")
print(f"   Exists: {json_path.exists()}")

if json_path.exists():
    try:
        # Try with UTF-8 encoding
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        learned_skills = data.get('learned_skills', [])
        print(f"\n📄 learned_skills.json:")
        print(f"   Total skills: {len(learned_skills)}")
        print(f"   Sample (first 10):")
        for skill in learned_skills[:10]:
            print(f"     • {skill}")
        if len(learned_skills) > 10:
            print(f"     ... and {len(learned_skills) - 10} more")
        
        # Check aliases
        aliases = data.get('skill_aliases', {})
        print(f"   Alias groups: {len(aliases)}")
        
        # Check categories
        categories = data.get('categories', {})
        print(f"   Categories: {len(categories)}")
        
    except Exception as e:
        print(f"   ❌ Error reading file: {e}")
        # Try with different encoding
        try:
            with open(json_path, 'r', encoding='utf-16') as f:
                data = json.load(f)
            print("   ✅ Read with UTF-16 encoding")
        except:
            try:
                with open(json_path, 'r', encoding='latin-1') as f:
                    data = json.load(f)
                print("   ✅ Read with Latin-1 encoding")
            except Exception as e2:
                print(f"   ❌ Still failing: {e2}")
else:
    print("   ❌ File not found!")

# ============ CHECK SUPABASE ============
try:
    from modules.supabase_client import supabase
    client = supabase.get_client()
    
    if client:
        print("\n📁 Checking Supabase...")
        
        # Count skills in database
        response = client.table('skills').select('id', count='exact').execute()
        db_count = len(response.data)
        print(f"   skills table: {db_count} skills")
        
        # Get list of skills
        response = client.table('skills').select('skill_name').execute()
        db_skills = [row['skill_name'] for row in response.data]
        if db_skills:
            print(f"   Sample (first 10):")
            for skill in db_skills[:10]:
                print(f"     • {skill}")
            if len(db_skills) > 10:
                print(f"     ... and {len(db_skills) - 10} more")
        
        # Count feedback_training
        response = client.table('feedback_training') \
            .select('id', count='exact') \
            .eq('label', 'Skill') \
            .execute()
        skill_samples = len(response.data)
        
        response = client.table('feedback_training') \
            .select('id', count='exact') \
            .eq('label', 'Not Skill') \
            .execute()
        not_skill_samples = len(response.data)
        
        print(f"\n   feedback_training:")
        print(f"     Skill samples: {skill_samples}")
        print(f"     Not Skill samples: {not_skill_samples}")
        print(f"     Total: {skill_samples + not_skill_samples}")
        
    else:
        print("\n❌ Could not connect to Supabase")
        
except Exception as e:
    print(f"\n❌ Supabase error: {e}")

print("\n" + "=" * 60)
print("💡 Summary:")
print(f"   learned_skills.json: {len(learned_skills) if json_path.exists() else 'N/A'} skills")
print(f"   Database (skills): {db_count if client else 'N/A'} skills")
print(f"   ML Training samples: {skill_samples + not_skill_samples if client else 'N/A'}")
print("\n   ✅ The numbers may differ - this is NORMAL!")
print("   - learned_skills.json = Knowledge base (unique skills)")
print("   - skills table = Employee records (unique skills)")
print("   - feedback_training = ML training data (includes duplicates)")
print("=" * 60)