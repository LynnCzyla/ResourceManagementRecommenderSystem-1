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

# ============ MEMORY: deferred heavy imports ============
# module1_ocr pulls in opencv/pdf2image/pytesseract; module2_nlp pulls in
# spacy/sklearn. Both used to be imported here unconditionally, meaning
# EVERY invocation of this file (regardless of which cmd) loaded both
# library sets into the same process - on Render's 512MB free tier, OCR's
# image buffers + a freshly spawned spaCy model together were enough to
# OOM-kill the container mid-request (confirmed via Render's Events tab:
# "Ran out of memory (used over 512MB)").
#
# For the `process_document` command specifically, these imports now happen
# INSIDE _run_ocr_stage() / _run_nlp_stage() below, each in its OWN
# subprocess (this same file, re-invoked with a different internal cmd - see
# _process_document_via_stages). That way the OS fully reclaims stage 1's
# (OCR) memory - including the C-extension memory Python's own gc.collect()
# can't reach - before stage 2 (NLP) ever starts. Do not move these back to
# module-level; that reintroduces both import sets into every invocation.
#
# All OTHER commands (learn_feedback, retrain_ml, cleanup_learned_skills,
# ml_status, retrain_if_needed) are unchanged and still import normally via
# Runner.__init__ below - they don't do OCR at all, so the split doesn't
# apply to them.
# ==========================================================

class Runner:
    def __init__(self):
        from modules.module1_ocr import OCRProcessor
        from modules.module3_integration import DocumentProcessor

        #============ FIX: DEFER NLP — let DocumentProcessor build it lazily,
        # AFTER OCR runs, instead of eagerly here before OCR even starts ============
        self.nlp = None
        print("[RUNNER] Initializing OCR Processor...", file=sys.stderr)
        self.ocr = OCRProcessor()
        print("[RUNNER] Initializing Document Processor...", file=sys.stderr)
        self.processor = DocumentProcessor(nlp=None)
        print("[RUNNER] Document Processor initialized.", file=sys.stderr)
        
    
    def process_document(self, image_path, employee_id, doc_type):
        """NOTE: this single-process path is kept for any caller other than
        the Node-facing `process_document` CLI command (which now goes
        through _process_document_via_stages() in main() instead, to avoid
        the OOM described above). Still used by, e.g., the warm daemon."""
        try:
            start = time.time()
            
            result = self.processor.process_document_complete(image_path, employee_id, doc_type)
            self.nlp = self.processor.nlp  
            
            if result and result.get('success') and result.get('ocr'):
                result['ocr']['processing_time'] = time.time() - start
                _attach_ml_predictions(result, self.nlp)
            
            return result
            
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            print(f"[RUNNER] Error: {e}", file=sys.stderr)
            print(error_trace, file=sys.stderr)
            return {'success': False, 'error': str(e), 'traceback': error_trace}
    
    def learn_feedback(self, approved_skills, rejected_skills, context=None):
        """Update learning from user feedback — delegates to NLPProcessor's
        own learn_from_feedback(), which is the method that actually populates
        rejected_phrases / rejected_fragments / learned_skill_keywords and
        retrains the ML classifier. Do not reimplement that logic here."""
        try:
            if self.nlp is None:
                from modules.module2_nlp import NLPProcessor  # deferred - see note above
                self.nlp = NLPProcessor()
            
            approved = json.loads(approved_skills) if isinstance(approved_skills, str) else (approved_skills or [])
            rejected = json.loads(rejected_skills) if isinstance(rejected_skills, str) else (rejected_skills or [])
            
            doc_id = None
            emp_id = None
            rev_by = None
            if context:
                ctx = json.loads(context) if isinstance(context, str) else context
                doc_id = ctx.get('document_id')
                emp_id = ctx.get('employee_id')
                rev_by = ctx.get('reviewed_by')

            print(f"[LEARN] Processing {len(approved)} approved, {len(rejected)} rejected (reviewer={rev_by})", file=sys.stderr)
            
            skills_learned = self.nlp.learn_from_feedback(
                approved, rejected,
                document_id=doc_id, employee_id=emp_id, reviewed_by=rev_by
            )
            
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
                from modules.module2_nlp import NLPProcessor  # deferred - see note above
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
                from modules.module2_nlp import NLPProcessor  # deferred - see note above
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
                from modules.module2_nlp import NLPProcessor  # deferred - see note above
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
                from modules.module2_nlp import NLPProcessor  # deferred - see note above
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


