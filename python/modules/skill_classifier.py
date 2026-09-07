"""
Module 2.5: Skill Classifier (Machine Learning)
Trains ONLY on human-verified data from Supabase feedback_training table
Uses the same Supabase client as your Node.js backend
"""
import pickle
import numpy as np
import sklearn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    classification_report,
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
)
from pathlib import Path
import json
import re
import os
import sys
import time
from datetime import datetime

# Make sure the project root (the 'python' folder that CONTAINS the
# 'modules' package) is on sys.path. When this file is run directly, e.g.
#   python modules\skill_classifier.py
# Python puts only the 'modules' folder itself on sys.path[0], not its
# parent - so "from modules.supabase_client import supabase" below cannot
# resolve the 'modules' package and silently falls back, regardless of
# whether the .env file/variables are correct. Inserting the parent
# directory here fixes that resolution no matter how this script is
# launched (directly, via -m, or imported from elsewhere).
_PROJECT_ROOT = str(Path(__file__).resolve().parent.parent)
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

# Import your Supabase client (same as backend)
try:
    from modules.supabase_client import supabase
    HAS_SUPABASE = True
except ImportError:
    HAS_SUPABASE = False
    print("[ML]  Supabase client not found. Using fallback.")


class SkillClassifier:
    """
    Machine Learning classifier trained ONLY on human-verified feedback.
    Ground truth data comes exclusively from Supabase feedback_training table.
    """
    
    def __init__(self, model_path=None, auto_train=True):
        self.model_path = model_path or self._get_default_model_path()
        
        self.vectorizer = TfidfVectorizer(
            max_features=5000,
            ngram_range=(1, 3),
            stop_words='english',
            min_df=1,
            max_df=0.95
        )
        self.model = LogisticRegression(
            C=1.0,
            max_iter=1000,
            random_state=42,
            class_weight='balanced'
        )
        self.is_trained = False
        self.training_stats = {
            'total_samples': 0,
            'train_samples': 0,
            'test_samples': 0,
            'skill_samples': 0,
            'not_skill_samples': 0,
            'accuracy': None,
            'precision': None,
            'recall': None,
            'f1_score': None,
            'trained_at': None,
            'sklearn_version': None,
            'source': None,
            # How many human-reviewed feedback_training rows were included
            # the last time this model was successfully trained. Used to
            # compute "new reviewed rows since last training" for gated
            # retraining. Absent on older .pkl files - always read with
            # .get('trained_on_reviewed_count', 0) rather than assumed present.
            'trained_on_reviewed_count': 0,
        }
        
        # Try to load existing model
        if not self._load_model():
            print("[ML] No trained model found.")
            # Auto-train if data available in Supabase. `auto_train=False`
            # is used when constructing a throwaway CANDIDATE model for
            # gated retraining (train_and_replace_if_needed), so it doesn't
            # redundantly self-train here before being trained again there.
            if auto_train and self._has_training_data():
                print("[ML] Found training data in Supabase. Auto-training...")
                self.train_from_supabase()
    
    def _get_default_model_path(self):
        """Get default path for model storage"""
        base_dir = Path(__file__).parent.parent.parent
        model_dir = base_dir / 'shared-data' / 'models'
        model_dir.mkdir(parents=True, exist_ok=True)
        return model_dir / 'skill_classifier.pkl'
    
    def _load_model(self):
        """
        Load trained model from disk.

        A load only counts as successful if the restored vectorizer/model
        are GENUINELY usable for prediction - not merely present. Unpickling
        an estimator across incompatible scikit-learn versions (e.g. saved
        with 1.5.2, loaded with 1.2.2) can silently restore a
        TfidfVectorizer/TfidfTransformer missing its fitted internals
        (vocabulary_/idf_) without pickle.load() itself raising anything -
        the failure only surfaces the first time .transform() is actually
        called ("idf vector is not fitted"), which is too late: by then
        the system already believes ML is active. Doing one real
        transform()+predict() smoke test here, before accepting the loaded
        objects as the active model, surfaces that immediately instead.
        """
        if not Path(self.model_path).exists():
            return False
        try:
            with open(self.model_path, 'rb') as f:
                data = pickle.load(f)
            candidate_model = data['model']
            candidate_vectorizer = data['vectorizer']
            loaded_stats = data.get('training_stats', {}) or {}

            try:
                X = candidate_vectorizer.transform(["smoke test phrase for load validation"])
                candidate_model.predict(X)
            except Exception as smoke_error:
                pickled_version = loaded_stats.get('sklearn_version', 'unknown')
                print(f"[ML] Loaded model file exists but is NOT usable for prediction "
                      f"({smoke_error}) - treating as untrained rather than silently "
                      f"claiming ML is active. This usually means the .pkl was saved "
                      f"with a different scikit-learn version than is currently "
                      f"installed (pickled with {pickled_version}, running {sklearn.__version__}).")
                return False

            # Only now, after confirming the loaded objects actually work,
            # adopt them as the active model.
            self.model = candidate_model
            self.vectorizer = candidate_vectorizer
            self.is_trained = True
            # Older .pkl files won't have 'trained_on_reviewed_count' -
            # default it to 0 rather than assuming it exists, so the
            # gated retrain treats all currently-reviewed rows as new.
            loaded_stats.setdefault('trained_on_reviewed_count', 0)
            self.training_stats = loaded_stats
            print(f"[ML]  Loaded trained model from {self.model_path}")
            print(f"[ML]    Trained on {self.training_stats.get('total_samples', 0)} human-verified samples")
            pickled_version = self.training_stats.get('sklearn_version')
            if pickled_version and pickled_version != sklearn.__version__:
                print(f"[ML]  Note: model was trained with scikit-learn {pickled_version}, "
                      f"currently running {sklearn.__version__}. Prediction succeeded, "
                      f"but consider retraining or aligning versions if issues appear.")
            return True
        except Exception as e:
            print(f"[ML] Error loading model: {e}")
        
        return False
    
    def _save_model(self):
        """
        Save trained model to disk ATOMICALLY: write to a temp file in the
        same directory as the active .pkl, flush+fsync it fully to disk,
        then os.replace() it into place. os.replace() is atomic on POSIX
        and Windows (same filesystem), so a reader/loader of self.model_path
        never observes a partially-written file, and if anything fails
        before the replace, the existing active .pkl is left completely
        untouched (this is what protects it if a candidate model trains
        successfully but the save itself fails partway).
        """
        model_path = Path(self.model_path)
        tmp_path = model_path.with_name(model_path.name + f'.tmp-{os.getpid()}-{id(self)}')
        try:
            # Write + fully flush to a temp file first - the active .pkl is
            # not opened/truncated at any point during this step.
            with open(tmp_path, 'wb') as f:
                pickle.dump({
                    'model': self.model,
                    'vectorizer': self.vectorizer,
                    'training_stats': self.training_stats,
                    'trained_at': self.training_stats.get('trained_at') or datetime.now().isoformat(),
                    'source': self.training_stats.get('source') or 'supabase_feedback_training_human_reviewed'
                }, f)
                f.flush()
                os.fsync(f.fileno())

            # Only now, with a complete temp file on disk, atomically swap
            # it in for the active model.
            os.replace(str(tmp_path), str(model_path))
            print(f"[ML]  Model saved to {model_path}")
            return True
        except Exception as e:
            print(f"[ML] Error saving model: {e}")
            # Whether the failure happened while writing the temp file or
            # during os.replace() itself, clean up any temp file left
            # behind. os.replace() either fully succeeds or leaves both
            # files as they were - it never partially overwrites
            # model_path - so the active .pkl is untouched either way.
            try:
                if tmp_path.exists():
                    tmp_path.unlink()
            except Exception as cleanup_error:
                print(f"[ML] Could not remove temp model file {tmp_path}: {cleanup_error}")
            return False
    
    def _fetch_human_reviewed_rows(self):
        """
        Single source of truth for the "human-reviewed" query used by
        _has_training_data(), train_from_supabase(), and the gated-retrain
        row count. A row counts as human-reviewed when BOTH reviewed_by and
        reviewed_at are populated (IS NOT NULL) and label is a valid value.
        There is no 'verified' column.

        Returns (texts, labels, raw_row_count):
          - texts/labels: cleaned (non-empty phrase, valid label) lists,
            ready for train(). None/None if Supabase is unavailable.
          - raw_row_count: number of rows returned by the DB query BEFORE
            the phrase-emptiness re-check (matches what earlier code counted
            as "human-reviewed" rows), used as the basis for the new-rows
            threshold so it stays consistent with existing behavior.
        """
        if not HAS_SUPABASE:
            return None, None, 0
        try:
            client = supabase.get_client()
            if not client:
                return None, None, 0

            # postgrest-py syntax for SQL "IS NOT NULL" is .not_.is_(col, 'null')
            response = client.table('feedback_training') \
                .select('phrase, label, reviewed_by, reviewed_at') \
                .not_.is_('reviewed_by', 'null') \
                .not_.is_('reviewed_at', 'null') \
                .in_('label', ['Skill', 'Not Skill']) \
                .order('created_at', desc=True) \
                .execute()

            rows = response.data or []
            texts, labels = [], []
            for row in rows:
                phrase = row.get('phrase')
                label = row.get('label')
                if phrase is None:
                    continue
                phrase = str(phrase).strip()
                if not phrase:
                    continue
                if label not in ('Skill', 'Not Skill'):
                    continue
                texts.append(phrase)
                labels.append(1 if label == 'Skill' else 0)
            return texts, labels, len(rows)
        except Exception as e:
            print(f"[ML] Error fetching human-reviewed rows: {e}")
            return None, None, 0

    def _has_training_data(self):
        """
        Check if there's enough HUMAN-REVIEWED training data in Supabase
        (at least 10 valid rows).
        """
        texts, _, _ = self._fetch_human_reviewed_rows()
        if texts is None:
            return False
        return len(texts) >= 10

    def get_reviewed_row_count(self):
        """Current count of human-reviewed, validly-labeled feedback_training
        rows in Supabase (0 if Supabase unavailable)."""
        _, _, raw_count = self._fetch_human_reviewed_rows()
        return raw_count
    
    def train_from_supabase(self):
        """
        Train ML classifier using ONLY human-verified data from Supabase.
        This is the ONLY source of training data - ground truth.
        """
        if not HAS_SUPABASE:
            print("[ML] Supabase not available")
            return False
        
        client = supabase.get_client()
        if not client:
            print("[ML] Supabase client not connected")
            return False
        
        print("[ML] Training from HUMAN-REVIEWED feedback data...")
        print("=" * 60)
        
        try:
            texts, labels, raw_count = self._fetch_human_reviewed_rows()
            if texts is None:
                print("[ML] Supabase unavailable")
                return False
            print(f"[ML] Fetched {raw_count} human-reviewed rows "
                  f"(reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL, "
                  f"label IN ('Skill','Not Skill'))")
            
            valid_count = len(texts)
            print(f"[ML] Valid rows after filtering (non-empty phrase, valid label): {valid_count}")
            
            if valid_count < 10:
                print(f"[ML] Need at least 10 valid human-reviewed samples. Have {valid_count}")
                return False
            
            # Train the model. train() handles normalization, duplicate removal,
            # conflicting-label exclusion, the 80/20 split, and metric calculation,
            # and sets training_stats (total_samples etc.) from the FINAL cleaned
            # dataset - so we must not overwrite those values with the raw
            # pre-dedup/pre-conflict-filter counts afterward.
            success = self.train(texts, labels)
            
            if success:
                self.training_stats['source'] = 'supabase_feedback_training_human_reviewed'
                self.training_stats['trained_on_reviewed_count'] = raw_count
                self._save_model()
            
            return success
            
        except Exception as e:
            print(f"[ML] Error training from Supabase: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def train(self, texts, labels):
        """
        Train the classifier on labeled data.
        All data should be human-verified ground truth.

        Pipeline:
          1. Normalize each phrase (lowercase, strip, collapse whitespace).
          2. Drop duplicate normalized phrases.
          3. Exclude any normalized phrase that has conflicting labels
             (e.g. "autocad" appearing as both Skill and Not Skill).
          4. 80/20 stratified train/test split (test_size=0.2, random_state=42).
          5. Evaluate accuracy/precision/recall/F1 on the held-out test set only.
        """
        if len(texts) < 10:
            print(f"[ML] Need at least 10 samples. Got {len(texts)}")
            return False
        
        # --- Normalize: lowercase, strip, collapse repeated whitespace ---
        normalized = []
        for text, label in zip(texts, labels):
            if text is None:
                continue
            clean = re.sub(r'\s+', ' ', str(text).strip().lower())
            if clean:
                normalized.append((clean, label))
        
        # --- Group labels per normalized phrase to find duplicates/conflicts ---
        phrase_labels = {}
        first_seen_order = []
        for clean, label in normalized:
            if clean not in phrase_labels:
                phrase_labels[clean] = set()
                first_seen_order.append(clean)
            phrase_labels[clean].add(label)
        
        duplicates_removed = len(normalized) - len(first_seen_order)
        
        # --- Exclude phrases with conflicting labels ---
        unique_texts = []
        unique_labels = []
        conflicts_excluded = 0
        for clean in first_seen_order:
            label_set = phrase_labels[clean]
            if len(label_set) > 1:
                conflicts_excluded += 1
                print(f'[ML] WARNING: Conflicting labels for "{clean}" - excluded from training')
                continue
            unique_texts.append(clean)
            unique_labels.append(next(iter(label_set)))
        
        if len(unique_texts) < 10:
            print(f"[ML] Need at least 10 unique, non-conflicting samples. Got {len(unique_texts)}")
            return False
        
        y_all = np.array(unique_labels)
        n_skill = int((y_all == 1).sum())
        n_not_skill = int((y_all == 0).sum())
        
        # Need enough samples in EACH class for a stratified 80/20 split
        # (sklearn requires at least 2 per class to place >=1 in the test fold).
        if n_skill < 2 or n_not_skill < 2:
            print(f"[ML] Need at least 2 samples per class for a stratified split. "
                  f"Skill={n_skill}, Not Skill={n_not_skill}")
            return False
        
        print(f"[ML] Training with {len(unique_texts)} unique human-reviewed samples "
              f"({duplicates_removed} duplicates removed, "
              f"{conflicts_excluded} conflicting phrases excluded)")
        print(f"[ML]   Skill: {n_skill}  |  Not Skill: {n_not_skill}")
        
        # --- Vectorize ---
        X = self.vectorizer.fit_transform(unique_texts)
        y = y_all
        
        # --- 80/20 stratified split ---
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )
        
        # --- Train ---
        self.model.fit(X_train, y_train)
        self.is_trained = True
        
        # --- Evaluate on the held-out test set ONLY ---
        y_pred = self.model.predict(X_test)
        accuracy = accuracy_score(y_test, y_pred)
        precision = precision_score(y_test, y_pred, zero_division=0)
        recall = recall_score(y_test, y_pred, zero_division=0)
        f1 = f1_score(y_test, y_pred, zero_division=0)  # note: 'f1', not 'f1_score', to avoid shadowing the import
        
        self.training_stats.update({
            'total_samples': len(unique_texts),
            'train_samples': int(X_train.shape[0]),
            'test_samples': int(X_test.shape[0]),
            'skill_samples': n_skill,
            'not_skill_samples': n_not_skill,
            'accuracy': float(accuracy),
            'precision': float(precision),
            'recall': float(recall),
            'f1_score': float(f1),
            'trained_at': datetime.now().isoformat(),
            'sklearn_version': sklearn.__version__,
        })
        
        print(f"[ML]    Training complete!")
        print(f"[ML]    Accuracy:  {accuracy:.2%}")
        print(f"[ML]    Precision: {precision:.2%}")
        print(f"[ML]    Recall:    {recall:.2%}")
        print(f"[ML]    F1 Score:  {f1:.2%}")
        print(f"[ML]    Classification Report:")
        print(classification_report(y_test, y_pred, target_names=['Not Skill', 'Skill'], zero_division=0))
        
        return True
    
    def train_from_feedback(self, approved_skills, rejected_skills):
        """
        Train from user feedback (for backward compatibility with NLPProcessor)
        """
        texts = approved_skills + rejected_skills
        labels = [1] * len(approved_skills) + [0] * len(rejected_skills)
        return self.train(texts, labels)

    # ============ GATED, SAFE RETRAINING ============
    # Retraining is only triggered when >= threshold NEW human-reviewed rows
    # have accumulated since the last successful training (tracked via
    # training_stats['trained_on_reviewed_count']). A candidate model is
    # trained on the full accumulated human-reviewed dataset (not just the
    # newest rows); the active model/.pkl are only replaced if the
    # candidate trains successfully. A simple file lock prevents two
    # concurrent callers from retraining/overwriting the model at once.

    _RETRAIN_LOCK_STALE_SECONDS = 600  # a crashed process shouldn't wedge retraining forever

    def _retrain_lock_path(self):
        return Path(str(self.model_path) + '.retrain.lock')

    def _acquire_retrain_lock(self):
        lock_path = self._retrain_lock_path()
        try:
            if lock_path.exists():
                age = time.time() - lock_path.stat().st_mtime
                if age < self._RETRAIN_LOCK_STALE_SECONDS:
                    return None  # another process is retraining right now
                print(f"[ML] Stale retrain lock ({age:.0f}s old) - removing")
                try:
                    lock_path.unlink()
                except FileNotFoundError:
                    pass
            fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.close(fd)
            return lock_path
        except FileExistsError:
            return None
        except Exception as e:
            print(f"[ML] Could not acquire retrain lock: {e}")
            return None

    def _release_retrain_lock(self, lock_path):
        if not lock_path:
            return
        try:
            lock_path.unlink()
        except FileNotFoundError:
            pass
        except Exception as e:
            print(f"[ML] Could not release retrain lock: {e}")

    def get_new_reviewed_count(self):
        """How many human-reviewed rows exist now beyond what the active
        model was last trained on."""
        raw_count = self.get_reviewed_row_count()
        trained_on = self.training_stats.get('trained_on_reviewed_count', 0) or 0
        return max(0, raw_count - trained_on), raw_count

    def train_and_replace_if_needed(self, threshold=20):
        """
        Safely retrain the active model only when >= `threshold` NEW
        human-reviewed rows have accumulated since the last successful
        training. Returns a dict describing what happened; never raises.
        """
        lock_path = self._acquire_retrain_lock()
        if lock_path is None:
            print("[ML] Retrain already in progress elsewhere - skipping")
            return {'retrained': False, 'reason': 'locked'}

        try:
            texts, labels, raw_count = self._fetch_human_reviewed_rows()
            if texts is None:
                return {'retrained': False, 'reason': 'supabase_unavailable'}

            trained_on = self.training_stats.get('trained_on_reviewed_count', 0) or 0
            new_count = max(0, raw_count - trained_on)

            if new_count < threshold:
                print(f"[ML] {new_count} new human-reviewed rows (< {threshold}) - not retraining")
                return {
                    'retrained': False,
                    'reason': 'below_threshold',
                    'new_reviewed_count': new_count,
                    'total_reviewed_count': raw_count,
                    'threshold': threshold,
                }

            print(f"[ML] {new_count} new human-reviewed rows (>= {threshold}) - training candidate model...")

            # Train a CANDIDATE on a fresh vectorizer/model. The active
            # in-memory model and the .pkl on disk are left untouched
            # unless the candidate trains AND saves successfully.
            candidate = SkillClassifier(model_path=self.model_path, auto_train=False)
            candidate.vectorizer = TfidfVectorizer(
                max_features=5000, ngram_range=(1, 3), stop_words='english',
                min_df=1, max_df=0.95
            )
            candidate.model = LogisticRegression(
                C=1.0, max_iter=1000, random_state=42, class_weight='balanced'
            )
            candidate.is_trained = False
            candidate.training_stats = {'trained_on_reviewed_count': 0}

            success = candidate.train(texts, labels)
            if not success:
                print("[ML] Candidate training failed - active model left untouched")
                return {
                    'retrained': False,
                    'reason': 'training_failed',
                    'new_reviewed_count': new_count,
                    'total_reviewed_count': raw_count,
                }

            candidate.training_stats['source'] = 'supabase_feedback_training_human_reviewed'
            candidate.training_stats['trained_on_reviewed_count'] = raw_count

            if not candidate._save_model():
                print("[ML] Candidate trained but failed to save to disk - active model left untouched")
                return {
                    'retrained': False,
                    'reason': 'save_failed',
                    'new_reviewed_count': new_count,
                    'total_reviewed_count': raw_count,
                }

            # Only now adopt the candidate as the active in-memory model.
            self.model = candidate.model
            self.vectorizer = candidate.vectorizer
            self.is_trained = True
            self.training_stats = candidate.training_stats

            print(f"[ML] Retrain successful - active model replaced "
                  f"({raw_count} human-reviewed rows, {new_count} new)")
            return {
                'retrained': True,
                'new_reviewed_count': new_count,
                'total_reviewed_count': raw_count,
                'stats': self.training_stats,
            }
        finally:
            self._release_retrain_lock(lock_path)
    
    def predict(self, text):
        """
        Predict if a phrase is a skill using trained ML model.
        """
        if not self.is_trained:
            return self._fallback_predict(text)
        
        if isinstance(text, str):
            X = self.vectorizer.transform([text])
            pred = self.model.predict(X)[0]
            prob = self.model.predict_proba(X)[0]
            return {
                'prediction': int(pred),
                'label': 'Skill' if pred == 1 else 'Not Skill',
                'confidence': float(max(prob)),
                'prob_skill': float(prob[1]),
                'prob_not_skill': float(prob[0])
            }
        else:
            X = self.vectorizer.transform(text)
            preds = self.model.predict(X)
            probs = self.model.predict_proba(X)
            return [
                {
                    'prediction': int(preds[i]),
                    'label': 'Skill' if preds[i] == 1 else 'Not Skill',
                    'confidence': float(max(probs[i])),
                    'prob_skill': float(probs[i][1]),
                    'prob_not_skill': float(probs[i][0])
                }
                for i in range(len(text))
            ]
    
    def _fallback_predict(self, text):
        """Rule-based fallback when ML not trained"""
        if isinstance(text, str):
            # Check if it's a common skill term
            common_skills = ['excel', 'word', 'powerpoint', 'outlook', 'autocad', 'python', 'java', 'sql']
            if any(skill in text.lower() for skill in common_skills):
                return {'prediction': 1, 'label': 'Skill', 'confidence': 0.65, 'prob_skill': 0.65}
            return {
                'prediction': 1 if len(text.split()) >= 2 else 0,
                'label': 'Skill' if len(text.split()) >= 2 else 'Not Skill',
                'confidence': 0.50,
                'prob_skill': 0.50
            }
        else:
            return [
                {
                    'prediction': 1 if len(t.split()) >= 2 else 0,
                    'label': 'Skill' if len(t.split()) >= 2 else 'Not Skill',
                    'confidence': 0.50,
                    'prob_skill': 0.50
                }
                for t in text
            ]
    
    def get_feature_importance(self, top_n=20):
        """Get top features for skill classification"""
        if not self.is_trained:
            return {'top_skill_indicators': [], 'top_not_skill_indicators': []}
        
        feature_names = self.vectorizer.get_feature_names_out()
        coefficients = self.model.coef_[0]
        
        top_skill = sorted(
            zip(feature_names, coefficients),
            key=lambda x: x[1],
            reverse=True
        )[:top_n]
        
        top_not_skill = sorted(
            zip(feature_names, coefficients),
            key=lambda x: x[1]
        )[:top_n]
        
        return {
            'top_skill_indicators': top_skill,
            'top_not_skill_indicators': top_not_skill
        }
    
    def get_stats(self):
        """Get training statistics"""
        return self.training_stats


