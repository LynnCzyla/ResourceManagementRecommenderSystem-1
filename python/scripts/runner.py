import sys
import json
import time
from pathlib import Path

# Force unbuffered output
sys.stdout = sys.stdout.detach()
sys.stdout = open(sys.stdout.fileno(), 'w', buffering=1)

# Silence prints (they go to stderr)
import builtins
builtins.print = lambda *a, **k: None

sys.path.append(str(Path(__file__).parent.parent))

try:
    from modules.module1_ocr import OCRProcessor
    from modules.module2_nlp import NLPProcessor
    from modules.module3_integration import DocumentProcessor
except ImportError as e:
    sys.stdout.write(json.dumps({"success": False, "error": f"Import error: {str(e)}"}))
    sys.stdout.flush()
    sys.exit(1)

class Runner:
    def __init__(self):
        self.processor = DocumentProcessor()
        self.nlp = None  # Lazy load for learning
    
    def process_document(self, image_path, employee_id, doc_type):
        try:
            start = time.time()
            result = self.processor.process_document_complete(image_path, employee_id, doc_type)
            if result and result.get('success') and result.get('ocr'):
                result['ocr']['processing_time'] = time.time() - start
            return result
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def learn_feedback(self, approved_skills, rejected_skills):
        """Update learning from user feedback"""
        try:
            # Lazy load NLP processor
            if self.nlp is None:
                self.nlp = NLPProcessor()
            
            # Parse if strings, otherwise use as is
            if isinstance(approved_skills, str):
                approved = json.loads(approved_skills)
            else:
                approved = approved_skills or []
            
            if isinstance(rejected_skills, str):
                rejected = json.loads(rejected_skills)
            else:
                rejected = rejected_skills or []
            
            print(f"[LEARN] Processing {len(approved)} approved, {len(rejected)} rejected", file=sys.stderr)
            
            # Update the skill dictionary
            skills_learned = 0
            for skill in approved:
                if skill and skill not in self.nlp.learned_skills:
                    self.nlp.learned_skills.add(skill)
                    self.nlp.skill_dictionary[skill] = 'Other'
                    skills_learned += 1
                    print(f"[LEARN] Learned: {skill}", file=sys.stderr)
            
            # Mark rejected skills as non-skills
            for skill in rejected:
                if skill:
                    self.nlp.non_skill_patterns[skill] += 1
                    print(f"[LEARN] Marked as non-skill: {skill}", file=sys.stderr)
            
            # Increment documents_analyzed
            self.nlp.stats['documents_analyzed'] = self.nlp.stats.get('documents_analyzed', 0) + 1
            
            # ============ 🔥 ADD AUTO-MERGE HERE ============
            # Run synonym detection after learning new skills
            if len(self.nlp.learned_skills) > 5:
                print(f"[LEARN] Auto-merging duplicates...", file=sys.stderr)
                merged = self.nlp.merge_synonyms_dynamically()
                if merged > 0:
                    print(f"[LEARN] ✅ Auto-merged {merged} duplicate skills!", file=sys.stderr)
            # ============================================
            
            # Save the updated data
            self.nlp._save_data()
            
            return {"success": True, "skills_learned": skills_learned}
        except Exception as e:
            print(f"[LEARN] Error: {str(e)}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
            return {"success": False, "error": str(e)}
    
    # ============ FIXED: cleanup_learned_skills method ============
    def cleanup_learned_skills(self):
        """Clean duplicate skills from learned_skills.json"""
        try:
            # Lazy load NLP processor
            if self.nlp is None:
                self.nlp = NLPProcessor()
            
            # Run synonym detection and merging
            merged = self.nlp.merge_synonyms_dynamically()
            
            return {
                "success": True,
                "merged": merged,
                "message": f"Merged {merged} duplicate skills"
            }
        except Exception as e:
            print(f"[CLEANUP] Error: {str(e)}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
            return {"success": False, "error": str(e)}
    # ============================================================

def main():
    if len(sys.argv) < 2:
        sys.stdout.write(json.dumps({"error": "No command"}))
        sys.stdout.flush()
        return
    
    runner = Runner()
    cmd = sys.argv[1]
    
    if cmd == "process_document" and len(sys.argv) >= 5:
        result = runner.process_document(sys.argv[2], sys.argv[3], sys.argv[4])
        sys.stdout.write(json.dumps(result))
        sys.stdout.flush()
    
    elif cmd == "learn_feedback" and len(sys.argv) >= 4:
        approved_skills = sys.argv[2]
        rejected_skills = sys.argv[3]
        result = runner.learn_feedback(approved_skills, rejected_skills)
        sys.stdout.write(json.dumps(result))
        sys.stdout.flush()
    
    # ============ ADD THIS COMMAND ============
    elif cmd == "cleanup_learned_skills":
        result = runner.cleanup_learned_skills()
        sys.stdout.write(json.dumps(result))
        sys.stdout.flush()
    # ============================================
    
    else:
        sys.stdout.write(json.dumps({"error": f"Unknown command: {cmd}"}))
        sys.stdout.flush()

if __name__ == "__main__":
    main()