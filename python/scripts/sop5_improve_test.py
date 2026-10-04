"""
Try model improvements for the skill classifier (safe: no Supabase, no .pkl overwrite).
Run: python sop5_improve_test.py --ground-truth ground_truth_supabase.csv
"""
import sys, argparse, random, statistics, warnings
from pathlib import Path
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion
from sklearn.linear_model import LogisticRegression
warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
sys.path.append(str(HERE))
from sop5_live_retrain_test import load_seed, load_ground_truth, norm, metrics


def word(stop="english", ng=(1, 3)):
    return TfidfVectorizer(ngram_range=ng, stop_words=stop, max_df=0.95, sublinear_tf=True)

def chars(lo=2, hi=5):
    return TfidfVectorizer(analyzer="char_wb", ngram_range=(lo, hi), sublinear_tf=True)

VARIANTS = {
    "A. Current (word 1-3, stopwords, C=1)":   lambda: (word(), LogisticRegression(C=1, max_iter=1000, class_weight="balanced")),
    "B. No stopword removal":                  lambda: (word(None), LogisticRegression(C=1, max_iter=1000, class_weight="balanced")),
    "C. Word + char n-grams":                  lambda: (FeatureUnion([("w", word(None, (1, 2))), ("c", chars())]), LogisticRegression(C=1, max_iter=1000, class_weight="balanced")),
    "D. Word + char, C=5":                     lambda: (FeatureUnion([("w", word(None, (1, 2))), ("c", chars())]), LogisticRegression(C=5, max_iter=1000, class_weight="balanced")),
    "E. Word + char, C=20":                    lambda: (FeatureUnion([("w", word(None, (1, 2))), ("c", chars())]), LogisticRegression(C=20, max_iter=1000, class_weight="balanced")),
}

def fit_predict(make, train, test, thr=0.5):
    vec, model = make()
    X = vec.fit_transform([norm(p) for p, _ in train])
    model.fit(X, [l for _, l in train])
    p = model.predict_proba(vec.transform([norm(p) for p, _ in test]))[:, 1]
    return metrics([l for _, l in test], [int(x >= thr) for x in p])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ground-truth", default=str(HERE / "ground_truth.csv"))
    ap.add_argument("--train-ml", default=str(HERE.parent / "train_ml.py"))
    ap.add_argument("--trials", type=int, default=30)
    ap.add_argument("--feedback", type=int, default=100)
    args = ap.parse_args()

    seed = load_seed(args.train_ml)
    sset = {norm(p) for p, _ in seed}
    truth = [(p, l) for p, l in load_ground_truth(args.ground_truth) if norm(p) not in sset]
    S = [r for r in truth if r[1] == 1]; N = [r for r in truth if r[1] == 0]
    ts, tn = int(len(S) * .4), int(len(N) * .4)
    base = sum(l for _, l in truth) / len(truth)
    print(f"Always-'Skill' baseline: Acc {base:.1%}, F1 {2*base/(1+base):.1%}, Specificity 0%\n")

    thr_list = [0.5, 0.6, 0.7]
    res = {}
    for t in range(args.trials):
        rng = random.Random(t); s, n = S[:], N[:]; rng.shuffle(s); rng.shuffle(n)
        test = s[:ts] + n[:tn]; fb = s[ts:] + n[tn:]; rng.shuffle(fb)
        train = seed + fb[:args.feedback]
        for name, mk in VARIANTS.items():
            for thr in thr_list:
                res.setdefault((name, thr), []).append(fit_predict(mk, train, test, thr))

    def row(label, rs):
        m = lambda k: statistics.mean(r[k] for r in rs)
        print(f"{label:<44}{m('acc'):>8.1%}{m('prec'):>8.1%}{m('rec'):>8.1%}{m('f1'):>8.1%}{m('spec'):>8.1%}")
    print(f"Seed + {args.feedback} verified, mean of {args.trials} splits, TEST={ts+tn} unseen phrases")
    print(f"{'Variant':<44}{'Acc':>8}{'Prec':>8}{'Rec':>8}{'F1':>8}{'Spec':>8}")
    for name in VARIANTS:
        row(name + " @0.5", res[(name, 0.5)])
    print("\nThreshold effect (prob_skill cutoff) on variants A and D:")
    for name in (list(VARIANTS)[0], list(VARIANTS)[3]):
        for thr in (0.6, 0.7):
            row(f"{name[:2]} cutoff {thr}", res[(name, thr)])

if __name__ == "__main__":
    main()