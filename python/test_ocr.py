"""
Test Full Pipeline: OCR + NLP
"""
import sys
import time
import json
from pathlib import Path

sys.path.append(str(Path(__file__).parent))

from modules.module1_ocr import OCRProcessor
from modules.module2_nlp import NLPProcessor

def test_full_pipeline():
    print("=" * 70)
    print("🧪 TESTING FULL PIPELINE: OCR + NLP")
    print("=" * 70)
    
    # ========================================
    # STEP 1: OCR - Extract text
    # ========================================
    print("\n📦 STEP 1: OCR Processing...")
    print("-" * 50)
    
    ocr = OCRProcessor()
    
    file_path = r'D:\ResourceManagementRecommenderSystem\shared-data\uploads\scanned_WEA_Employee_Competency_Profile.pdf'
    
    ocr_start = time.time()
    try:
        ocr_result = ocr.extract_text(file_path)
        ocr_time = time.time() - ocr_start
        
        print(f"✅ OCR SUCCESS!")
        print(f"   Method: {ocr_result['method']}")
        print(f"   Words: {ocr_result['word_count']}")
        print(f"   Chars: {ocr_result['char_count']}")
        print(f"   Time: {ocr_time:.2f}s")
        print(f"   Preview: {ocr_result['cleaned_text'][:200]}...")
        
    except Exception as e:
        print(f"❌ OCR FAILED: {e}")
        return
    
    # ========================================
    # STEP 2: NLP - Extract skills
    # ========================================
    print("\n🤖 STEP 2: NLP Processing...")
    print("-" * 50)
    
    nlp = NLPProcessor()
    
    nlp_start = time.time()
    try:
        nlp_result = nlp.extract_skills_with_categories(ocr_result['cleaned_text'])
        nlp_time = time.time() - nlp_start
        
        print(f"✅ NLP SUCCESS!")
        print(f"   Total Skills: {nlp_result['total_skills']}")
        print(f"   Licenses: {nlp_result['licenses']}")
        print(f"   Persons: {nlp_result['persons']}")
        print(f"   Organizations: {nlp_result['organizations']}")
        print(f"   Time: {nlp_time:.2f}s")
        
        # Show categorized skills
        print(f"\n   📂 Categories:")
        for category, skills in nlp_result['categorized'].items():
            if skills:
                print(f"      {category}: {', '.join(skills)}")
        
    except Exception as e:
        print(f"❌ NLP FAILED: {e}")
        return
    
    # ========================================
    # STEP 3: Combined Results
    # ========================================
    print("\n" + "=" * 70)
    print("✅ FULL PIPELINE COMPLETE!")
    print("=" * 70)
    print(f"📊 Total Time: {ocr_time + nlp_time:.2f}s")
    print(f"   - OCR: {ocr_time:.2f}s")
    print(f"   - NLP: {nlp_time:.2f}s")
    
    # ========================================
    # STEP 4: Database Records Preview
    # ========================================
    print("\n💾 Database Records Preview:")
    print("-" * 50)
    
    db_records = nlp.prepare_db_records('EMP-004', ocr_result['cleaned_text'])
    
    print(f"   Employee Update:")
    print(f"      - Skills Extracted: {len(db_records['employee_update']['skills_extracted'])}")
    print(f"      - PRC License: {db_records['employee_update']['prc_license_num']}")
    print(f"      - PRC Verified: {db_records['employee_update']['prc_verified']}")
    
    print(f"\n   Skills Master: {len(db_records['skills_master'])}")
    for skill in db_records['skills_master'][:5]:
        print(f"      - {skill['skill_tag']} ({skill['category']})")
    
    print(f"\n   Employee Skills: {len(db_records['employee_skills'])}")
    print(f"   Categories: {db_records['summary']['categories_found']}")
    
    print("\n" + "=" * 70)
    print("✅ TEST COMPLETE!")
    print("=" * 70)
    
    return {
        'ocr': ocr_result,
        'nlp': nlp_result,
        'db_records': db_records,
        'times': {
            'ocr': ocr_time,
            'nlp': nlp_time,
            'total': ocr_time + nlp_time
        }
    }

if __name__ == "__main__":
    test_full_pipeline()