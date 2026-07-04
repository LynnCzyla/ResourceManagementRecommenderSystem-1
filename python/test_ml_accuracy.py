# check_ml_status.py
import sys
import os
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from modules.module2_nlp import NLPProcessor

print("=" * 60)
print("🔍 ML STATUS CHECK")
print("=" * 60)

nlp = NLPProcessor()

print(f"\n📊 Current Status:")
print(f"   ML Active (use_ml): {nlp.use_ml}")
print(f"   Model Trained: {nlp.classifier.is_trained}")

if nlp.classifier.is_trained and not nlp.use_ml:
    print("\n⚠️ PROBLEM: ML is trained but NOT active!")
    print("   Solution: Set use_ml = True in module2_nlp.py")
    
    # Option to fix
    response = input("\n   Would you like to activate ML now? (y/n): ")
    if response.lower() == 'y':
        nlp.use_ml = True
        nlp._save_data()
        print("   ✅ ML ACTIVATED!")
elif nlp.classifier.is_trained and nlp.use_ml:
    print("\n✅ ML IS ACTIVE! Should see ML logs on upload.")
else:
    print("\n❌ ML is not trained yet.")

print("\n" + "=" * 60)