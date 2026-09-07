"""
Diagnostic script for skill_classifier.pkl.

Usage: python3 diagnose_model.py /path/to/skill_classifier.pkl

Loads the RAW pickle directly (bypassing SkillClassifier's own loading
logic) so it reports the on-disk artifact's true state, independent of
any load-time validation added to the application code.
"""
import sys
import pickle
import sklearn


def diagnose(model_path):
    print(f"sklearn runtime version: {sklearn.__version__}")

    with open(model_path, 'rb') as f:
        data = pickle.load(f)

    model = data.get('model')
    vectorizer = data.get('vectorizer')
    stats = data.get('training_stats', {}) or {}

    print(f"model type: {type(model)}")
    print(f"vectorizer type: {type(vectorizer)}")
    print(f"pickled sklearn_version (from training_stats): {stats.get('sklearn_version', 'unknown')}")

    has_vocab = hasattr(vectorizer, 'vocabulary_')
    print(f'hasattr(vectorizer, "vocabulary_"): {has_vocab}')
    if has_vocab:
        try:
            print(f"vocabulary size: {len(vectorizer.vocabulary_)}")
        except Exception as e:
            print(f"vocabulary size: ERROR reading vocabulary_ ({e})")
    else:
        print("vocabulary size: n/a")

    has_idf = hasattr(vectorizer, 'idf_')
    print(f'hasattr(vectorizer, "idf_"): {has_idf}')
    if has_idf:
        try:
            print(f"idf length: {len(vectorizer.idf_)}")
        except Exception as e:
            print(f"idf length: ERROR reading idf_ ({e})")
    else:
        print("idf length: n/a")

    try:
        print(f"model classes: {model.classes_}")
    except Exception as e:
        print(f"model classes: ERROR ({e})")

    try:
        print(f"model coefficient shape: {model.coef_.shape}")
    except Exception as e:
        print(f"model coefficient shape: ERROR ({e})")

    for phrase in ("Microsoft Excel", "Lighting Design"):
        try:
            X = vectorizer.transform([phrase])
            pred = model.predict(X)[0]
            prob = model.predict_proba(X)[0]
            print(f'predict("{phrase}"): SUCCESS -> prediction={int(pred)}, '
                  f'confidence={float(max(prob)):.4f}')
        except Exception as e:
            print(f'predict("{phrase}"): FAILED -> {type(e).__name__}: {e}')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 diagnose_model.py /path/to/skill_classifier.pkl")
        sys.exit(1)
    diagnose(sys.argv[1])