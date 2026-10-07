"""
RMRS Python service (OCR + NLP + ML) - deployed on Railway.

Called ONLY by the Node backend (Render), server-to-server:
  - Files arrive as multipart uploads (Render and Railway do not share a disk).
  - Every route except /health requires the X-API-Key header to match PYTHON_API_KEY.
  - Served by gunicorn in production (see Dockerfile.python); `python scripts/daemon.py`
    still works for local development on http://127.0.0.1:5001.
"""
import hmac
import os
import shutil
import sys
import tempfile
import threading
from pathlib import Path

from flask import Flask, jsonify, request
from werkzeug.utils import secure_filename

# Add parent directory (python/) to sys.path
sys.path.append(str(Path(__file__).parent.parent))

from scripts.runner import Runner

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024  # 25 MB upload cap

API_KEY = os.environ.get("PYTHON_API_KEY", "")
if not API_KEY:
    print("[DAEMON] WARNING: PYTHON_API_KEY is not set - service is UNPROTECTED. "
          "Fine for local dev, never for a public deployment.", file=sys.stderr)

_runner = None
_runner_lock = threading.Lock()   # guards lazy creation of the Runner
_work_lock = threading.Lock()     # OCR/NLP share state and are CPU/RAM heavy: one job at a time


def get_runner():
    global _runner
    with _runner_lock:
        if _runner is None:
            print("[DAEMON] Initializing Runner...", file=sys.stderr)
            _runner = Runner()
        return _runner


@app.before_request
def require_api_key():
    if request.path == "/health" or not API_KEY:
        return None
    supplied = request.headers.get("X-API-Key", "")
    if not hmac.compare_digest(supplied, API_KEY):
        return jsonify({"success": False, "error": "Unauthorized"}), 401
    return None


@app.route("/health", methods=["GET"])
def health():
    # Must stay cheap: Railway polls this during deploys.
    return jsonify({"status": "ok", "warmed": _runner is not None})


@app.route("/warmup", methods=["POST", "GET"])
def warmup():
    get_runner()
    return jsonify({"status": "ready", "warmed": True})


@app.route("/process-document", methods=["POST"])
def process_document():
    upload = request.files.get("file")
    if upload is None or not upload.filename:
        return jsonify({"success": False, "error": "Missing file"}), 400

    employee_id = request.form.get("employee_id")
    doc_type = request.form.get("doc_type")

    # Keep the original filename (OCR logs use it) inside a private temp dir.
    tmp_dir = tempfile.mkdtemp(prefix="rmrs_")
    try:
        safe_name = secure_filename(upload.filename) or "upload"
        tmp_path = os.path.join(tmp_dir, safe_name)
        upload.save(tmp_path)

        runner = get_runner()
        with _work_lock:
            result = runner.process_document(tmp_path, employee_id, doc_type)
        return jsonify(result)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@app.route("/retrain-if-needed", methods=["POST"])
def retrain_if_needed():
    data = request.get_json(force=True, silent=True) or {}
    threshold = int(data.get("threshold", 20))
    runner = get_runner()
    with _work_lock:
        return jsonify(runner.retrain_if_needed(threshold))


@app.route("/cleanup-learned-skills", methods=["POST"])
def cleanup_learned_skills():
    runner = get_runner()
    with _work_lock:
        return jsonify(runner.cleanup_learned_skills())


@app.route("/get-stats", methods=["GET"])
def get_stats():
    runner = get_runner()
    return jsonify(runner.get_ml_status())


if __name__ == "__main__":
    # Local development only. Production uses gunicorn (Dockerfile.python).
    port = int(os.environ.get("PYTHON_DAEMON_PORT", 5001))
    get_runner()
    print(f"[DAEMON] Local dev server on 127.0.0.1:{port}", file=sys.stderr)
    app.run(host="127.0.0.1", port=port, debug=False, threaded=True)
