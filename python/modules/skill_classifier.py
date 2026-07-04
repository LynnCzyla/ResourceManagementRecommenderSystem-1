"""
Module 2.5: Skill Classifier (Machine Learning)
Trains ONLY on human-verified data from Supabase feedback_training table
Uses the same Supabase client as your Node.js backend
"""
import pickle
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
from pathlib import Path
import json
import re
import os
from datetime import datetime

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
    
    def __init__(self, model_path=None):
        self.model_path = model_path or self._get_default_model_path()
        
        self.vectorizer = TfidfVectorizer(
            max_features=5000,
            ngram_range=(1, 3),
            stop_words='english',
            min_df=2,
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
            'skill_samples': 0,
            'not_skill_samples': 0,
            'accuracy': None,
            'trained_at': None
        }
        
        # Try to load existing model
        if not self._load_model():
            print("[ML] No trained model found.")
            # Auto-train if data available in Supabase
            if self._has_training_data():
                print("[ML] Found training data in Supabase. Auto-training...")
                self.train_from_supabase()
    
    def _get_default_model_path(self):
        """Get default path for model storage"""
        base_dir = Path(__file__).parent.parent.parent
        model_dir = base_dir / 'shared-data' / 'models'
        model_dir.mkdir(parents=True, exist_ok=True)
        return model_dir / 'skill_classifier.pkl'
    
    def _load_model(self):
        """Load trained model from disk"""
        if Path(self.model_path).exists():
            try:
                with open(self.model_path, 'rb') as f:
                    data = pickle.load(f)
                    self.model = data['model']
                    self.vectorizer = data['vectorizer']
                    self.is_trained = True
                    self.training_stats = data.get('training_stats', {})
                print(f"[ML]  Loaded trained model from {self.model_path}")
                print(f"[ML]    Trained on {self.training_stats.get('total_samples', 0)} human-verified samples")
                return True
            except Exception as e:
                print(f"[ML] Error loading model: {e}")
        
        return False
    
    def _save_model(self):
        """Save trained model to disk"""
        try:
            with open(self.model_path, 'wb') as f:
                pickle.dump({
                    'model': self.model,
                    'vectorizer': self.vectorizer,
                    'training_stats': self.training_stats,
                    'trained_at': datetime.now().isoformat(),
                    'source': 'supabase_feedback_training'
                }, f)
            print(f"[ML]  Model saved to {self.model_path}")
            return True
        except Exception as e:
            print(f"[ML] Error saving model: {e}")
            return False
    
    def _has_training_data(self):
        """Check if there's training data in Supabase feedback_training table"""
        if not HAS_SUPABASE:
            return False
        
        try:
            client = supabase.get_client()
            if not client:
                return False
            
            # Use the same pattern as your JavaScript: supabase.from('feedback_training').select()
            response = client.table('feedback_training') \
                .select('id', count='exact') \
                .neq('label', 'null') \
                .neq('phrase', 'null') \
                .execute()
            
            return len(response.data) >= 10
        except Exception as e:
            print(f"[ML] Error checking training data: {e}")
            return False
    
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
        
        print("[ML] Training from human-verified feedback data...")
        print("=" * 60)
        
        try:
            # Get ALL human-verified labels from feedback_training
            # Matches your JavaScript: supabase.from('feedback_training').select('phrase, label')
            response = client.table('feedback_training') \
                .select('phrase, label') \
                .neq('label', 'null') \
                .neq('phrase', 'null') \
                .order('created_at', desc=True) \
                .execute()
            
            data = response.data
            
            if len(data) < 10:
                print(f"[ML] Need at least 10 samples. Have {len(data)}")
                return False
            
            texts = []
            labels = []
            for row in data:
                phrase = row.get('phrase', '').strip()
                label = row.get('label')
                if phrase and label:
                    texts.append(phrase)
                    labels.append(1 if label == 'Skill' else 0)
            
            print(f"[ML]  Loaded {len(texts)} human-verified samples")
            print(f"   Skills: {sum(labels)}")
            print(f"   Not Skills: {len(labels) - sum(labels)}")
            print(f"   Ratio: {sum(labels)/len(labels):.1%} skills")
            
            # Train the model
            success = self.train(texts, labels)
            
            # Update stats
            if success:
                self.training_stats = {
                    'total_samples': len(texts),
                    'skill_samples': sum(labels),
                    'not_skill_samples': len(labels) - sum(labels),
                    'source': 'supabase_feedback_training',
                    'trained_at': datetime.now().isoformat()
                }
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
        """
        if len(texts) < 10:
            print(f"[ML] Need at least 10 samples. Got {len(texts)}")
            return False
        
        # Remove duplicates while preserving order
        seen = set()
        unique_texts = []
        unique_labels = []
        for text, label in zip(texts, labels):
            text_clean = text.strip().lower()
            if text_clean and text_clean not in seen:
                seen.add(text_clean)
                unique_texts.append(text_clean)
                unique_labels.append(label)
        
        if len(unique_texts) < 10:
            print(f"[ML] Need at least 10 unique samples. Got {len(unique_texts)}")
            return False
        
        print(f"[ML] Training with {len(unique_texts)} unique human-verified samples...")
        
        # Vectorize
        X = self.vectorizer.fit_transform(unique_texts)
        y = np.array(unique_labels)
        
        # Split for validation (if enough data)
        if len(unique_texts) >= 20:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42, stratify=y
            )
            validation = True
        else:
            X_train, y_train = X, y
            validation = False
        
        # Train
        self.model.fit(X_train, y_train)
        self.is_trained = True
        
        # Evaluate if validation data available
        if validation:
            y_pred = self.model.predict(X_test)
            accuracy = accuracy_score(y_test, y_pred)
            self.training_stats['accuracy'] = float(accuracy)
            
            print(f"[ML]    Training complete!")
            print(f"[ML]    Accuracy: {accuracy:.2%}")
            print(f"[ML]    Classification Report:")
            print(classification_report(y_test, y_pred, target_names=['Not Skill', 'Skill']))
        else:
            print(f"[ML]   Training complete! (No validation - limited data)")
        
        return True
    
    def train_from_feedback(self, approved_skills, rejected_skills):
        """
        Train from user feedback (for backward compatibility with NLPProcessor)
        """
        texts = approved_skills + rejected_skills
        labels = [1] * len(approved_skills) + [0] * len(rejected_skills)
        return self.train(texts, labels)
    
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
        if classifier.training_stats.get('accuracy'):
            print(f"   Accuracy: {classifier.training_stats['accuracy']:.2%}")
        
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