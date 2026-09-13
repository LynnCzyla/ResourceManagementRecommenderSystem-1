"""
Module 1: Smart Text Extraction - Fast PDF + Parallel OCR Fallback
"""
import os
import sys
import time
import re
import hashlib
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
        """Parallel OCR — scanned PDFs and images.
        Pages are processed concurrently (up to 3 workers) instead of serially.
        """
        if not OCR_SUPPORT or not PDF2IMAGE_SUPPORT:
            debug_print("[OCR] OCR not available")
            return None

        debug_print("[OCR] Starting parallel OCR...")

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

        def _ocr_with_confidence(pil_img, page_num):
            """Run OCR and return (text, mean_word_confidence).
            Uses image_to_data instead of image_to_string so we get a
            per-word confidence score, AND so we can drop very-low-confidence
            tokens (Tesseract's way of saying "I'm basically guessing here"),
            which is what silently produced the 9000+-word garbage output on
            a noisy page before this fix — image_to_string just joins
            whatever Tesseract outputs, hallucinated tokens included.
            """
            data = pytesseract.image_to_data(
                pil_img, config='--oem 3 --psm 6',
                output_type=pytesseract.Output.DICT
            )
            words, confs = [], []
            for word, conf in zip(data['text'], data['conf']):
                word = word.strip()
                try:
                    conf = float(conf)
                except (ValueError, TypeError):
                    conf = -1
                if conf >= 0:
                    confs.append(conf)
                if word and conf >= 40:  # discard low-confidence hallucinated tokens
                    words.append(word)
            mean_conf = sum(confs) / len(confs) if confs else 0.0
            return ' '.join(words), mean_conf

        def _ocr_page(args):
            """Process a single page image and return (page_num, text)."""
            page_num, image = args
            try:
                if not OCR_SUPPORT or pytesseract is None:
                    return page_num, ''
                img_arr = np.array(image)
                img_bgr = cv2.cvtColor(img_arr, cv2.COLOR_RGB2BGR)
                gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

                # NEW: Normalize contrast/lighting BEFORE anything else. CLAHE
                # (adaptive histogram equalization) evens out brightness variance
                # across the page — uneven scanner lighting, phone-camera exposure
                # jitter — so deskew and thresholding downstream get a cleaner
                # signal to work with instead of fighting a washed-out or muddy scan.
                clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
                gray = clahe.apply(gray)

                # Straighten the page (corrects the skew/rotation typical of
                # scans and camera photos) before any other processing.
                gray = _deskew(gray)

                # Light denoise — smooths JPEG/scanner-sensor noise without
                # eroding thin character strokes the way a stronger filter would.
                gray = cv2.medianBlur(gray, 3)

                # NEW: Counter-sharpen — but ONLY if the page is actually blurry.
                # Sharpening a page that ISN'T blurry just amplifies whatever
                # noise/texture is already there (this is what blew up cv_09:
                # a noisy-but-not-blurry page got sharpened anyway, and the
                # amplified noise got read as thousands of fake "words").
                # Variance of the Laplacian is a standard blur metric — low
                # variance means few sharp edges, i.e. the page IS blurry.
                laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
                BLUR_THRESHOLD = 150  # empirical: below this, page reads as blurry
                if laplacian_var < BLUR_THRESHOLD:
                    blurred = cv2.GaussianBlur(gray, (0, 0), sigmaX=3)
                    gray = cv2.addWeighted(gray, 1.5, blurred, -0.5, 0)
                    debug_print(f"[OCR] Page {page_num}: laplacian_var={laplacian_var:.1f}, sharpened (page looked blurry)")
                else:
                    debug_print(f"[OCR] Page {page_num}: laplacian_var={laplacian_var:.1f}, skipped sharpening (page already sharp/noisy)")

                # Upscale small/blurry pages — Tesseract reads noticeably
                # better on higher-resolution input, especially for pages
                # rendered at low DPI or shot at a distance.
                h, w = gray.shape[:2]
                if max(h, w) < 1600:
                    scale = min(1.6, 3000 / max(h, w))
                    gray = cv2.resize(gray, (int(w * scale), int(h * scale)),
                                       interpolation=cv2.INTER_CUBIC)

                # Binarize. Otsu works well for evenly-lit pages, but on scans
                # with lighting gradients CLAHE only partially corrected, it can
                # collapse into a near-all-black or near-all-white result.
                _, otsu_binary = cv2.threshold(gray, 0, 255,
                                               cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                otsu_text, otsu_conf = _ocr_with_confidence(Image.fromarray(otsu_binary), page_num)

                fg_ratio = np.mean(otsu_binary < 128)
                if fg_ratio < 0.02 or fg_ratio > 0.6:
                    # FIXED: previously this branch switched to adaptive
                    # thresholding unconditionally whenever Otsu's foreground
                    # ratio looked off. On a noisy/hard page, adaptive
                    # thresholding turned background speckle into fake
                    # "text" blobs, and Tesseract hallucinated ~9000 garbage
                    # words from it (the cv_09 regression). Now we: (1) apply
                    # a morphological open to strip speckle noise before OCR,
                    # and (2) only USE the adaptive result if its mean
                    # confidence actually beats Otsu's — otherwise we keep
                    # the Otsu output, which is a safe fallback even if
                    # imperfect.
                    adaptive_binary = cv2.adaptiveThreshold(
                        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                        cv2.THRESH_BINARY, blockSize=31, C=15
                    )
                    kernel = np.ones((2, 2), np.uint8)
                    adaptive_binary = cv2.morphologyEx(adaptive_binary, cv2.MORPH_OPEN, kernel)
                    adaptive_text, adaptive_conf = _ocr_with_confidence(Image.fromarray(adaptive_binary), page_num)

                    if adaptive_conf > otsu_conf:
                        text = adaptive_text
                        debug_print(f"[OCR] Page {page_num}: fg_ratio={fg_ratio:.3f}, used adaptive threshold (conf {adaptive_conf:.1f} > otsu {otsu_conf:.1f})")
                    else:
                        text = otsu_text
                        debug_print(f"[OCR] Page {page_num}: fg_ratio={fg_ratio:.3f}, adaptive conf ({adaptive_conf:.1f}) didn't beat otsu ({otsu_conf:.1f}) — kept otsu")
                else:
                    text = otsu_text

                # NEW: Sanity guard — a resume page realistically has maybe
                # 100-400 words. If the pipeline above produced something
                # absurd (this is what happened on cv_09: 10,000+ words from
                # one page), the CLAHE/threshold combo malfunctioned on this
                # specific page's noise pattern. Rather than trust it, redo
                # OCR with the simplest possible pipeline (no CLAHE, no
                # sharpening — just deskew + Otsu) as a safe fallback.
                MAX_SANE_WORDS_PER_PAGE = 1000
                if len(text.split()) > MAX_SANE_WORDS_PER_PAGE:
                    debug_print(f"[OCR] Page {page_num}: {len(text.split())} words looks like a hallucination — retrying with minimal preprocessing")
                    safe_gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
                    safe_gray = _deskew(safe_gray)
                    _, safe_binary = cv2.threshold(safe_gray, 0, 255,
                                                   cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                    text = pytesseract.image_to_string(
                        Image.fromarray(safe_binary), config='--oem 3 --psm 6'
                    )
                    debug_print(f"[OCR] Page {page_num}: fallback produced {len(text.split())} words")

                debug_print(f"[OCR] Page {page_num}: {len(text)} chars")
                return page_num, text.strip() if text else ''
            except Exception as exc:
                debug_print(f"[OCR] Page {page_num} error: {exc}")
                return page_num, ''

        try:
            is_pdf = file_path.lower().endswith('.pdf')
            images = []

            if is_pdf:
                debug_print("[OCR] Converting PDF to images...")
                try:
                    images = convert_from_path(file_path, dpi=200, thread_count=4)
                except Exception as dpi_exc:
                    # Very large page canvases at 200 DPI can trip Pillow's
                    # decompression-bomb safety check. Fall back to the old
                    # default rather than failing the whole document.
                    debug_print(f"[OCR] 200 DPI conversion failed ({dpi_exc}), retrying at 150 DPI...")
                    images = convert_from_path(file_path, dpi=150, thread_count=4)
                debug_print(f"[OCR] Converted {len(images)} pages")
            else:
                img = Image.open(file_path)
                images = [img]
                debug_print(f"[OCR] Loaded image: {img.size}")

            debug_print(f"[OCR] Processing {len(images)} pages (parallel, max 3 workers)...")

            # Run pages concurrently; preserve document order via page_num key
            max_workers = min(3, len(images))
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

            if full_text.strip():
                debug_print(f"[OCR] Total: {len(full_text)} chars from {len(images)} pages")
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

                # ========== STEP 3: Use parallel OCR for scanned PDF ==========
                debug_print("[STEP 2] Using parallel OCR for scanned PDF...")
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