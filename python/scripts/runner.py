#D:\ResourceManagementRecommenderSystem\python\scripts\runner.py

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

# ============ STDOUT/STDERR CONTRACT ============
# pythonService.js spawns this process and does JSON.parse() on stdout, so
# stdout must contain ONLY the final JSON payload. NLPProcessor (and the
# modules it imports/constructs: skill_classifier, supabase_client) call
# print() with no file=, which defaults to stdout, silently corrupting the
# JSON channel. Save the real, correctly-configured stdout handle above for
# the final JSON writes, then point sys.stdout at stderr so every print()
# from here on - including everything inside NLPProcessor.__init__(),
# OCRProcessor, DocumentProcessor, and any module-level import prints - is
# diagnostic-only and lands on stderr instead. No log is deleted; only the
# destination stream changes.
_REAL_STDOUT = sys.stdout
sys.stdout = sys.stderr
# ==================================================

sys.path.append(str(Path(__file__).parent.parent))

try:
    from modules.module1_ocr import OCRProcessor
    from modules.module2_nlp import NLPProcessor
    from modules.module3_integration import DocumentProcessor
except ImportError as e:
    _REAL_STDOUT.write(json.dumps({"success": False, "error": f"Import error: {str(e)}"}))
    _REAL_STDOUT.flush()
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
        # ============ FIX (duplicate-init bug) ============
        # DocumentProcessor used to always build its own NLPProcessor
        # internally (full Supabase fetch + ML classifier load), which was
        # then immediately discarded by the old `self.processor.nlp = self.nlp`
        # override below. Pass the already-built instance in directly so it's
        # only ever constructed once per process.
        self.processor = DocumentProcessor(nlp=self.nlp)
        # The line below is now a harmless no-op (processor.nlp already IS
        # self.nlp) - left in place as a defensive no-op rather than removed,
        # to keep this change minimal and behavior-neutral either way.
        self.processor.nlp = self.nlp
        # ====================================================
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
        """Update learning from user feedback — delegates to NLPProcessor's
        own learn_from_feedback(), which is the method that actually populates
        rejected_phrases / rejected_fragments / learned_skill_keywords and
        retrains the ML classifier. Do not reimplement that logic here."""
        try:
            if self.nlp is None:
                self.nlp = NLPProcessor()
            
            approved = json.loads(approved_skills) if isinstance(approved_skills, str) else (approved_skills or [])
            rejected = json.loads(rejected_skills) if isinstance(rejected_skills, str) else (rejected_skills or [])
            
            print(f"[LEARN] Processing {len(approved)} approved, {len(rejected)} rejected", file=sys.stderr)
            
            skills_learned = self.nlp.learn_from_feedback(approved, rejected)
            
            return {"success": True, "skills_learned": skills_learned}
            
        except Exception as e:
            print(f"[LEARN] Error: {str(e)}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
            return {"success": False, "error": str(e)}
    
    # ============ RETRAIN ML (manual trigger, e.g. an admin "Retrain ML" button) ============
    def retrain_ml(self, texts, labels):
        """Manually force a retrain, ignoring the 20-new-row threshold.

        `texts`/`labels` are accepted for backward compatibility with the
        existing CLI signature (feedbackController.retrainML still passes
        them) but are NOT used for training data anymore: this now always
        re-fetches ONLY human-reviewed rows (reviewed_by IS NOT NULL AND
        reviewed_at IS NOT NULL) straight from Supabase via
        SkillClassifier.train_and_replace_if_needed(threshold=0), the same
        safe candidate-train/evaluate/replace path the automatic
        ≥20-new-row retrain uses. This also fixes a prior bug where a
        successful manual retrain trained a new model in memory but never
        called _save_model(), so it was silently lost when this process
        exited."""
        try:
            if self.nlp is None:
                self.nlp = NLPProcessor()

            print(f"[ML] Manual retrain requested ({len(texts) if texts else 0} legacy args ignored - "
                  f"using human-reviewed feedback_training rows only)", file=sys.stderr)

            result = self.nlp.classifier.train_and_replace_if_needed(threshold=0)
            self.nlp.use_ml = self.nlp.classifier.is_trained

            if result.get('retrained'):
                print(f"[ML] Retrained successfully! "
                      f"({result.get('total_reviewed_count', 0)} human-reviewed rows)", file=sys.stderr)
                return {"success": True, "samples": result.get('total_reviewed_count', 0), **result}
            else:
                return {"success": False, "error": result.get('reason', 'Training failed'), **result}

        except Exception as e:
            print(f"[ML] Error: {str(e)}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
            return {"success": False, "error": str(e)}

    # ============ GATED AUTOMATIC RETRAIN ============
    def retrain_if_needed(self, threshold=20):
        """Called after feedback is saved. Retrains ONLY when >= `threshold`
        NEW human-reviewed rows have accumulated since the last successful
        training. Safe no-op most of the time. See
        SkillClassifier.train_and_replace_if_needed for the candidate-train/
        evaluate/replace + concurrency-lock logic."""
        try:
            if self.nlp is None:
                self.nlp = NLPProcessor()

            result = self.nlp.classifier.train_and_replace_if_needed(threshold=threshold)
            self.nlp.use_ml = self.nlp.classifier.is_trained
            return {"success": True, **result}

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
            
            merged = self.nlp.merge_synonyms_dynamically(caller='cleanup_learned_skills')
            
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
        _REAL_STDOUT.write(json.dumps({"error": "No command"}))
        _REAL_STDOUT.flush()
        return
    
    runner = Runner()
    cmd = sys.argv[1]
    
    if cmd == "process_document" and len(sys.argv) >= 5:
        result = runner.process_document(sys.argv[2], sys.argv[3], sys.argv[4])
        _REAL_STDOUT.write(json.dumps(result))
        _REAL_STDOUT.flush()
    
    elif cmd == "learn_feedback" and len(sys.argv) >= 4:
        approved_skills = sys.argv[2]
        rejected_skills = sys.argv[3]
        result = runner.learn_feedback(approved_skills, rejected_skills)
        _REAL_STDOUT.write(json.dumps(result))
        _REAL_STDOUT.flush()
    
    elif cmd == "retrain_ml" and len(sys.argv) >= 4:
        texts = json.loads(sys.argv[2])
        labels = json.loads(sys.argv[3])
        result = runner.retrain_ml(texts, labels)
        _REAL_STDOUT.write(json.dumps(result))
        _REAL_STDOUT.flush()
    
    elif cmd == "retrain_if_needed":
        threshold = int(sys.argv[2]) if len(sys.argv) >= 3 else 20
        result = runner.retrain_if_needed(threshold)
        _REAL_STDOUT.write(json.dumps(result))
        _REAL_STDOUT.flush()
    
    elif cmd == "cleanup_learned_skills":
        result = runner.cleanup_learned_skills()
        _REAL_STDOUT.write(json.dumps(result))
        _REAL_STDOUT.flush()
    
    elif cmd == "ml_status":
        result = runner.get_ml_status()
        _REAL_STDOUT.write(json.dumps(result))
        _REAL_STDOUT.flush()
    
    else:
        _REAL_STDOUT.write(json.dumps({"error": f"Unknown command: {cmd}"}))
        _REAL_STDOUT.flush()


if __name__ == "__main__":
    main()