"""
SOP 5 LIVE retraining test (learning curve)
===========================================
Put in:  python/scripts/   (next to the ground-truth CSV)
Run:     python sop5_live_retrain_test.py --ground-truth ground_truth_supabase.csv

What it simulates
-----------------
Employees confirm Skill / Not Skill answers. Every 20 new verified phrases
the system retrains. This script replays that:

  1. Split the ground truth into a FEEDBACK pool and a fixed TEST set
     (TEST is never used for training -> no leakage).
  2. Train on seed data only            -> "Round 0" (BEFORE)
  3. Add 20 verified phrases, retrain   -> "Round 1"
  4. Add 20 more, retrain               -> "Round 2" ... and so on.
  5. Repeat with many random splits and report mean +/- SD.

Uses the real SkillClassifier. Does NOT touch Supabase and does NOT
overwrite shared-data/models/skill_classifier.pkl.
"""
import sys, re, csv, io, random, argparse, statistics, tempfile, contextlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.append(str(HERE.parent))
from modules.skill_classifier import SkillClassifier  # noqa: E402


def norm(p):
    return re.sub(r"\s+", " ", p.lower()).strip()


def load_ground_truth(path):
    rows, seen = [], set()
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            phrase = (r.get("phrase") or "").strip()
            label = (r.get("label") or "").strip()
            if phrase and label in ("Skill", "Not Skill") and norm(phrase) not in seen:
                seen.add(norm(phrase))          # drop duplicate phrases
                rows.append((phrase, 1 if label == "Skill" else 0))
    return rows


def load_seed(train_ml_path):
    """Read seed phrases from train_ml.py WITHOUT running it."""
    src = Path(train_ml_path).read_text(encoding="utf-8")
    body = src.split("training_texts = [", 1)[1].split("\n]\n", 1)[0]
    marker = "# ========== NOT SKILLS (label = 0) =========="
    skill_part, not_part = body.split(marker)
    strip = lambda s: re.sub(r"#.*", "", s)
    skills = re.findall(r'"([^"]*)"', strip(skill_part))
    nots = re.findall(r'"([^"]*)"', strip(not_part))
    return [(p, 1) for p in skills] + [(p, 0) for p in nots]


def metrics(y_true, y_pred):
    tp = sum(t == 1 and p == 1 for t, p in zip(y_true, y_pred))
    tn = sum(t == 0 and p == 0 for t, p in zip(y_true, y_pred))
    fp = sum(t == 0 and p == 1 for t, p in zip(y_true, y_pred))
    fn = sum(t == 1 and p == 0 for t, p in zip(y_true, y_pred))
    d = lambda a, b: a / b if b else 0.0
    prec, rec = d(tp, tp + fp), d(tp, tp + fn)
    return dict(tp=tp, tn=tn, fp=fp, fn=fn,
                acc=d(tp + tn, len(y_true)), prec=prec, rec=rec,
                f1=d(2 * prec * rec, prec + rec), spec=d(tn, tn + fp))