# ============ TRAINING SCRIPT ============
if __name__ == "__main__":
    import sys
    
    print("=" * 60)
    print(" TRAINING SKILL CLASSIFIER")
    print(" Using HUMAN-VERIFIED data from Supabase feedback_training")
    print("=" * 60)
    
    # Initialize classifier (uses same Supabase setup as your backend)
    classifier = SkillClassifier()
    
    # Train from Supabase ONLY
    success = classifier.train_from_supabase()
    
    if success:
        print("\n" + "=" * 60)
        print(" TRAINING COMPLETE!")
        print(f" Model saved to: {classifier.model_path}")
        print(f" Training Stats:")
        print(f"   Total samples: {classifier.training_stats.get('total_samples', 0)}")
        print(f"   Skills: {classifier.training_stats.get('skill_samples', 0)}")
        print(f"   Not Skills: {classifier.training_stats.get('not_skill_samples', 0)}")
        print(f"   Train samples: {classifier.training_stats.get('train_samples', 'N/A')}")
        print(f"   Test samples: {classifier.training_stats.get('test_samples', 'N/A')}")
        
        # IMPORTANT: accuracy of None means "not evaluated yet", not 0%.
        # Only format as a percentage when an actual value is present.
        for metric_key, metric_label in [
            ('accuracy', 'Accuracy'),
            ('precision', 'Precision'),
            ('recall', 'Recall'),
            ('f1_score', 'F1 Score'),
        ]:
            value = classifier.training_stats.get(metric_key)
            if value is None:
                print(f"   {metric_label}: N/A")
            else:
                print(f"   {metric_label}: {value:.2%}")
        
        # Test predictions
        print("\n" + "=" * 60)
        print(" TEST PREDICTIONS")
        print("=" * 60)
        
        test_phrases = [
            # Should be skills (from your approved list)
            "AutoCAD", "Project Management", "Microsoft Excel", "Lighting Design",
            "Proposal Engineering", "Cross-functional Collaboration", "Python",
            "Bid Management Tools", "Electrical Engineering",
            "client requirements", "electrical cost estimation", "technical documentation",
            "ups service support and coordination", "sales engineering",
            
            # Should NOT be skills (from your rejected list)
            "Philippines", "Certificate", "Mapúa University", "Patrick Cruz",
            "10 years", "Company Logo", "Full Name", "License Number",
            "Employee ID", "Date Hired", "Proposal Engineer", "EMP-006",
            "june 15, 2016", "internal use"
        ]
        
        print(f"{'Phrase':<40} {'Result':<15} {'Confidence'}")
        print("-" * 75)
        
        for phrase in test_phrases:
            result = classifier.predict(phrase)
            status = f" {result['label']}" if result['prediction'] == 1 else f" {result['label']}"
            conf = result['confidence']
            print(f"{phrase:<40} {status:<15} {conf:.2%}")
        
        # Feature importance
        print("\n" + "=" * 60)
        print(" TOP SKILL INDICATORS (Learned from Human Feedback)")
        print("=" * 60)
        importance = classifier.get_feature_importance()
        if importance:
            print("\n Top 10 Skill Indicators:")
            for feature, coef in importance['top_skill_indicators'][:10]:
                print(f"   {feature}: {coef:.3f}")
            
            print("\n Top 10 Not-Skill Indicators:")
            for feature, coef in importance['top_not_skill_indicators'][:10]:
                print(f"   {feature}: {coef:.3f}")
    else:
        print("\n Training failed. Need at least 10 human-verified samples in feedback_training table.")
    
    print("=" * 60)