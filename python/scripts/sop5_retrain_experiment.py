"""
SOP 5 mini-experiment: classifier Precision / Recall / F1 BEFORE vs AFTER retraining
====================================================================================
Put this file in:  python/scripts/   (next to ground_truth.csv)
Run from there:    python sop5_retrain_experiment.py

What it does
------------
1. BEFORE model = SkillClassifier trained on the starting seed data
   (the labeled phrases inside train_ml.py).
2. AFTER model  = the same SkillClassifier retrained on seed data + N NEW
   human-verified phrases (N = 20 is the system's retraining threshold).
3. Both models are tested on the SAME held-out phrases, which are never used
   for training (no leakage).
4. The split is repeated many times (different random seeds) so the result
   is not a lucky split. Mean +/- SD is reported, plus one example run.

The "new verified phrases" come from ground_truth.csv (your 106 human-labeled
phrases), the same pool used for Table 8. In the live system these would be
the Skill / Not Skill answers that Employees confirm.

It uses the real SkillClassifier class from modules/skill_classifier.py, so
what is tested is the system's own training code. It does NOT touch Supabase
and does NOT overwrite shared-data/models/skill_classifier.pkl.
"""
import sys
import re
import csv
import io
import random
import argparse
import statistics
import tempfile
import contextlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.append(str(HERE.parent))  # python/ folder, so "modules" can be imported
from modules.skill_classifier import SkillClassifier  # noqa: E402


# ---------------------------------------------------------------- data loading
def load_ground_truth(path):
    rows = []
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            phrase = (r.get("phrase") or "").strip()
            label = (r.get("label") or "").strip()
            if phrase and label in ("Skill", "Not Skill"):
                rows.append((phrase, 1 if label == "Skill" else 0))
    return rows


def load_seed(train_ml_path):
    """Read the labeled seed phrases from train_ml.py WITHOUT running it
    (running it would overwrite your real model file)."""
    src = Path(train_ml_path).read_text(encoding="utf-8")
    body = src.split("training_texts = [", 1)[1].split("\n]\n", 1)[0]
    marker = "# ========== NOT SKILLS (label = 0) =========="
    skill_part, not_skill_part = body.split(marker)
    strip_comments = lambda s: re.sub(r"#.*", "", s)
    skills = re.findall(r'"([^"]*)"', strip_comments(skill_part))
    not_skills = re.findall(r'"([^"]*)"', strip_comments(not_skill_part))
    return [(p, 1) for p in skills] + [(p, 0) for p in not_skills]


# ---------------------------------------------------------------- metrics
def confusion(y_true, y_pred):
    tp = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 1)
    tn = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 0)
    fp = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 1)
    fn = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 0)
    return tp, tn, fp, fn


def metrics(tp, tn, fp, fn):
    div = lambda a, b: a / b if b else 0.0
    acc = div(tp + tn, tp + tn + fp + fn)
    prec = div(tp, tp + fp)
    rec = div(tp, tp + fn)
    f1 = div(2 * prec * rec, prec + rec)
    return dict(tp=tp, tn=tn, fp=fp, fn=fn, acc=acc, prec=prec, rec=rec, f1=f1)


def train_and_score(train_rows, test_rows):
    """Train a fresh SkillClassifier on train_rows, score it on test_rows."""
    with tempfile.TemporaryDirectory() as tmp:
        with contextlib.redirect_stdout(io.StringIO()):  # silence [ML] logs
            clf = SkillClassifier(model_path=Path(tmp) / "tmp.pkl", auto_train=False)
            ok = clf.train([p for p, _ in train_rows], [l for _, l in train_rows])
            if not ok:
                raise RuntimeError("Training failed (not enough data?)")
            y_true = [l for _, l in test_rows]
            y_pred = [clf.predict(p)["prediction"] for p, _ in test_rows]
    return metrics(*confusion(y_true, y_pred))


