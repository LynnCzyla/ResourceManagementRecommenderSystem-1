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
            if self.nlp is None:
                self.nlp = NLPProcessor()
            
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
            
            # ============ 🔥 FIX: ACCUMULATE FEEDBACK ============
            # Log approved skills (APPEND to existing, don't replace!)
            if 'approved' not in self.nlp.feedback_log:
                self.nlp.feedback_log['approved'] = []
            
            for skill in approved:
                if skill and skill not in self.nlp.feedback_log['approved']:
                    self.nlp.feedback_log['approved'].append(skill)
                    print(f"[FEEDBACK] Added approved: {skill}", file=sys.stderr)
            
            # Log rejected skills (APPEND to existing, don't replace!)
            if 'rejected' not in self.nlp.feedback_log:
                self.nlp.feedback_log['rejected'] = []
            
            for skill in rejected:
                if skill and skill not in self.nlp.feedback_log['rejected']:
                    self.nlp.feedback_log['rejected'].append(skill)
                    print(f"[FEEDBACK] Added rejected: {skill}", file=sys.stderr)
            
            print(f"[LEARN] Feedback log totals: {len(self.nlp.feedback_log.get('approved', []))} approved, {len(self.nlp.feedback_log.get('rejected', []))} rejected", file=sys.stderr)
            # ===================================================
            
            # Increment documents_analyzed
            self.nlp.stats['documents_analyzed'] = self.nlp.stats.get('documents_analyzed', 0) + 1
            
            # Auto-merge duplicates
            merged = 0
            if len(self.nlp.learned_skills) > 5:
                print(f"[LEARN] Auto-merging duplicates...", file=sys.stderr)
                merged = self.nlp.merge_synonyms_dynamically()
                if merged > 0:
                    print(f"[LEARN] ✅ Auto-merged {merged} duplicate skills!", file=sys.stderr)
            
            # Save the updated data
            self.nlp._save_data()
            
            return {"success": True, "skills_learned": skills_learned, "merged": merged}
            
        except Exception as e:
            print(f"[LEARN] Error: {str(e)}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
            return {"success": False, "error": str(e)}
    
    # ============ RETRAIN ML ============
    def retrain_ml(self, texts, labels):
        """Retrain ML from feedback data"""
        try:
            # Lazy load NLP processor
            if self.nlp is None:
                self.nlp = NLPProcessor()
            
            print(f"[ML] Retraining with {len(texts)} samples...", file=sys.stderr)
            
            # Check if we have enough data
            if len(texts) < 10:
                return {"success": False, "error": "Need 10+ samples"}
            
            # Train
            self.nlp.classifier.train(texts, labels)
            self.nlp.use_ml = self.nlp.classifier.is_trained
            
            if self.nlp.use_ml:
                print(f"[ML] ✅ Retrained successfully!", file=sys.stderr)
                # Save the updated data
                self.nlp._save_data()
                return {"success": True, "samples": len(texts)}
            else:
                return {"success": False, "error": "Training failed"}
                
        except Exception as e:
            print(f"[ML] Error: {str(e)}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
            return {"success": False, "error": str(e)}
    
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
    
    elif cmd == "retrain_ml" and len(sys.argv) >= 4:
        texts = json.loads(sys.argv[2])
        labels = json.loads(sys.argv[3])
        result = runner.retrain_ml(texts, labels)
        sys.stdout.write(json.dumps(result))
        sys.stdout.flush()
    
    elif cmd == "cleanup_learned_skills":
        result = runner.cleanup_learned_skills()
        sys.stdout.write(json.dumps(result))
        sys.stdout.flush()
    
    else:
        sys.stdout.write(json.dumps({"error": f"Unknown command: {cmd}"}))
        sys.stdout.flush()

if __name__ == "__main__":
    main()