def train_and_score(train_rows, test_rows):
    with tempfile.TemporaryDirectory() as tmp:
        with contextlib.redirect_stdout(io.StringIO()):   # silence [ML] logs
            clf = SkillClassifier(model_path=Path(tmp) / "tmp.pkl", auto_train=False)
            if not clf.train([p for p, _ in train_rows], [l for _, l in train_rows]):
                raise RuntimeError("Training failed")
            y_true = [l for _, l in test_rows]
            y_pred = [clf.predict(p)["prediction"] for p, _ in test_rows]
    return metrics(y_true, y_pred)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ground-truth", default=str(HERE / "ground_truth.csv"))
    ap.add_argument("--train-ml", default=str(HERE.parent / "train_ml.py"))
    ap.add_argument("--batch", type=int, default=20, help="phrases per retrain (system threshold = 20)")
    ap.add_argument("--rounds", type=int, default=5, help="how many retrain rounds")
    ap.add_argument("--test-frac", type=float, default=0.4, help="share of data kept as fixed TEST set")
    ap.add_argument("--trials", type=int, default=30)
    args = ap.parse_args()

    seed = load_seed(args.train_ml)
    seed_set = {norm(p) for p, _ in seed}
    truth = [(p, l) for p, l in load_ground_truth(args.ground_truth) if norm(p) not in seed_set]
    need = args.batch * args.rounds
    print(f"Seed: {len(seed)} phrases | Usable ground truth (not in seed, de-duplicated): {len(truth)}")
    print(f"Skill/Not Skill in ground truth: {sum(l for _, l in truth)}/{len(truth) - sum(l for _, l in truth)}")

    skills = [r for r in truth if r[1] == 1]
    nots = [r for r in truth if r[1] == 0]
    n_test_s, n_test_n = int(len(skills) * args.test_frac), int(len(nots) * args.test_frac)
    if len(truth) - n_test_s - n_test_n < need:
        sys.exit(f"Not enough feedback phrases for {args.rounds} rounds x {args.batch}. Lower --rounds or --test-frac.")

    all_runs = []   # all_runs[trial][round] = metrics
    for seed_i in range(args.trials):
        rng = random.Random(seed_i)
        s, n = skills[:], nots[:]
        rng.shuffle(s); rng.shuffle(n)
        test = s[:n_test_s] + n[:n_test_n]                      # fixed per trial
        fb_s, fb_n = s[n_test_s:], n[n_test_n:]
        # feedback keeps the natural Skill / Not Skill ratio of the pool
        feedback = fb_s + fb_n
        rng.shuffle(feedback)
        runs = []
        for r in range(args.rounds + 1):
            runs.append(train_and_score(seed + feedback[: r * args.batch], test))
        all_runs.append(runs)

    print(f"Fixed TEST set per trial: {n_test_s + n_test_n} phrases (never trained on)\n")
    print("=" * 86)
    print(f"LEARNING CURVE, mean +/- SD over {args.trials} random splits")
    print("=" * 86)
    print(f"{'Round':<24}{'Acc':>12}{'Prec':>12}{'Recall':>12}{'F1':>12}{'Specificity':>13}")
    for r in range(args.rounds + 1):
        label = "0  (seed only)" if r == 0 else f"{r}  (+{r * args.batch} verified)"
        cells = ""
        for k in ("acc", "prec", "rec", "f1", "spec"):
            v = [t[r][k] for t in all_runs]
            cells += f"{statistics.mean(v):>8.1%}±{statistics.pstdev(v) * 100:>3.1f}" if k != "spec" else f"{statistics.mean(v):>9.1%}±{statistics.pstdev(v) * 100:>3.1f}"
        print(f"{label:<24}{cells}")

    last = args.rounds
    wins = sum(t[last]["f1"] > t[0]["f1"] for t in all_runs)
    ties = sum(t[last]["f1"] == t[0]["f1"] for t in all_runs)
    d = lambda k: (statistics.mean(t[last][k] for t in all_runs) - statistics.mean(t[0][k] for t in all_runs)) * 100
    print(f"\nRound 0 -> Round {last}:  Acc {d('acc'):+.1f}  Prec {d('prec'):+.1f}  Recall {d('rec'):+.1f}  F1 {d('f1'):+.1f}  (points)")
    print(f"F1 improved in {wins}/{args.trials} splits (tied in {ties}).")

    b, a = all_runs[0][0], all_runs[0][last]
    print("\nEXAMPLE RUN (trial 0) for the confusion-matrix table:")
    print(f"{'':<22}{'TP':>4}{'TN':>4}{'FP':>4}{'FN':>4}{'Acc':>8}{'Prec':>8}{'Rec':>8}{'F1':>8}")
    for name, m in (("Before (seed only)", b), (f"After (+{last * args.batch})", a)):
        print(f"{name:<22}{m['tp']:>4}{m['tn']:>4}{m['fp']:>4}{m['fn']:>4}{m['acc']:>8.1%}{m['prec']:>8.1%}{m['rec']:>8.1%}{m['f1']:>8.1%}")


if __name__ == "__main__":
    main()