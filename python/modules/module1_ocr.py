"""
Module 1: Smart Text Extraction - Fast PDF + Parallel OCR Fallback
"""
import os
import sys
import time
import re
import hashlib
import gc
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

# Redirect prints to stderr
def debug_print(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

# ============== PDF Libraries ==============
try:
    import pdfplumber
    PDFPLUMBER_SUPPORT = True
    debug_print("[OK] pdfplumber loaded")
except ImportError:
    pdfplumber = None
    PDFPLUMBER_SUPPORT = False
    debug_print("[WARN] pdfplumber NOT installed")

try:
    import PyPDF2
    PDF_SUPPORT = True
    debug_print("[OK] PyPDF2 loaded")
except ImportError:
    PyPDF2 = None
    PDF_SUPPORT = False
    debug_print("[WARN] PyPDF2 NOT installed")

# ============== OCR Libraries ==============
try:
    import cv2
    import pytesseract
    from PIL import Image
    import numpy as np
    OCR_SUPPORT = True
    debug_print("[OK] OCR libraries loaded")
except ImportError:
    cv2 = None
    pytesseract = None
    Image = None
    np = None
    OCR_SUPPORT = False
    debug_print("[WARN] OCR libraries NOT installed")

try:
    from pdf2image import convert_from_path
    PDF2IMAGE_SUPPORT = True
    debug_print("[OK] pdf2image loaded")
except ImportError:
    convert_from_path = None
    PDF2IMAGE_SUPPORT = False
    debug_print("[WARN] pdf2image NOT installed")

class OCRProcessor:
    """Smart text extractor - Fast PDF first, OCR only when needed"""
    
    def __init__(self, config=None):
        self.config = config or {}
        
        # Set Tesseract path
        if OCR_SUPPORT and os.name == 'nt':
            tesseract_path = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
            if os.path.exists(tesseract_path):
                pytesseract.pytesseract.tesseract_cmd = tesseract_path
                debug_print("[OK] Tesseract found")
        
        self.stats = {
            'total_processed': 0,
            'processing_times': [],
            'pdf_extractions': 0,
            'ocr_extractions': 0,
            'pages_processed': 0
        }
        
        debug_print("[Processor] Initialized")
        debug_print(f"[Processor] PDF Support: {PDFPLUMBER_SUPPORT or PDF_SUPPORT}")
        debug_print(f"[Processor] OCR Support: {OCR_SUPPORT and PDF2IMAGE_SUPPORT}")
    
    # ============================================================
    # METHOD 1: Fast PDF Extraction (INSTANT)
    # ============================================================
    def extract_from_pdf_fast(self, pdf_path):
        """Extract text directly from PDF - FASTEST"""
        
        # Try pdfplumber first
        if PDFPLUMBER_SUPPORT:
            try:
                debug_print("[FAST] Trying pdfplumber...")
                import pdfplumber
                with pdfplumber.open(pdf_path) as pdf:
                    all_text = []
                    for page in pdf.pages:
                        page_text = page.extract_text()
                        if page_text and page_text.strip():
                            all_text.append(page_text)
                    
                    if all_text:
                        full_text = '\n\n'.join(all_text)
                        debug_print(f"[FAST] pdfplumber: {len(full_text)} chars, {len(pdf.pages)} pages")
                        return full_text, 'pdfplumber'
            except Exception as e:
                debug_print(f"[FAST] pdfplumber error: {e}")
        
        # Try PyPDF2
        if PDF_SUPPORT:
            try:
                debug_print("[FAST] Trying PyPDF2...")
                with open(pdf_path, 'rb') as file:
                    reader = PyPDF2.PdfReader(file)
                    all_text = []
                    for page in reader.pages:
                        page_text = page.extract_text()
                        if page_text and page_text.strip():
                            all_text.append(page_text)
                    
                    if all_text:
                        full_text = '\n\n'.join(all_text)
                        debug_print(f"[FAST] PyPDF2: {len(full_text)} chars, {len(reader.pages)} pages")
                        return full_text, 'pypdf2'
            except Exception as e:
                debug_print(f"[FAST] PyPDF2 error: {e}")
        
        return None, None
    
    # ============================================================
    # METHOD 2: Fast OCR for Scanned PDFs (OPTIMIZED)
    # ============================================================
    def extract_with_ocr_fast(self, file_path):
        """OCR — scanned PDFs and images.
        Pages are converted from the PDF one at a time (not all at once) and
        processed with a small worker pool (currently capped at 1 - serial)
        to keep peak memory low on memory-constrained hosts (e.g. Render's
        512MB instances). Each page's intermediate image arrays are
        explicitly freed (del + gc.collect()) as soon as that page's OCR is
        done, instead of waiting for Python's garbage collector to get to
        them whenever it feels like it.
        """
        if not OCR_SUPPORT or not PDF2IMAGE_SUPPORT:
            debug_print("[OCR] OCR not available")
            return None

        debug_print("[OCR] Starting OCR...")

        def _deskew(gray):
            """Estimate and correct page skew/tilt before OCR.
            Uses minAreaRect over foreground (text) pixels to find the
            dominant text angle, then rotates the page to straighten it.
            Skips correction if too little text is found or the detected
            angle looks unreliable (avoids over-rotating near-blank pages).
            """
            try:
                inv = cv2.threshold(gray, 0, 255,
                                     cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
                coords = np.column_stack(np.where(inv > 0))
                if coords.shape[0] < 100:
                    return gray  # not enough text pixels to estimate angle safely
                angle = cv2.minAreaRect(coords)[-1]
                if angle < -45:
                    angle = -(90 + angle)
                else:
                    angle = -angle
                if abs(angle) < 0.1 or abs(angle) > 15:
                    return gray  # ignore no-op or implausible angles
                (h, w) = gray.shape[:2]
                M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
                return cv2.warpAffine(gray, M, (w, h),
                                       flags=cv2.INTER_CUBIC,
                                       borderMode=cv2.BORDER_REPLICATE)
            except Exception:
                return gray

        def _mean_confidence(pil_img):
            """Mean Tesseract word confidence for a page — DIAGNOSTIC ONLY,
            used solely to compare Otsu vs adaptive thresholding and pick
            the better one. Does NOT filter or alter the returned text.
            (Earlier version of this function also dropped any word below
            conf 40 from the text itself — meant to kill hallucinated
            garbage, but on genuinely noisy "hard" pages it was just as
            likely to drop real, correctly-read words that happened to score
            low confidence because of the noise, which is what caused the
            cv_08/cv_10/cv_11 deletion spike. Text filtering is no longer
            done here; the word-count sanity guard below handles hallucination.)
            """
            data = pytesseract.image_to_data(
                pil_img, config='--oem 3 --psm 6',
                output_type=pytesseract.Output.DICT
            )
            confs = []
            for conf in data['conf']:
                try:
                    conf = float(conf)
                except (ValueError, TypeError):
                    continue
                if conf >= 0:
                    confs.append(conf)
            return sum(confs) / len(confs) if confs else 0.0

        def _ocr_page(args):
            """Process a single page image and return (page_num, text)."""
            page_num, image = args
            page_start = time.time()   # ← DAGDAG DITO
            gray = None
            otsu_binary = None
            adaptive_binary = None
            try:
                if not OCR_SUPPORT or pytesseract is None:
                    return page_num, ''
                img_arr = np.array(image)
                img_bgr = cv2.cvtColor(img_arr, cv2.COLOR_RGB2BGR)
                raw_gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

                # MINIMAL candidate — deskew + Otsu only, no CLAHE/sharpen/
                # upscale. This is the safest baseline: it can't be hurt by
                # over-processing, but it also won't help pages that
                # genuinely need contrast correction or sharpening.
                minimal_gray = _deskew(raw_gray.copy())
                _, minimal_binary = cv2.threshold(minimal_gray, 0, 255,
                                                   cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                minimal_text = pytesseract.image_to_string(
                    Image.fromarray(minimal_binary), config='--oem 3 --psm 6'
                )

                # NEW: Early exit — if the minimal pass already reads
                # cleanly, don't bother computing the enhanced pipeline at
                # all. Most "easy" pages don't need CLAHE/sharpening, and
                # skipping the second OCR pass on them keeps runtime close
                # to the single-pass baseline; only genuinely hard pages
                # pay the cost of running both candidates.
                minimal_conf = _mean_confidence(Image.fromarray(minimal_binary))
                EARLY_EXIT_CONFIDENCE = 75
                if minimal_conf >= EARLY_EXIT_CONFIDENCE:
                    debug_print(f"[OCR] Page {page_num}: minimal conf {minimal_conf:.1f} already good — skipped enhanced pass")
                    debug_print(f"[OCR] Page {page_num}: {len(minimal_text)} chars, took {time.time() - page_start:.1f}s")
                    result = page_num, minimal_text.strip() if minimal_text else ''
                    # ============ MEMORY CLEANUP ============
                    del img_arr, img_bgr, raw_gray, minimal_gray, minimal_binary
                    gc.collect()
                    # ==========================================
                    return result

                # ENHANCED candidate — CLAHE + deskew + denoise + conditional
                # sharpen + upscale + Otsu/adaptive pick. Helps pages with
                # poor contrast/lighting or genuine blur, but can hurt pages
                # that are already noisy (CLAHE/sharpen amplify noise instead
                # of text) — that's exactly what happened to cv_08/cv_10/cv_11
                # when we trusted this pipeline unconditionally. Now it's
                # just a candidate, not the default.
                gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(raw_gray)
                gray = _deskew(gray)
                gray = cv2.medianBlur(gray, 3)

                laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
                BLUR_THRESHOLD = 150
                if laplacian_var < BLUR_THRESHOLD:
                    blurred = cv2.GaussianBlur(gray, (0, 0), sigmaX=3)
                    gray = cv2.addWeighted(gray, 1.5, blurred, -0.5, 0)

                h, w = gray.shape[:2]
                if max(h, w) < 1600:
                    scale = min(1.6, 2000 / max(h, w))
                    gray = cv2.resize(gray, (int(w * scale), int(h * scale)),
                                       interpolation=cv2.INTER_CUBIC)

                _, otsu_binary = cv2.threshold(gray, 0, 255,
                                               cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                enhanced_text = pytesseract.image_to_string(
                    Image.fromarray(otsu_binary), config='--oem 3 --psm 6'
                )
                enhanced_binary_for_conf = otsu_binary

                fg_ratio = np.mean(otsu_binary < 128)
                if fg_ratio < 0.02 or fg_ratio > 0.6:
                    adaptive_binary = cv2.adaptiveThreshold(
                        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                        cv2.THRESH_BINARY, blockSize=31, C=15
                    )
                    kernel = np.ones((2, 2), np.uint8)
                    adaptive_binary = cv2.morphologyEx(adaptive_binary, cv2.MORPH_OPEN, kernel)
                    adaptive_text = pytesseract.image_to_string(
                        Image.fromarray(adaptive_binary), config='--oem 3 --psm 6'
                    )
                    otsu_conf = _mean_confidence(Image.fromarray(otsu_binary))
                    adaptive_conf = _mean_confidence(Image.fromarray(adaptive_binary))
                    if adaptive_conf > otsu_conf:
                        enhanced_text = adaptive_text
                        enhanced_binary_for_conf = adaptive_binary

                # DECIDE — pick whichever of minimal vs enhanced has higher
                # mean OCR confidence for THIS specific page, instead of
                # always trusting the enhanced pipeline. This is what lets
                # "easy" pages benefit from CLAHE/sharpening while "hard"/
                # very noisy pages fall back to the safer minimal version.
                # (minimal_conf was already computed above for the early-exit
                # check — reused here rather than recomputed.)
                enhanced_conf = _mean_confidence(Image.fromarray(enhanced_binary_for_conf))
                if enhanced_conf >= minimal_conf:
                    text = enhanced_text
                    debug_print(f"[OCR] Page {page_num}: laplacian_var={laplacian_var:.1f}, used ENHANCED (conf {enhanced_conf:.1f} >= minimal {minimal_conf:.1f})")
                else:
                    text = minimal_text
                    debug_print(f"[OCR] Page {page_num}: laplacian_var={laplacian_var:.1f}, used MINIMAL (conf {minimal_conf:.1f} > enhanced {enhanced_conf:.1f})")

                # Sanity guard — belt-and-suspenders in case BOTH candidates
                # somehow blow up (shouldn't happen now, but cheap to keep).
                MAX_SANE_WORDS_PER_PAGE = 1000
                if len(text.split()) > MAX_SANE_WORDS_PER_PAGE:
                    debug_print(f"[OCR] Page {page_num}: {len(text.split())} words looks like a hallucination — forcing minimal")
                    text = minimal_text

                debug_print(f"[OCR] Page {page_num}: {len(text)} chars, took {time.time() - page_start:.1f}s")
                result = page_num, text.strip() if text else ''
                # ============ MEMORY CLEANUP ============
                del img_arr, img_bgr, raw_gray, minimal_gray, minimal_binary
                if gray is not None:
                    del gray
                if otsu_binary is not None:
                    del otsu_binary
                if adaptive_binary is not None:
                    del adaptive_binary
                gc.collect()
                # ==========================================
                return result
            except Exception as exc:
                debug_print(f"[OCR] Page {page_num} error: {exc} (after {time.time() - page_start:.1f}s)")
                gc.collect()
                return page_num, ''

        try:
            is_pdf = file_path.lower().endswith('.pdf')
            images = []

            if is_pdf:
                debug_print("[OCR] Converting PDF to images (one page at a time)...")
                from pdf2image import pdfinfo_from_path
                info = pdfinfo_from_path(file_path)
                num_pages = info["Pages"]
                debug_print(f"[OCR] PDF has {num_pages} pages")

                # ============ FIX: Adaptive DPI based on actual page size ============
                # Some scanned PDFs report an oversized MediaBox (page dimensions in
                # points), so a fixed dpi=150 balloons into a huge pixel canvas
                # (e.g. 3580x4613 instead of the expected ~1275x1650 for a normal
                # letter page). Rather than rendering huge and downscaling after
                # (wasteful and no quality gain), compute the DPI that targets a
                # sane max pixel dimension directly, so text renders at a
                # consistent, OCR-appropriate resolution regardless of how the
                # source PDF reports its page size.
                TARGET_MAX_DIM = 2000   # good OCR resolution for a normal document page
                DEFAULT_DPI = 150
                MIN_DPI = 100
                MAX_DPI = 150

                page_w_pts, page_h_pts = None, None
                size_str = info.get("Page size", "")
                try:
                    # pdfinfo format e.g. "3580 x 4613 pts" or "612 x 792 pts (letter)"
                    parts = size_str.replace("pts", "").split("x")
                    page_w_pts = float(parts[0].strip())
                    page_h_pts = float(parts[1].split("(")[0].strip())
                except Exception:
                    pass

                if page_w_pts and page_h_pts:
                    page_w_in = page_w_pts / 72.0
                    page_h_in = page_h_pts / 72.0
                    computed_dpi = TARGET_MAX_DIM / max(page_w_in, page_h_in)
                    target_dpi = max(MIN_DPI, min(MAX_DPI, computed_dpi))
                    debug_print(f"[OCR] Page size: {page_w_in:.1f}x{page_h_in:.1f}in — using {target_dpi:.0f} DPI (targeting ~{TARGET_MAX_DIM}px)")
                else:
                    target_dpi = DEFAULT_DPI
                    debug_print(f"[OCR] Could not parse page size ('{size_str}') — using default {target_dpi} DPI")
                # =========================================================================

                images = []
                for page_num in range(1, num_pages + 1):
                    try:
                        page_imgs = convert_from_path(
                            file_path, dpi=target_dpi, thread_count=1,
                            first_page=page_num, last_page=page_num
                        )
                    except Exception as dpi_exc:
                        debug_print(f"[OCR] Page {page_num} at {target_dpi:.0f} DPI failed ({dpi_exc}), retrying at {MIN_DPI} DPI...")
                        page_imgs = convert_from_path(
                            file_path, dpi=MIN_DPI, thread_count=1,
                            first_page=page_num, last_page=page_num
                        )
                    images.extend(page_imgs)
                debug_print(f"[OCR] Converted {len(images)} pages")
                for idx, img in enumerate(images):
                    debug_print(f"[OCR] Page {idx+1} dimensions: {img.size[0]}x{img.size[1]} pixels")
            else:
                img = Image.open(file_path)
                images = [img]
                debug_print(f"[OCR] Loaded image: {img.size}")

            # Run pages with a small worker pool; preserve document order via
            # page_num key. Capped at 1 (serial) for now to minimize peak
            # memory on constrained hosts — raise once memory headroom is
            # confirmed safe (e.g. after moving OCR to its own worker
            # service with more RAM).
            max_workers = min(1, len(images))
            debug_print(f"[OCR] Processing {len(images)} pages (max {max_workers} workers)...")

            results = {}
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = {
                    executor.submit(_ocr_page, (i + 1, img)): i + 1
                    for i, img in enumerate(images)
                }
                total = len(futures)
                done = 0
                for future in as_completed(futures):
                    page_num, text = future.result()
                    results[page_num] = text
                    done += 1
                    debug_print(f"[OCR] Progress: {int(done / total * 100)}%")

            all_text = [results[k] for k in sorted(results) if results[k]]
            full_text = '\n\n'.join(all_text)

            # Free the raw page images now that OCR is done with all of them
            del images
            gc.collect()

            if full_text.strip():
                debug_print(f"[OCR] Total: {len(full_text)} chars from {len(results)} pages")
                return full_text

        except Exception as e:
            debug_print(f"[OCR] Error: {e}")
            import traceback
            traceback.print_exc()

        return None
        
    # ============================================================
    # SMART DETECTION: Check if PDF has text
    # ============================================================
    def pdf_has_text(self, pdf_path):
        """Quick check if PDF has extractable text (NO OCR)"""
        try:
            import PyPDF2
            with open(pdf_path, 'rb') as file:
                reader = PyPDF2.PdfReader(file)
                # Check first page only (fast)
                if reader.pages:
                    text = reader.pages[0].extract_text()
                    if text and len(text.strip()) > 50:
                        return True
            return False
        except:
            return True  # Assume it has text
    
    # ============================================================
    # MAIN EXTRACT METHOD
    # ============================================================
    def extract_text(self, file_path):
        """Main text extraction - Smart detection"""
        start_time = time.time()
        
        if not os.path.exists(file_path):
            raise Exception(f"File not found: {file_path}")
        
        debug_print(f"\n{'='*50}")
        debug_print(f"[START] Processing: {os.path.basename(file_path)}")
        debug_print(f"{'='*50}")
        
        # ========== STEP 1: Check if it's a PDF ==========
        is_pdf = file_path.lower().endswith('.pdf')
        text = None
        method = None
        
        if is_pdf:
            # ========== STEP 2: Try fast extraction ==========
            debug_print("[STEP 1] Trying fast PDF extraction...")
            fast_start = time.time()
            text, method = self.extract_from_pdf_fast(file_path)
            fast_time = time.time() - fast_start

            if text:
                # ─ Early-exit guard: only trust pdfplumber/PyPDF2 if the extracted
                # text contains enough printable words to be a real native PDF.
                # Scanned PDFs sometimes return a handful of garbled chars.
                printable_words = len([w for w in text.split() if w.isalpha()])
                if printable_words >= 50:
                    debug_print(f"[STEP 1] Fast extraction SUCCESS ({printable_words} words) in {fast_time:.2f}s — skipping OCR")
                    self.stats['pdf_extractions'] += 1
                else:
                    debug_print(f"[STEP 1] Fast text too sparse ({printable_words} words) — falling back to OCR")
                    text = None  # force OCR fallback

            if not text:
                debug_print(f"[STEP 1] Fast extraction FAILED (PDF likely scanned)")

                # ========== STEP 3: Use OCR for scanned PDF ==========
                debug_print("[STEP 2] Using OCR for scanned PDF...")
                ocr_start = time.time()
                text = self.extract_with_ocr_fast(file_path)
                ocr_time = time.time() - ocr_start
                
                if text:
                    method = 'ocr'
                    self.stats['ocr_extractions'] += 1
                    debug_print(f"[STEP 2] OCR SUCCESS in {ocr_time:.2f}s")
                else:
                    raise Exception("OCR failed to extract text")
        
        # ========== STEP 4: Image file - use OCR ==========
        else:
            debug_print("[STEP 2] Image file - using OCR...")
            ocr_start = time.time()
            text = self.extract_with_ocr_fast(file_path)  # ← This now handles images
            ocr_time = time.time() - ocr_start
            
            if text:
                method = 'ocr'
                self.stats['ocr_extractions'] += 1
                debug_print(f"[STEP 2] OCR SUCCESS in {ocr_time:.2f}s")
            else:
                raise Exception("Could not extract text from image")
        
        # ========== Clean and return ==========
        if not text or not text.strip():
            raise Exception("No text could be extracted")
        
        cleaned, structured = self._clean_text(text)
        total_time = time.time() - start_time
        
        self.stats['total_processed'] += 1
        self.stats['processing_times'].append(total_time)
        
        debug_print(f"\n{'='*50}")
        debug_print(f"[DONE] Completed in {total_time:.2f}s")
        debug_print(f"   Method: {method}")
        debug_print(f"   Words: {len(cleaned.split())}")
        debug_print(f"   Chars: {len(cleaned)}")
        debug_print(f"{'='*50}\n")
        
        return {
            'raw_text': text,
            'cleaned_text': cleaned,
            'structured_text': structured,
            'confidence_score': 0.99 if method != 'ocr' else 0.85,
            'word_count': len(cleaned.split()),
            'char_count': len(cleaned),
            'document_hash': hashlib.md5(text.encode()).hexdigest(),
            'processing_time': total_time,
            'method': method,
            'pages_processed': self.stats['pages_processed']
        }
    
    def _clean_text(self, text):
        """Clean text - remove problematic characters"""
        if not text:
            return "", ""
        
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        cleaned = ' '.join(lines)
        cleaned = re.sub(r'\s+', ' ', cleaned)
        
        # ============ NEW: structured version, keeps line breaks ============
        structured = '\n'.join(re.sub(r'[ \t]+', ' ', line) for line in lines)
        # ======================================================================


        # ============ FIX: Remove problematic Unicode characters ============
        # Replace bullet points and other problematic characters
        replacements = {
            '●': '-',      # Black circle bullet
            '•': '-',      # Bullet
            '▪': '-',      # Black square
            '■': '-',      # Black square
            '➢': '>',      # Right arrow
            '►': '>',      # Right arrow
            '▸': '>',      # Right arrow
            '→': '->',     # Right arrow
            '↔': '<->',    # Left-right arrow
            '✓': '[OK]',   # Check mark
            '✗': '[NO]',   # X mark
            '★': '*',      # Star
            '☆': '*',      # Star
            '◆': '-',      # Diamond
            '◇': '-',      # Diamond
            '☑': '[OK]',   # Check box
            '☐': '[]',     # Empty box
            '☒': '[NO]',   # X box
            '\u25cf': '-', # Unicode for ●
            '\u2022': '-', # Unicode for •
            '\u25a0': '-', # Unicode for ■
            '\u25b6': '>', # Unicode for ►
            # ============ FIX: Word/typography dash variants -> plain ASCII hyphen ============
            # These commonly come from Word documents / PDFs and were previously left
            # untouched, so a bullet like "– Engineering Drawings" (en-dash) survived
            # all the way through the pipeline even after the plain "-" was being
            # stripped everywhere else. Normalizing here means EVERY downstream
            # cleaning step (module2_nlp.py's leading-junk stripping, etc.) only has
            # to handle one dash character instead of several look-alikes.
            '\u2010': '-',  # hyphen
            '\u2011': '-',  # non-breaking hyphen
            '\u2013': '-',  # en dash (–)
            '\u2014': '-',  # em dash (—)
            '\u2015': '-',  # horizontal bar
            '\u2043': '-',  # hyphen bullet
            # =====================================================================================
        }
        
        for old, new in replacements.items():
            cleaned = cleaned.replace(old, new)
            structured = structured.replace(old, new)

        # ============ FIX: split words glued together by pdfplumber column extraction ============
        # e.g. "FlowRelevant" -> "Flow Relevant". A lowercase->uppercase boundary
        # almost never occurs mid-word in real English, so this is safe.
        cleaned = re.sub(r'([a-z])([A-Z])', r'\1 \2', cleaned)
        structured = re.sub(r'([a-z])([A-Z])', r'\1 \2', structured)
        # ============================================================================================

        # Also remove any remaining non-ASCII characters that might cause issues
        # This keeps only printable ASCII characters
        # cleaned = ''.join(char if ord(char) < 128 else '?' for char in cleaned)
        # =============================================================
    
        return cleaned, structured
    
    def process_document(self, file_path, document_id, employee_id, doc_type):
        """Process document"""
        ocr_result = self.extract_text(file_path)

         # ============ FIX: Clean the text again ============
        raw_text = ocr_result['raw_text']
        cleaned_text = ocr_result['cleaned_text']
        structured_text = ocr_result.get('structured_text', cleaned_text)  # ← NEW
        
        # Remove bullet points (including dash variants normalized above)
        for char in ['●', '•', '▪', '■', '➢', '►', '▸', '→', '↔',
                     '\u2010', '\u2011', '\u2012', '\u2013', '\u2014', '\u2015', '\u2043']:
            raw_text = raw_text.replace(char, '-')
            cleaned_text = cleaned_text.replace(char, '-')
            structured_text = structured_text.replace(char, '-')  # ← NEW
        
        ocr_result['raw_text'] = raw_text
        ocr_result['cleaned_text'] = cleaned_text
        ocr_result['structured_text'] = structured_text  # ← NEW
        # ===================================================
        
        db_record = {
            'document_id': document_id,
            'employee_id': employee_id,
            'document_type': doc_type,
            'raw_ocr_text': ocr_result['raw_text'],
            'cleaned_ocr_text': ocr_result['cleaned_text'],
            'structured_ocr_text': ocr_result.get('structured_text', ocr_result['cleaned_text']),  # ← NEW
            'ocr_confidence': ocr_result['confidence_score'],
            'word_count': ocr_result['word_count'],
            'char_count': ocr_result['char_count'],
            'document_hash': ocr_result['document_hash'],
            'uploaded_at': datetime.now().isoformat(),
            'file_path': file_path,
            'processing_time_seconds': ocr_result['processing_time_seconds'] if 'processing_time_seconds' in ocr_result else ocr_result['processing_time'],
            'extraction_method': ocr_result.get('method', 'unknown')
        }
        
        return {
            'success': True,
            'ocr_data': db_record,
            'stats': self.stats
        }
    
    def get_stats(self):
        avg_time = sum(self.stats['processing_times']) / len(self.stats['processing_times']) if self.stats['processing_times'] else 0
        return {
            'total_processed': self.stats['total_processed'],
            'avg_processing_time': avg_time,
            'pdf_extractions': self.stats['pdf_extractions'],
            'ocr_extractions': self.stats['ocr_extractions']
        }