def _attach_ml_predictions(result, nlp):
    """Adds ml_predictions/ml_active/total_skills etc. to an already-built
    result dict, given a live NLPProcessor. Split out of Runner.process_document
    so _run_nlp_stage() (a different process, with its own `nlp`) can reuse it
    without duplicating the logic."""
    if 'nlp' not in result:
        result['nlp'] = {}

    result['nlp']['ml_active'] = nlp.use_ml
    result['nlp']['ml_trained'] = nlp.classifier.is_trained

    skills = result.get('nlp', {}).get('skills', [])
    categorized = result.get('nlp', {}).get('categorized', {})
    auto_approved = result.get('nlp', {}).get('auto_approved', [])
    needs_review = result.get('nlp', {}).get('needs_review', [])

    if skills:
        ml_predictions = []
        for skill in skills:
            try:
                if nlp.use_ml:
                    pred = nlp.classifier.predict(skill)
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

        result['nlp']['ml_predictions'] = ml_predictions
        result['nlp']['total_skills'] = len(skills)
        result['nlp']['ml_active'] = nlp.use_ml
        result['nlp']['auto_approved'] = auto_approved
        result['nlp']['needs_review'] = needs_review
        result['nlp']['categorized_skills'] = categorized

        print(f"[RUNNER] ✅ Auto-approved: {len(auto_approved)}", file=sys.stderr)
        print(f"[RUNNER] ⏳ Needs review: {len(needs_review)}", file=sys.stderr)
        if auto_approved:
            print(f"[RUNNER]   Samples: {auto_approved[:3]}", file=sys.stderr)
        if needs_review:
            print(f"[RUNNER]   Samples: {needs_review[:3]}", file=sys.stderr)


# ============ MEMORY-SPLIT STAGES (process_document only) ============
# Each of these is invoked as its OWN subprocess (this same file, re-run
# with a different internal cmd) by _process_document_via_stages(). They
# are not part of the Node-facing CLI contract - pythonService.js never
# passes "_ocr_stage" or "_nlp_stage" directly.

def _run_ocr_stage(image_path, doc_id, employee_id, doc_type, output_path):
    """Runs OCR ONLY, in its own process. Writes the (JSON-serializable)
    ocr_result to output_path and exits - so when this process exits, the OS
    reclaims all of opencv/pdf2image/pytesseract's memory, including the
    C-extension memory Python's own gc.collect() can never fully release."""
    from modules.module3_integration import DocumentProcessor

    print(f"[STAGE:OCR] Starting OCR-only stage for {doc_id} (pid={os.getpid()})", file=sys.stderr)
    processor = DocumentProcessor()  # .nlp never touched -> spaCy/sklearn never imported here
    log_entry = {'document_id': doc_id, 'employee_id': employee_id,
                 'document_type': doc_type, 'start_time': datetime_now_iso()}
    ocr_result = processor._do_ocr_stage(image_path, doc_id, employee_id, doc_type, log_entry)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(ocr_result, f)
    print(f"[STAGE:OCR] Done, wrote ocr_result to {output_path}", file=sys.stderr)


def _run_nlp_stage(ocr_json_path, doc_id, employee_id, doc_type):
    """Runs NLP ONLY, in its own fresh process (spaCy/sklearn are the only
    heavy imports here - OCR's libraries are never imported in this
    process at all). Reads the OCR-stage's output, builds the final result
    dict (identical shape to the old single-process version), and writes it
    to this process's OWN real stdout for the orchestrator to capture."""
    from modules.module2_nlp import NLPProcessor
    from modules.module3_integration import DocumentProcessor

    print(f"[STAGE:NLP] Starting NLP-only stage for {doc_id} (pid={os.getpid()})", file=sys.stderr)
    with open(ocr_json_path, 'r', encoding='utf-8') as f:
        ocr_result = json.load(f)

    nlp = NLPProcessor()
    processor = DocumentProcessor(nlp=nlp)  # .ocr never touched -> opencv/pdf2image never imported here
    log_entry = {'document_id': doc_id, 'employee_id': employee_id,
                 'document_type': doc_type, 'start_time': datetime_now_iso()}

    try:
        result = processor._do_nlp_stage(ocr_result, doc_id, employee_id, doc_type, log_entry)
        log_entry['status'] = 'success'
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[STAGE:NLP] Error: {e}", file=sys.stderr)
        print(error_trace, file=sys.stderr)
        log_entry['status'] = 'failed'
        log_entry['error'] = str(e)
        result = {'success': False, 'document_id': doc_id, 'employee_id': employee_id,
                  'error': str(e), 'log_entry': log_entry}

    log_entry['end_time'] = datetime_now_iso()
    processor.process_log.append(log_entry)
    processor._save_log(log_entry)

    if result and result.get('success') and result.get('ocr'):
        _attach_ml_predictions(result, nlp)

    _REAL_STDOUT.write(json.dumps(result))
    _REAL_STDOUT.flush()


