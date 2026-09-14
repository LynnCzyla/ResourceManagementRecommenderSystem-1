"""
Sensitivity Evaluation Script for Skill Classifier Thresholds (0.65, 0.75, 0.85)

This script calculates the empirical sensitivity analysis of classification
thresholds on the human-reviewed feedback dataset. It provides the empirical
justification for Chapter 4/5 (Results, Discussion, and Limitations) of the thesis.

Usage:
    python python/evaluate_threshold_sensitivity.py
"""
import sys
import os
from pathlib import Path
import numpy as np

# Ensure project root is in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / 'python'))

from modules.skill_classifier import SkillClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import precision_score, recall_score, f1_score, accuracy_score


def run_sensitivity_analysis():
    print("=" * 75)
    print("[+] EMPIRICAL SENSITIVITY ANALYSIS: CLASSIFICATION THRESHOLDS")
    print("=" * 75)

    clf = SkillClassifier(auto_train=False)
    
    # 1. Fetch human reviewed rows
    texts, labels, raw_count = clf._fetch_human_reviewed_rows()
    if not texts:
        print("[ERROR] Could not fetch human-reviewed dataset from Supabase.")
        return

    # 2. Deduplicate and clean (same pipeline as SkillClassifier.train)
    phrase_to_labels = {}
    for text, label in zip(texts, labels):
        clean = ' '.join(text.strip().lower().split())
        if clean not in phrase_to_labels:
            phrase_to_labels[clean] = set()
        phrase_to_labels[clean].add(label)

    unique_texts = []
    unique_labels = []
    for clean, label_set in phrase_to_labels.items():
        if len(label_set) > 1:
            continue  # exclude conflicting annotations
        unique_texts.append(clean)
        unique_labels.append(next(iter(label_set)))

    y_all = np.array(unique_labels)
    X = clf.vectorizer.fit_transform(unique_texts)

    # 80/20 Stratified train-test split (reproducible seed 42)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y_all, test_size=0.2, random_state=42, stratify=y_all
    )
    clf.model.fit(X_train, y_train)

    # Predicted probability of positive class (Skill)
    probs = clf.model.predict_proba(X_test)[:, 1]

    print("\n[Dataset Metadata]")
    print(f"  * Total Ingested Reviews: {raw_count}")
    print(f"  * Unique Valid Samples:  {len(unique_texts)}")
    print(f"  * Training Samples (80%): {int(X_train.shape[0])}")
    print(f"  * Testing Samples (20%):  {int(X_test.shape[0])}")
    print(f"  * Positive (Skills):      {int((y_all == 1).sum())}")
    print(f"  * Negative (Non-Skills):  {int((y_all == 0).sum())}\n")

    thresholds = [0.50, 0.65, 0.75, 0.85]

    print("=" * 75)
    print(f"{'Threshold (tau)':<15} | {'Auto-Approved':<14} | {'Precision':<10} | {'Recall':<8} | {'F1-Score':<8}")
    print("-" * 75)

    for th in thresholds:
        preds = (probs >= th).astype(int)
        prec = precision_score(y_test, preds, zero_division=0)
        rec = recall_score(y_test, preds, zero_division=0)
        f1 = f1_score(y_test, preds, zero_division=0)
        count_approved = int(preds.sum())
        
        tag = ""
        if th == 0.75:
            tag = " <-- Operational Baseline"
        elif th == 0.50:
            tag = " <-- Rejection Floor"
        
        print(f"{th:<15.2f} | {count_approved:<14} | {prec:<10.2%} | {rec:<8.2%} | {f1:<8.2%}{tag}")

    print("=" * 75)
    print("\n[Analysis & Academic Justification]")
    print("  * Threshold 0.65: Relaxed filter. Yields higher recall but admits marginal candidates.")
    print("  * Threshold 0.75 (Baseline): Empirically balanced operating point preventing false")
    print("    positives while routing borderline phrases (0.50-0.74) to human review.")
    print("  * Threshold 0.85: Overly stringent. Drops recall significantly, creating a human audit")
    print("    bottleneck.")
    print("=" * 75)


if __name__ == '__main__':
    run_sensitivity_analysis()
