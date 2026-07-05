"""
Module 1: Smart Text Extraction - Fast PDF + OCR Fallback
"""
import os
import hashlib
import sys
from datetime import datetime
import re
import time

# Redirect prints to stderr
def debug_print(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

# ============== PDF Libraries ==============
try:
    import pdfplumber
    PDFPLUMBER_SUPPORT = True
    debug_print("[OK] pdfplumber loaded")
except ImportError:
    PDFPLUMBER_SUPPORT = False
    debug_print("[WARN] pdfplumber NOT installed")

try:
    import PyPDF2
    PDF_SUPPORT = True
    debug_print("[OK] PyPDF2 loaded")
except ImportError:
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
    OCR_SUPPORT = False
    debug_print("[WARN] OCR libraries NOT installed")

try:
    from pdf2image import convert_from_path
    PDF2IMAGE_SUPPORT = True
    debug_print("[OK] pdf2image loaded")
except ImportError:
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
        """Fast OCR - For scanned PDFs AND images"""
        
        if not OCR_SUPPORT or not PDF2IMAGE_SUPPORT:
            debug_print("[OCR] OCR not available")
            return None
        
        debug_print("[OCR] Starting OCR...")
        
        try:
            is_pdf = file_path.lower().endswith('.pdf')
            all_text = []
            images = []
            
            if is_pdf:
                # ========== Convert PDF to images ==========
                debug_print("[OCR] Converting PDF to images...")
                images = convert_from_path(file_path, dpi=150, thread_count=4)
                debug_print(f"[OCR] Converted {len(images)} pages from PDF")
            else:
                # ========== Load image directly ==========
                debug_print("[OCR] Loading image file...")
                from PIL import Image
                img = Image.open(file_path)
                images = [img]  # Single image
                debug_print(f"[OCR] Loaded image: {img.size}")
            
            debug_print(f"[OCR] Processing {len(images)} pages...")
            
            for i, image in enumerate(images):
                page_num = i + 1
                debug_print(f"[OCR] Processing page {page_num}/{len(images)}...")
                
                # Convert PIL to OpenCV
                import cv2
                import numpy as np
                img = np.array(image)
                img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
                
                # Preprocess for better OCR
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                
                # OCR
                from PIL import Image
                pil_img = Image.fromarray(binary)
                text = pytesseract.image_to_string(pil_img, config='--oem 3 --psm 6')
                
                if text and text.strip():
                    all_text.append(text)
                    debug_print(f"[OCR] Page {page_num}: {len(text)} chars")
                else:
                    debug_print(f"[OCR] Page {page_num}: No text found")
                
                # Update progress
                progress = int((page_num / len(images)) * 100)
                debug_print(f"[OCR] Progress: {progress}%")
            
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
                debug_print(f"[STEP 1] Fast extraction SUCCESS in {fast_time:.2f}s")
                self.stats['pdf_extractions'] += 1
            else:
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
        
        cleaned = self._clean_text(text)
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
            return ""
        
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        cleaned = ' '.join(lines)
        cleaned = re.sub(r'\s+', ' ', cleaned)
        
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
            '\u2012': '-',  # figure dash
            '\u2013': '-',  # en dash (–)
            '\u2014': '-',  # em dash (—)
            '\u2015': '-',  # horizontal bar
            '\u2043': '-',  # hyphen bullet
            # =====================================================================================
        }
        
        for old, new in replacements.items():
            cleaned = cleaned.replace(old, new)
        
        # Also remove any remaining non-ASCII characters that might cause issues
        # This keeps only printable ASCII characters
        # cleaned = ''.join(char if ord(char) < 128 else '?' for char in cleaned)
        # =============================================================
    
        return cleaned
    
    def process_document(self, file_path, document_id, employee_id, doc_type):
        """Process document"""
        ocr_result = self.extract_text(file_path)

         # ============ FIX: Clean the text again ============
        raw_text = ocr_result['raw_text']
        cleaned_text = ocr_result['cleaned_text']
        
        # Remove bullet points (including dash variants normalized above)
        for char in ['●', '•', '▪', '■', '➢', '►', '▸', '→', '↔',
                     '\u2010', '\u2011', '\u2012', '\u2013', '\u2014', '\u2015', '\u2043']:
            raw_text = raw_text.replace(char, '-')
            cleaned_text = cleaned_text.replace(char, '-')
        
        ocr_result['raw_text'] = raw_text
        ocr_result['cleaned_text'] = cleaned_text
        # ===================================================
        
        db_record = {
            'document_id': document_id,
            'employee_id': employee_id,
            'document_type': doc_type,
            'raw_ocr_text': ocr_result['raw_text'],
            'cleaned_ocr_text': ocr_result['cleaned_text'],
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