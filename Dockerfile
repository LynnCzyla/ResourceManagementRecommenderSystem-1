# ============================================================
# ResourceManagementRecommenderSystem — Backend + Python ML/OCR
# Single image: Node (Express API) + Python (OCR/NLP/ML service)
# ============================================================

FROM python:3.10-slim

# ---- System dependencies ----
# - tesseract-ocr: required by pytesseract (module1_ocr.py)
# - libgl1 / libglib2.0-0: required by opencv-python at runtime
# - poppler-utils: required by pdf2image
# - curl/gnupg: needed to install Node.js from NodeSource
# - build-essential: fallback in case any Python package needs to compile
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    libgl1 \
    libglib2.0-0 \
    poppler-utils \
    build-essential \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- Python ML/OCR environment ----
# Uses a cleaned requirements file (see requirements.clean.txt) because the
# original python/requirements.txt contains shell commands, not just
# package specs, and pip can't install from it directly.
COPY python/requirements.clean.txt ./python/requirements.clean.txt
RUN python -m venv python/venv \
    && python/venv/bin/pip install --no-cache-dir --upgrade pip \
    && python/venv/bin/pip install --no-cache-dir -r python/requirements.clean.txt \
    && python/venv/bin/pip install --no-cache-dir https://github.com/explosion/spacy-models/releases/download/en_core_web_md-3.7.1/en_core_web_md-3.7.1-py3-none-any.whl

# ---- Backend (Node/Express) dependencies ----
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# ---- Copy application source ----
COPY backend/ ./backend/
COPY python/ ./python/

# Ensure the uploads directory exists (multer writes here)
RUN mkdir -p backend/uploads

ENV NODE_ENV=production
EXPOSE 5000

CMD ["node", "backend/server.js"]
