"""
Make Fake Scan
==============
Turns a clean, native/digital PDF (selectable-text) into a scan-like image
or image-based PDF, so it forces the OCR branch of module1_ocr.py instead
of the fast pdfplumber/PyPDF2 text-extraction branch.

This is a *simulation* of a scan (rotation/skew, blur, noise, brightness/
contrast jitter, JPEG-compression artifacts) — it's good for building a
repeatable "medium/hard" test set, but it's not a substitute for a few real
phone-camera or scanner scans in your accuracy test. Mix both.

------------------------------------------------------------------------------
USAGE
------------------------------------------------------------------------------
    python make_fake_scan.py --input cv_01.pdf --output cv_01_scan.pdf --mode medium
    python make_fake_scan.py --input cv_02.pdf --output cv_02_scan.png --mode hard

--mode controls how rough the fake scan looks:
    easy    -> barely distorted (near-clean scan)
    medium  -> mild skew/blur/noise (typical office scanner)
    hard    -> heavier skew/blur/noise (phone photo of a printed page)

Output can be:
    .pdf           -> multi-page image-based PDF (no text layer)
    .png/.jpg/...  -> single image per page (page number appended if >1 page)

Requires: pdf2image (+ poppler installed on your system, same as the rest of
the OCR pipeline), Pillow, numpy. All already in requirements.clean.txt
except numpy/Pillow which are also already there.
------------------------------------------------------------------------------
"""
import sys
import argparse
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageEnhance

try:
    from pdf2image import convert_from_path
except ImportError:
    convert_from_path = None

PRESETS = {
    #            max_rotation_deg, blur_radius, noise_sigma, brightness_range,     contrast_range,      jpeg_quality
    'easy':   dict(rotation=0.5, blur=0.3, noise=4,  brightness=(0.95, 1.05), contrast=(0.95, 1.05), jpeg_quality=90),
    'medium': dict(rotation=2.0, blur=0.8, noise=10, brightness=(0.85, 1.15), contrast=(0.85, 1.15), jpeg_quality=70),
    'hard':   dict(rotation=5.0, blur=1.5, noise=20, brightness=(0.7, 1.3),  contrast=(0.7, 1.3),   jpeg_quality=45),
}


def add_noise(img, sigma):
    if sigma <= 0:
        return img
    arr = np.array(img).astype(np.float32)
    noise = np.random.normal(0, sigma, arr.shape)
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def fake_scan_page(img, preset):
    img = img.convert('RGB')

    # Skew, like a page that wasn't laid perfectly flat on the scanner
    angle = random.uniform(-preset['rotation'], preset['rotation'])
    img = img.rotate(angle, expand=True, fillcolor=(255, 255, 255), resample=Image.BICUBIC)

    # Slight blur, like scanner/camera focus softness
    if preset['blur'] > 0:
        img = img.filter(ImageFilter.GaussianBlur(radius=preset['blur']))

    # Brightness / contrast jitter, like uneven lighting or scanner exposure
    b_lo, b_hi = preset['brightness']
    c_lo, c_hi = preset['contrast']
    img = ImageEnhance.Brightness(img).enhance(random.uniform(b_lo, b_hi))
    img = ImageEnhance.Contrast(img).enhance(random.uniform(c_lo, c_hi))

    # Sensor/print noise
    img = add_noise(img, preset['noise'])

    # JPEG round-trip to introduce compression artifacts
    import io
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=preset['jpeg_quality'])
    buf.seek(0)
    img = Image.open(buf).convert('RGB')

    return img


def load_pages(input_path):
    input_path = Path(input_path)
    if input_path.suffix.lower() == '.pdf':
        if convert_from_path is None:
            raise RuntimeError("pdf2image is not installed. pip install pdf2image (and install poppler).")
        return convert_from_path(str(input_path), dpi=200)
    else:
        return [Image.open(input_path)]


def save_pages(pages, output_path):
    output_path = Path(output_path)
    if output_path.suffix.lower() == '.pdf':
        first, rest = pages[0].convert('RGB'), [p.convert('RGB') for p in pages[1:]]
        first.save(output_path, save_all=True, append_images=rest)
        print(f"[OK] Wrote {len(pages)}-page fake-scan PDF: {output_path}")
    else:
        if len(pages) == 1:
            pages[0].save(output_path)
            print(f"[OK] Wrote fake-scan image: {output_path}")
        else:
            stem, suffix = output_path.stem, output_path.suffix
            for i, p in enumerate(pages, 1):
                p.save(output_path.with_name(f"{stem}_p{i}{suffix}"))
            print(f"[OK] Wrote {len(pages)} fake-scan images with prefix: {stem}_p*{suffix}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Convert a clean PDF/image into a scan-like PDF/image for OCR testing.")
    parser.add_argument('--input', required=True, help="Source PDF or image file")
    parser.add_argument('--output', required=True, help="Output path (.pdf for multi-page, or an image extension)")
    parser.add_argument('--mode', choices=PRESETS.keys(), default='medium', help="How rough the fake scan should look")
    parser.add_argument('--seed', type=int, default=None, help="Random seed, for reproducible output")
    args = parser.parse_args()

    if args.seed is not None:
        random.seed(args.seed)
        np.random.seed(args.seed)

    preset = PRESETS[args.mode]
    pages = load_pages(args.input)
    scanned = [fake_scan_page(p, preset) for p in pages]
    save_pages(scanned, args.output)
