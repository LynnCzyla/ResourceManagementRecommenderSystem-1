"""
OCR Accuracy Test
==================
Measures how accurately Tesseract (via module1_ocr.OCRProcessor) extracts text
from your scanned/image documents, against ground-truth transcriptions you
provide.

Reports:
  - Word-level accuracy %  =  correct words / total ground-truth words * 100
  - Word Error Rate (WER)  =  (substitutions + deletions + insertions) / total ground-truth words
  - Example error cases (substitutions/deletions/insertions), so you have
    qualitative evidence like "Siemens S7" -> "Siemens 57" for your report.

------------------------------------------------------------------------------
HOW TO SET THIS UP
------------------------------------------------------------------------------
1. Pick 15-20 sample documents (mix of clean scans and messier ones).
2. Put each source file and its ground-truth transcript in the SAME folder,
   with the SAME base filename, e.g.:

       ocr_test_samples/
         cv_01.pdf
         cv_01.txt      <- you type out exactly what the document says
         cv_02.jpg
         cv_02.txt
         ...

   The .txt file is your manually-typed "ground truth" — type it out by
   reading the document yourself (not by copying the OCR output), otherwise
   you'll just be grading Tesseract against itself.

3. Run:
       python test_ocr_accuracy.py --samples-dir ocr_test_samples

   Optional flags:
       --source raw        Compare against OCR's raw text instead of the
                            pipeline-cleaned text (default: cleaned)
       --case-sensitive     Don't lowercase before comparing
       --output-dir DIR     Where to write results.csv / results.md
                            (default: ocr_test_samples/results)

4. Open results.md for a shareable report, or results.csv for the raw numbers.
------------------------------------------------------------------------------
"""
import sys
import os
import re
import csv
import json
import argparse
from pathlib import Path

sys.path.append(str(Path(__file__).parent))
from modules.module1_ocr import OCRProcessor

SUPPORTED_EXTS = {'.pdf', '.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp'}


def normalize_words(text, case_sensitive=False):
    """Turn raw text into a list of comparable word tokens."""
    if not text:
        return []
    if not case_sensitive:
        text = text.lower()
    # Split on whitespace; strip surrounding punctuation from each token but
    # keep internal punctuation (e.g. "S7", "3.5", "co-op") intact.
    tokens = text.split()
    tokens = [t.strip('.,;:!?()[]{}"\'`') for t in tokens]
    return [t for t in tokens if t]


def word_level_align(gt_words, hyp_words):
    """
    Classic Levenshtein alignment at the WORD level, with backtrace, so we
    get both the edit counts (S/D/I) AND the actual mismatched word pairs
    for the qualitative error examples.
    Returns (ops, S, D, I) where ops is a list of
    ('equal'|'sub'|'del'|'ins', gt_word_or_None, hyp_word_or_None).
    """
    n, m = len(gt_words), len(hyp_words)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        dp[i][0] = i
    for j in range(m + 1):
        dp[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if gt_words[i - 1] == hyp_words[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j],      # deletion
                                    dp[i][j - 1],      # insertion
                                    dp[i - 1][j - 1])  # substitution

    ops = []
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0 and gt_words[i - 1] == hyp_words[j - 1] and dp[i][j] == dp[i - 1][j - 1]:
            ops.append(('equal', gt_words[i - 1], hyp_words[j - 1]))
            i -= 1
            j -= 1
        elif i > 0 and j > 0 and dp[i][j] == dp[i - 1][j - 1] + 1:
            ops.append(('sub', gt_words[i - 1], hyp_words[j - 1]))
            i -= 1
            j -= 1
        elif i > 0 and dp[i][j] == dp[i - 1][j] + 1:
            ops.append(('del', gt_words[i - 1], None))
            i -= 1
        else:
            ops.append(('ins', None, hyp_words[j - 1]))
            j -= 1
    ops.reverse()

    S = sum(1 for o in ops if o[0] == 'sub')
    D = sum(1 for o in ops if o[0] == 'del')
    I = sum(1 for o in ops if o[0] == 'ins')
    return ops, S, D, I


def find_pairs(samples_dir):
    """Match each ground-truth .txt to a source file with the same stem."""
    samples_dir = Path(samples_dir)
    txt_files = {p.stem: p for p in samples_dir.glob('*.txt')}
    pairs = []
    missing_gt = []
    for f in sorted(samples_dir.iterdir()):
        if f.suffix.lower() in SUPPORTED_EXTS:
            gt = txt_files.get(f.stem)
            if gt:
                pairs.append((f, gt))
            else:
                missing_gt.append(f.name)
    return pairs, missing_gt


