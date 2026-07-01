"""
Module 2.5: Skill Classifier (Machine Learning)
Trains on labeled data to predict if a phrase is a skill
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

class SkillClassifier:
    """Machine Learning classifier for skill vs non-skill detection"""
    
    def __init__(self, model_path=None):
        self.model_path = model_path or self._get_default_model_path()
        self.vectorizer = TfidfVectorizer(
            max_features=5000,
            ngram_range=(1, 3),
            stop_words='english'
        )
        self.model = LogisticRegression(
            C=1.0,
            max_iter=1000,
            random_state=42
        )
        self.is_trained = False
        
        # Try to load existing model
        self._load_model()
    
    def _get_default_model_path(self):
        """Get default path for model storage"""
        base_dir = Path(__file__).parent.parent.parent
        model_dir = base_dir / 'shared-data' / 'models'
        model_dir.mkdir(parents=True, exist_ok=True)
        return model_dir / 'skill_classifier.pkl'
    
    def _load_model(self):
        """Load trained model if exists"""
        if Path(self.model_path).exists():
            try:
                with open(self.model_path, 'rb') as f:
                    data = pickle.load(f)
                    self.model = data['model']
                    self.vectorizer = data['vectorizer']
                    self.is_trained = True
                print(f"[ML] Loaded trained model from {self.model_path}")
                return True
            except Exception as e:
                print(f"[ML] Error loading model: {e}")
        
        print("[ML] No trained model found. Training required.")
        return False
    
    def _save_model(self):
        """Save trained model"""
        try:
            with open(self.model_path, 'wb') as f:
                pickle.dump({
                    'model': self.model,
                    'vectorizer': self.vectorizer
                }, f)
            print(f"[ML] Model saved to {self.model_path}")
            return True
        except Exception as e:
            print(f"[ML] Error saving model: {e}")
            return False
    
    def train(self, texts, labels):
        """
        Train the classifier on labeled data.
        
        Args:
            texts: List of candidate phrases
            labels: List of labels (1 = skill, 0 = not skill)
        """
        if len(texts) < 10:
            print(f"[ML] Need at least 10 samples. Got {len(texts)}")
            return False
        
        print(f"[ML] Training with {len(texts)} samples...")
        
        # Vectorize
        X = self.vectorizer.fit_transform(texts)
        y = np.array(labels)
        
        # Split for validation
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        
        # Train
        self.model.fit(X_train, y_train)
        self.is_trained = True
        
        # Evaluate
        y_pred = self.model.predict(X_test)
        accuracy = accuracy_score(y_test, y_pred)
        
        print(f"[ML] Training complete!")
        print(f"[ML] Accuracy: {accuracy:.2%}")
        print(f"[ML] Classification Report:")
        print(classification_report(y_test, y_pred, target_names=['Not Skill', 'Skill']))
        
        # Save model
        self._save_model()
        
        return True
    
    def predict(self, text):
        """
        Predict if a phrase is a skill.
        
        Args:
            text: Single phrase or list of phrases
        
        Returns:
            Prediction (0=Not Skill, 1=Skill) or list of predictions
        """
        if not self.is_trained:
            print("[ML] Model not trained. Using fallback.")
            return 1 if len(text.split()) >= 2 else 0
        
        if isinstance(text, str):
            X = self.vectorizer.transform([text])
            pred = self.model.predict(X)[0]
            prob = self.model.predict_proba(X)[0]
            return {
                'prediction': int(pred),
                'confidence': float(max(prob)),
                'prob_skill': float(prob[1])
            }
        else:
            X = self.vectorizer.transform(text)
            preds = self.model.predict(X)
            probs = self.model.predict_proba(X)
            return [
                {
                    'prediction': int(preds[i]),
                    'confidence': float(max(probs[i])),
                    'prob_skill': float(probs[i][1])
                }
                for i in range(len(text))
            ]
    
    def predict_skill(self, text, threshold=0.70):
        """
        Predict if a phrase is a skill with threshold.
        
        Returns: (is_skill, confidence)
        """
        if isinstance(text, str):
            result = self.predict(text)
            is_skill = result['prediction'] == 1 and result['confidence'] >= threshold
            return is_skill, result['confidence']
        
        results = self.predict(text)
        return [
            (r['prediction'] == 1 and r['confidence'] >= threshold, r['confidence'])
            for r in results
        ]
    
    def get_feature_importance(self, top_n=20):
        """Get top features for skill classification"""
        if not self.is_trained:
            return []
        
        feature_names = self.vectorizer.get_feature_names_out()
        coefficients = self.model.coef_[0]
        
        # Get top positive (skill indicators) and negative (non-skill indicators)
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
    
    def generate_training_data_from_feedback(self, nlp_processor):
        """
        Generate training data from user feedback.
        
        This connects your feedback system to the ML classifier.
        """
        texts = []
        labels = []
        
        # Get approved skills (1 = skill)
        for skill in nlp_processor.feedback_log.get('approved', []):
            texts.append(skill)
            labels.append(1)
        
        # Get rejected skills (0 = not skill)
        for skill in nlp_processor.feedback_log.get('rejected', []):
            texts.append(skill)
            labels.append(0)
        
        if len(texts) >= 10:
            print(f"[ML] Generating training data from {len(texts)} feedback items")
            return self.train(texts, labels)
        
        return False


# Example training script
if __name__ == "__main__":
    # Sample training data
    sample_texts = [
        "AutoCAD", "Technical Drafting", "Microsoft Office", "Python", "Java",
        "Project Management", "Leadership", "Communication", "Data Analysis",
        "Machine Learning", "Deep Learning", "SQL", "Excel", "PowerPoint",
        "Philippines", "Certificate", "March 2024", "TESDA", "Email", "Phone",
        "Bachelor of Science", "University", "College", "Graduate", "Intern",
        "Resume", "Address", "Contact", "Date of Birth", "Nationality",
        "Registered Electrical Engineer", "PRC", "License", "WEA", "Employee"
    ]
    
    sample_labels = [
        1, 1, 1, 1, 1,  # Skills
        1, 1, 1, 1, 1,  # Skills
        1, 1, 1, 1, 1,  # Skills
        0, 0, 0, 0, 0,  # Not skills
        0, 0, 0, 0, 0,  # Not skills
        0, 0, 0, 0, 0,  # Not skills
        0, 0, 0, 0, 0   # Not skills
    ]
    
    classifier = SkillClassifier()
    classifier.train(sample_texts, sample_labels)
    
    # Test predictions
    test_phrases = [
        "AutoCAD",
        "Philippines",
        "Python",
        "Certificate",
        "Project Management",
        "Email"
    ]
    
    print("\n[ML] Test Predictions:")
    for phrase in test_phrases:
        result = classifier.predict(phrase)
        print(f"  {phrase}: {'Skill' if result['prediction'] == 1 else 'Not Skill'} (conf: {result['confidence']:.2f})")
    
    # Feature importance
    print("\n[ML] Top Skill Indicators:")
    importance = classifier.get_feature_importance()
    for feature, coef in importance['top_skill_indicators'][:10]:
        print(f"  {feature}: {coef:.3f}")