# ---------------------------------------------------------------- experiment
def run(seed_rows, truth_rows, n_new, trials):
    seed_phrases = {re.sub(r"\s+", " ", p.lower()) for p, _ in seed_rows}
    # Remove any ground-truth phrase that is already in the seed data, so the
    # test phrases are genuinely unseen by the BEFORE model.
    pool = [(p, l) for p, l in truth_rows if re.sub(r"\s+", " ", p.lower()) not in seed_phrases]
    dropped = len(truth_rows) - len(pool)

    skills = [r for r in pool if r[1] == 1]
    nots = [r for r in pool if r[1] == 0]
    print(f"Seed phrases (BEFORE model trains on these): {len(seed_rows)} "
          f"({sum(l for _, l in seed_rows)} Skill / {len(seed_rows) - sum(l for _, l in seed_rows)} Not Skill)")
    print(f"Ground-truth pool: {len(truth_rows)} phrases, {dropped} dropped because already in seed data -> {len(pool)} usable")
    print(f"Each trial: {n_new} new verified phrases added for retraining, the rest ({len(pool) - n_new}) used ONLY for testing\n")

    results_before, results_after, example = [], [], None
    for seed in range(trials):
        rng = random.Random(seed)
        s, n = skills[:], nots[:]
        rng.shuffle(s)
        rng.shuffle(n)
        half = n_new // 2
        new_rows = s[:half] + n[: n_new - half]          # balanced new feedback
        test_rows = s[half:] + n[n_new - half:]          # never used for training
        before = train_and_score(seed_rows, test_rows)
        after = train_and_score(seed_rows + new_rows, test_rows)
        results_before.append(before)
        results_after.append(after)
        if seed == 0:
            example = (before, after, len(test_rows))

    return results_before, results_after, example


def summarize(name, results):
    out = {}
    for k in ("acc", "prec", "rec", "f1"):
        vals = [r[k] for r in results]
        out[k] = (statistics.mean(vals), statistics.pstdev(vals))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ground-truth", default=str(HERE / "ground_truth.csv"))
    ap.add_argument("--train-ml", default=str(HERE.parent / "train_ml.py"))
    ap.add_argument("--new", type=int, default=20, help="new verified phrases added at retraining (default 20)")
    ap.add_argument("--trials", type=int, default=30)
    args = ap.parse_args()

    seed_rows = load_seed(args.train_ml)
    truth_rows = load_ground_truth(args.ground_truth)
    before, after, example = run(seed_rows, truth_rows, args.new, args.trials)

    # ---- one example run (use this one for the confusion-matrix table)
    b, a, n_test = example
    print("=" * 74)
    print(f"EXAMPLE RUN (trial 0), test set = {n_test} unseen phrases")
    print("=" * 74)
    print(f"{'':<22}{'TP':>4}{'TN':>4}{'FP':>4}{'FN':>4}{'Acc':>9}{'Prec':>9}{'Recall':>9}{'F1':>9}")
    for label, m in (("Before retraining", b), (f"After (+{args.new} verified)", a)):
        print(f"{label:<22}{m['tp']:>4}{m['tn']:>4}{m['fp']:>4}{m['fn']:>4}"
              f"{m['acc']:>9.1%}{m['prec']:>9.1%}{m['rec']:>9.1%}{m['f1']:>9.1%}")

    # ---- repeated trials
    sb, sa = summarize("before", before), summarize("after", after)
    print("\n" + "=" * 74)
    print(f"AVERAGE OVER {args.trials} RANDOM SPLITS (mean +/- SD)")
    print("=" * 74)
    print(f"{'':<22}{'Accuracy':>16}{'Precision':>16}{'Recall':>16}{'F1':>16}")
    for label, s in (("Before retraining", sb), (f"After (+{args.new} verified)", sa)):
        print(f"{label:<22}" + "".join(f"{s[k][0]:>10.1%} ±{s[k][1]*100:>3.1f}" for k in ("acc", "prec", "rec", "f1")))
    diff = {k: sa[k][0] - sb[k][0] for k in sa}
    print(f"{'Change':<22}" + "".join(f"{diff[k]*100:>+15.1f}%" for k in ("acc", "prec", "rec", "f1")))
    wins = sum(1 for x, y in zip(before, after) if y["f1"] > x["f1"])
    ties = sum(1 for x, y in zip(before, after) if y["f1"] == x["f1"])
    print(f"\nF1 improved in {wins} of {args.trials} splits (tied in {ties}).")
    print("Report the example run in the table, and the averaged rows to show it is not a lucky split.")


if __name__ == "__main__":
    main()