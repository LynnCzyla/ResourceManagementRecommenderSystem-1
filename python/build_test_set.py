import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path("ocr_test_samples")       # dito ang source/ at cv_XX.txt mo
OUT = Path("ocr_test_samples_v2")     # bagong folder para hindi maghalo
BASE_SEED = 42
TIERS = ["easy", "medium", "hard"]

# cv_XX -> source PDF (galing sa mga command mo)
SOURCES = {
    "cv_01": "Aaron Joseph Garcia",
    "cv_02": "Carlo Miguel Reyes",
    "cv_03": "Christian Paolo Mendoza",
    "cv_04": "Francis Dominic Flores",
    "cv_05": "John Michael Villanueva",
    "cv_06": "Joshua Miguel Diaz",
    "cv_07": "Kevin John Bautista",
    "cv_08": "Maria Angela Santos",
    "cv_09": "Mark Anthony Reyes",
    "cv_10": "Patrick Lawrence Cruz",
    "cv_11": "Raymond Carlo Navarro",
}

OUT.mkdir(exist_ok=True)

for idx, (cv, name) in enumerate(SOURCES.items()):
    src = ROOT / "source" / f"{name}_WEA_Employee_Competency_Profile_v2.pdf"
    gt = ROOT / f"{cv}.txt"
    if not src.exists() or not gt.exists():
        print(f"[SKIP] {cv}: missing {src.name if not src.exists() else gt.name}")
        continue

    # scanned tiers
    for tier in TIERS:
        out_pdf = OUT / f"{cv}_{tier}.pdf"
        subprocess.run(
            [sys.executable, "make_fake_scan.py",
             "--input", str(src), "--output", str(out_pdf),
             "--mode", tier, "--seed", str(BASE_SEED + idx)],
            check=True,
        )
        shutil.copy(gt, OUT / f"{cv}_{tier}.txt")

    # baseline: rasterize lang, walang degradation
    from pdf2image import convert_from_path
    pages = [p.convert("RGB") for p in convert_from_path(str(src), dpi=200)]
    pages[0].save(OUT / f"{cv}_baseline.pdf", save_all=True, append_images=pages[1:])
    shutil.copy(gt, OUT / f"{cv}_baseline.txt")

print(f"\nDone. {len(list(OUT.glob('*.pdf')))} PDFs sa {OUT}")