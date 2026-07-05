import sys
import json
import io
import time
from pathlib import Path


# ============ FIX: Force UTF-8 encoding for stdout/stderr ============
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
# ================================================================

# Force unbuffered output
sys.stdout = sys.stdout.detach()
sys.stdout = open(sys.stdout.fileno(), 'w', buffering=1)

# Silence prints (they go to stderr)
#import builtins
#builtins.print = lambda *a, **k: None

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
        # ============ FIX: Create shared NLP instance ============
        print("[RUNNER] Initializing NLP Processor...", file=sys.stderr)
        self.nlp = NLPProcessor()
        print(f"[RUNNER] NLP initialized. ML Active: {self.nlp.use_ml}", file=sys.stderr)
        
        print("[RUNNER] Initializing OCR Processor...", file=sys.stderr)
        self.ocr = OCRProcessor()
        
        print("[RUNNER] Initializing Document Processor...", file=sys.stderr)
        self.processor = DocumentProcessor()
        # Override the processor's NLP with our ML-enabled one
        self.processor.nlp = self.nlp
        print("[RUNNER] Document Processor initialized.", file=sys.stderr)
    
    def process_document(self, image_path, employee_id, doc_type):
        try:
            start = time.time()
            
            result = self.processor.process_document_complete(image_path, employee_id, doc_type)
            
            if result and result.get('success') and result.get('ocr'):
                result['ocr']['processing_time'] = time.time() - start
                
                # ============ ADD ML STATUS ============
                if 'nlp' not in result:
                    result['nlp'] = {}
                
                result['nlp']['ml_active'] = self.nlp.use_ml
                result['nlp']['ml_trained'] = self.nlp.classifier.is_trained
                
                # ============ GET SKILLS FROM RESULT ============
                # The result from processor should have nlp.skills
                skills = result.get('nlp', {}).get('skills', [])
                categorized = result.get('nlp', {}).get('categorized', {})
                
                # ============ GET AUTO_APPROVED AND NEEDS_REVIEW ============
                # These should come from the NLP processor's extract_skills_with_categories
                auto_approved = result.get('nlp', {}).get('auto_approved', [])
                needs_review = result.get('nlp', {}).get('needs_review', [])
            
                
                # ============ ADD PREDICTIONS ============
                if skills:
                    ml_predictions = []
                    for skill in skills:
                        try:
                            if self.nlp.use_ml:
                                pred = self.nlp.classifier.predict(skill)
                                ml_predictions.append({
                                    'skill': skill,
                                    'prediction': pred.get('label', 'Unknown') if isinstance(pred, dict) else 'Unknown',
                                    'confidence': pred.get('confidence', 0) if isinstance(pred, dict) else 0
                                })
                            else:
                                ml_predictions.append({
                                    'skill': skill,
                                    'prediction': 'Rule-based',
                                    'confidence': 0.5
                                })
                        except Exception as e:
                            print(f"[RUNNER] Prediction error for '{skill}': {e}", file=sys.stderr)
                            ml_predictions.append({
                                'skill': skill,
                                'prediction': 'Error',
                                'confidence': 0
                            })
                    
                    # ============ SET ALL FIELDS ============
                    result['nlp']['ml_predictions'] = ml_predictions
                    result['nlp']['total_skills'] = len(skills)
                    result['nlp']['ml_active'] = self.nlp.use_ml
                    result['nlp']['auto_approved'] = auto_approved      # ← KEY FIELD
                    result['nlp']['needs_review'] = needs_review        # ← KEY FIELD
                    result['nlp']['categorized_skills'] = categorized
                    
                    print(f"[RUNNER] ✅ Auto-approved: {len(auto_approved)}", file=sys.stderr)
                    print(f"[RUNNER] ⏳ Needs review: {len(needs_review)}", file=sys.stderr)
                    
                    if auto_approved:
                        print(f"[RUNNER]   Samples: {auto_approved[:3]}", file=sys.stderr)
                    if needs_review:
                        print(f"[RUNNER]   Samples: {needs_review[:3]}", file=sys.stderr)
            
            return result
            
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            print(f"[RUNNER] Error: {e}", file=sys.stderr)
            print(error_trace, file=sys.stderr)
            return {'success': False, 'error': str(e), 'traceback': error_trace}
    
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

            # ============ FIX: delegate to the real implementation ============
            # Previously this method had its own hand-rolled logic that only
            # touched non_skill_patterns/feedback_log, and never touched
            # rejected_phrases/rejected_single_words/etc. That's why rejections
            # never actually "stuck" - the counting logic in
            # NLPProcessor.learn_from_feedback() was correct but never called.
            self.nlp.learn_from_feedback(approved, rejected)
            # ====================================================================

            # Auto-merge duplicates (learn_from_feedback already does this
            # internally too, but keep this for the return value / logging)
            merged = 0
            if len(self.nlp.learned_skills) > 5:
                print(f"[LEARN] Auto-merging duplicates...", file=sys.stderr)
                merged = self.nlp.merge_synonyms_dynamically()
                if merged > 0:
                    print(f"[LEARN] Auto-merged {merged} duplicate skills!", file=sys.stderr)

            return {"success": True, "skills_learned": len(approved), "merged": merged}
            
        except Exception as e:
            print(f"[LEARN] Error: {str(e)}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
            return {"success": False, "error": str(e)}
    
    # ============ RETRAIN ML ============
    def retrain_ml(self, texts, labels):
        """Retrain ML from feedback data"""
        try:
            if self.nlp is None:
                self.nlp = NLPProcessor()
            
            print(f"[ML] Retraining with {len(texts)} samples...", file=sys.stderr)
            
            if len(texts) < 10:
                return {"success": False, "error": "Need 10+ samples"}
            
            self.nlp.classifier.train(texts, labels)
            self.nlp.use_ml = self.nlp.classifier.is_trained
            
            if self.nlp.use_ml:
                print(f"[ML] Retrained successfully!", file=sys.stderr)
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
            if self.nlp is None:
                self.nlp = NLPProcessor()
            
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
    
    def get_ml_status(self):
        """Get ML status"""
        try:
            if self.nlp is None:
                self.nlp = NLPProcessor()
            
            return {
                "success": True,
                "ml_active": self.nlp.use_ml,
                "ml_trained": self.nlp.classifier.is_trained,
                "total_skills": len(self.nlp.learned_skills),
                "total_categories": len(self.nlp.skill_categories),
                "alias_groups": len(self.nlp.skill_aliases),
                "feedback_approved": len(self.nlp.feedback_log.get('approved', [])),
                "feedback_rejected": len(self.nlp.feedback_log.get('rejected', []))
            }
        except Exception as e:
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
    
    elif cmd == "ml_status":
        result = runner.get_ml_status()
        sys.stdout.write(json.dumps(result))
        sys.stdout.flush()
    
    else:
        sys.stdout.write(json.dumps({"error": f"Unknown command: {cmd}"}))
        sys.stdout.flush()


if __name__ == "__main__":
    main()