def run(samples_dir, output_dir, source_field, case_sensitive):
    pairs, missing_gt = find_pairs(samples_dir)
    if missing_gt:
        print(f"[WARN] Skipping {len(missing_gt)} file(s) with no matching .txt ground truth: {missing_gt}")
    if not pairs:
        print(f"[ERROR] No (document, ground-truth) pairs found in {samples_dir}")
        return

    ocr = OCRProcessor()
    per_doc = []
    total_S = total_D = total_I = total_N = 0
    all_subs, all_dels, all_ins = [], [], []

    for doc_path, gt_path in pairs:
        name = doc_path.name
        print(f"\n[TEST] {name}")
        gt_text = gt_path.read_text(encoding='utf-8', errors='replace')

        try:
            result = ocr.extract_text(str(doc_path))
            hyp_text = result['raw_text'] if source_field == 'raw' else result['cleaned_text']
            method = result.get('method', 'unknown')
        except Exception as e:
            print(f"  [ERROR] OCR failed: {e}")
            per_doc.append({
                'file': name, 'method': 'FAILED', 'words_gt': len(normalize_words(gt_text)),
                'substitutions': None, 'deletions': None, 'insertions': None,
                'wer': None, 'accuracy_pct': 0.0,
            })
            continue

        gt_words = normalize_words(gt_text, case_sensitive)
        hyp_words = normalize_words(hyp_text, case_sensitive)

        ops, S, D, I = word_level_align(gt_words, hyp_words)
        N = len(gt_words)
        wer = (S + D + I) / N if N else 0.0
        accuracy = ((N - S - D) / N * 100) if N else 0.0

        print(f"  method={method}  gt_words={N}  sub={S} del={D} ins={I}  WER={wer:.3f}  accuracy={accuracy:.1f}%")

        total_S += S
        total_D += D
        total_I += I
        total_N += N

        for op, gt_w, hyp_w in ops:
            if op == 'sub':
                all_subs.append((name, gt_w, hyp_w))
            elif op == 'del':
                all_dels.append((name, gt_w))
            elif op == 'ins':
                all_ins.append((name, hyp_w))

        per_doc.append({
            'file': name, 'method': method, 'words_gt': N,
            'substitutions': S, 'deletions': D, 'insertions': I,
            'wer': round(wer, 4), 'accuracy_pct': round(accuracy, 2),
        })

    overall_wer = (total_S + total_D + total_I) / total_N if total_N else 0.0
    overall_accuracy = ((total_N - total_S - total_D) / total_N * 100) if total_N else 0.0

    # ---------------- write outputs ----------------
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    csv_path = output_dir / 'results.csv'
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['file', 'method', 'words_gt', 'substitutions',
                                                'deletions', 'insertions', 'wer', 'accuracy_pct'])
        writer.writeheader()
        writer.writerows(per_doc)
        writer.writerow({})
        writer.writerow({'file': 'OVERALL', 'words_gt': total_N,
                          'substitutions': total_S, 'deletions': total_D, 'insertions': total_I,
                          'wer': round(overall_wer, 4), 'accuracy_pct': round(overall_accuracy, 2)})

    json_path = output_dir / 'results.json'
    json_path.write_text(json.dumps({
        'per_document': per_doc,
        'overall': {'words_gt': total_N, 'substitutions': total_S, 'deletions': total_D,
                    'insertions': total_I, 'wer': round(overall_wer, 4), 'accuracy_pct': round(overall_accuracy, 2)},
    }, indent=2), encoding='utf-8')

    md_path = output_dir / 'results.md'
    lines = []
    lines.append("# OCR Accuracy Test Results\n")
    lines.append(f"Compared against **{source_field}** text, "
                 f"{'case-sensitive' if case_sensitive else 'case-insensitive'} matching.\n")
    lines.append("## Overall\n")
    lines.append(f"- Documents tested: {len(per_doc)}")
    lines.append(f"- Total ground-truth words: {total_N}")
    lines.append(f"- **Word-level Accuracy: {overall_accuracy:.1f}%**")
    lines.append(f"- **Word Error Rate (WER): {overall_wer:.3f}**")
    lines.append(f"  (Substitutions: {total_S}, Deletions: {total_D}, Insertions: {total_I})\n")
    lines.append("## Per-document results\n")
    lines.append("| File | Method | GT Words | Sub | Del | Ins | WER | Accuracy |")
    lines.append("|---|---|---|---|---|---|---|---|")
    for d in per_doc:
        if d['wer'] is None:
            lines.append(f"| {d['file']} | FAILED | {d['words_gt']} | - | - | - | - | 0.0% |")
        else:
            lines.append(f"| {d['file']} | {d['method']} | {d['words_gt']} | {d['substitutions']} | "
                         f"{d['deletions']} | {d['insertions']} | {d['wer']:.3f} | {d['accuracy_pct']:.1f}% |")

    lines.append("\n## Example error cases\n")
    lines.append("### Substitutions (ground truth -> OCR output)\n")
    for name, gt_w, hyp_w in all_subs[:20]:
        lines.append(f"- `{gt_w}` -> `{hyp_w}`  ({name})")
    if not all_subs:
        lines.append("- none")

    lines.append("\n### Deletions (word in ground truth, missing from OCR)\n")
    for name, gt_w in all_dels[:15]:
        lines.append(f"- `{gt_w}`  ({name})")
    if not all_dels:
        lines.append("- none")

    lines.append("\n### Insertions (word OCR added that isn't in ground truth)\n")
    for name, hyp_w in all_ins[:15]:
        lines.append(f"- `{hyp_w}`  ({name})")
    if not all_ins:
        lines.append("- none")

    md_path.write_text('\n'.join(lines), encoding='utf-8')

    print("\n" + "=" * 60)
    print(f"OVERALL: accuracy={overall_accuracy:.1f}%  WER={overall_wer:.3f}  "
          f"(sub={total_S} del={total_D} ins={total_I}, N={total_N})")
    print(f"Wrote: {csv_path}")
    print(f"Wrote: {json_path}")
    print(f"Wrote: {md_path}")
    print("=" * 60)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Test OCR accuracy against ground-truth transcripts.")
    parser.add_argument('--samples-dir', required=True, help="Folder containing <name>.pdf/.jpg + <name>.txt pairs")
    parser.add_argument('--output-dir', default=None, help="Where to write results (default: <samples-dir>/results)")
    parser.add_argument('--source', choices=['raw', 'cleaned'], default='cleaned',
                         help="Compare against OCR's raw_text or pipeline-cleaned_text (default: cleaned)")
    parser.add_argument('--case-sensitive', action='store_true', help="Don't lowercase before comparing")
    args = parser.parse_args()

    out_dir = args.output_dir or str(Path(args.samples_dir) / 'results')
    run(args.samples_dir, out_dir, args.source, args.case_sensitive)