def datetime_now_iso():
    from datetime import datetime
    return datetime.now().isoformat()


def _process_document_via_stages(image_path, employee_id, doc_type):
    """Orchestrator for the Node-facing `process_document` command. Imports
    NOTHING heavy itself (no OCR, no NLP) - it just spawns the two stages
    above as separate OS processes, one after the other, and relays the
    final result. This is what actually fixes the OOM: at no point does a
    single process hold both OCR's and NLP's memory at once."""
    import subprocess
    import tempfile
    from datetime import datetime

    doc_id = f"DOC-{datetime.now().strftime('%Y%m%d')}-{employee_id}"

    tmp_dir = Path(__file__).parent.parent.parent / 'shared-data' / 'tmp'
    tmp_dir.mkdir(parents=True, exist_ok=True)
    ocr_json_path = tmp_dir / f"{doc_id}_ocr.json"

    start = time.time()
    try:
        print(f"[ORCHESTRATOR] Spawning OCR-stage subprocess for {doc_id}", file=sys.stderr)
        ocr_proc = subprocess.run(
            [sys.executable, '-u', str(Path(__file__)), '_ocr_stage',
             image_path, doc_id, employee_id, doc_type, str(ocr_json_path)],
            timeout=900  # OCR alone has taken ~6.5 min on large scanned CVs
        )
        if ocr_proc.returncode != 0 or not ocr_json_path.exists():
            return {'success': False, 'error': f'OCR stage failed (exit code {ocr_proc.returncode})'}

        print(f"[ORCHESTRATOR] OCR stage done, spawning NLP-stage subprocess", file=sys.stderr)
        nlp_proc = subprocess.run(
            [sys.executable, '-u', str(Path(__file__)), '_nlp_stage',
             str(ocr_json_path), doc_id, employee_id, doc_type],
            stdout=subprocess.PIPE, text=True, timeout=300
            # stderr NOT captured - it passes through live so NLP-stage logs
            # (alias loading, [NLP-INIT-DIAG], etc.) still stream to Render.
        )
        if nlp_proc.returncode != 0 or not nlp_proc.stdout.strip():
            return {'success': False, 'error': f'NLP stage failed (exit code {nlp_proc.returncode})'}

        result = json.loads(nlp_proc.stdout.strip())
        if result and result.get('success') and result.get('ocr'):
            result['ocr']['processing_time'] = time.time() - start
        return result

    except subprocess.TimeoutExpired as e:
        print(f"[ORCHESTRATOR] Stage timed out: {e}", file=sys.stderr)
        return {'success': False, 'error': f'Processing stage timed out: {e}'}
    except Exception as e:
        import traceback
        print(f"[ORCHESTRATOR] Error: {e}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        return {'success': False, 'error': str(e)}
    finally:
        try:
            if ocr_json_path.exists():
                ocr_json_path.unlink()
        except Exception:
            pass
# ========================================================================


def main():
    if len(sys.argv) < 2:
        _REAL_STDOUT.write(json.dumps({"error": "No command"}))
        _REAL_STDOUT.flush()
        return

    cmd = sys.argv[1]

    # Internal-only stages, self-spawned by _process_document_via_stages().
    # Not part of the Node-facing contract - handled BEFORE Runner() is
    # constructed so these subprocesses only ever import the ONE heavy
    # module set they actually need (see the MEMORY comment above).
    if cmd == "_ocr_stage" and len(sys.argv) >= 7:
        _run_ocr_stage(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6])
        return

    if cmd == "_nlp_stage" and len(sys.argv) >= 6:
        _run_nlp_stage(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5])
        return

    if cmd == "process_document" and len(sys.argv) >= 5:
        # Orchestrator path: does NOT construct Runner() (which would eagerly
        # import/construct OCRProcessor) - see _process_document_via_stages.
        result = _process_document_via_stages(sys.argv[2], sys.argv[3], sys.argv[4])
        _REAL_STDOUT.write(json.dumps(result))
        _REAL_STDOUT.flush()
        return

    # Everything below still goes through the original eager Runner() -
    # none of these commands do OCR, so the split doesn't apply to them.
    runner = Runner()

    if cmd == "learn_feedback" and len(sys.argv) >= 4:
        approved_skills = sys.argv[2]
        rejected_skills = sys.argv[3]
        context = sys.argv[4] if len(sys.argv) >= 5 else None
        result = runner.learn_feedback(approved_skills, rejected_skills, context)
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