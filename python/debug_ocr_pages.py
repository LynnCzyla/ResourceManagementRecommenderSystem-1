"""
Debug OCR Pages
===============
Dumps the RAW page image and the PREPROCESSED (binary) image that Tesseract
actually sees, side by side, for a given PDF. Use this to visually diagnose
why a document is scoring low accuracy — you can't tell from the numbers
alone whether the scan itself is bad, or whether our preprocessing is
making it worse.

USAGE:
    python debug_ocr_pages.py --input ocr_test_samples/cv_08.pdf --output-dir debug_out

Then open debug_out/ and look at:
    cv_08_page1_raw.png       <- what the scan actually looks like
    cv_08_page1_processed.png <- what Tesseract sees after our pipeline

Share the *_processed.png files back — that's the fastest way to see if
CLAHE/threshold is helping or hurting on a specific page.
"""
import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from pdf2image import convert_from_path


def _deskew(gray):
    """Same lightweight deskew used in module1_ocr.py, kept standalone here
    so this script has no dependency on the pipeline module."""
    coords = np.column_stack(np.where(gray < 200))
    if coords.shape[0] < 50:
        return gray
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle
    if abs(angle) < 0.1:
        return gray
    h, w = gray.shape[:2]
    M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
    return cv2.warpAffine(gray, M, (w, h), flags=cv2.INTER_CUBIC,
                           borderMode=cv2.BORDER_REPLICATE)


def process_page(image):
    """Mirrors the current module1_ocr.py preprocessing steps."""
    img_arr = np.array(image)
    img_bgr = cv2.cvtColor(img_arr, cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)

    gray = _deskew(gray)
    gray = cv2.medianBlur(gray, 3)

    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    sharpened = laplacian_var < 150
    if sharpened:
        blurred = cv2.GaussianBlur(gray, (0, 0), sigmaX=3)
        gray = cv2.addWeighted(gray, 1.5, blurred, -0.5, 0)

    h, w = gray.shape[:2]
    if max(h, w) < 1600:
        scale = min(1.6, 3000 / max(h, w))
        gray = cv2.resize(gray, (int(w * scale), int(h * scale)),
                           interpolation=cv2.INTER_CUBIC)

    _, otsu_binary = cv2.threshold(gray, 0, 255,
                                   cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    fg_ratio = np.mean(otsu_binary < 128)

    return otsu_binary, {'laplacian_var': laplacian_var, 'sharpened': sharpened, 'fg_ratio': fg_ratio}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output-dir', default='debug_out')
    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    pages = convert_from_path(str(input_path), dpi=200)
    for i, page in enumerate(pages, 1):
        raw_path = output_dir / f"{input_path.stem}_page{i}_raw.png"
        page.save(raw_path)

        binary, stats = process_page(page)
        processed_path = output_dir / f"{input_path.stem}_page{i}_processed.png"
        Image.fromarray(binary).save(processed_path)

        print(f"[{input_path.stem} page {i}] laplacian_var={stats['laplacian_var']:.1f} "
              f"sharpened={stats['sharpened']} fg_ratio={stats['fg_ratio']:.3f}")
        print(f"  raw:       {raw_path}")
        print(f"  processed: {processed_path}")
