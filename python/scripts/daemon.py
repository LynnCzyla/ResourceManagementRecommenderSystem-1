"""
RMRS Python service (OCR + NLP + ML) - deployed on Railway.

Thin HTTP wrapper around runner.py's CLI - the same code path Node used when it
spawned Python directly on Render. Each job runs in its OWN short-lived process,
so spaCy/OpenCV memory is returned to the OS afterwards. Idle memory stays tiny
(just gunicorn + Flask), which is what lets this fit in a 1 GB container.

  - Files arrive as multipart uploads (Render and Railway share no disk).
  - Every route except /health requires the X-API-Key header == PYTHON_API_KEY.
  - One job at a time (lock) so two uploads can never stack up memory.
"""
import hmac
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

from flask import Flask, jsonify, request
from werkzeug.utils import secure_filename

RUNNER = str(Path(__file__).parent / "runner.py")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024  # 25 MB upload cap

API_KEY = os.environ.get("PYTHON_API_KEY", "")
if not API_KEY:
    print("[DAEMON] WARNING: PYTHON_API_KEY is not set - service is UNPROTECTED. "
          "Fine for local dev, never for a public deployment.", file=sys.stderr)

_work_lock = threading.Lock()


def run_cli(*args, timeout):
    """Run `python runner.py <args>` and return the JSON it prints on stdout.
    stderr is inherited, so OCR/NLP logs show up live in the Railway log."""
    with _work_lock:
        try:
            proc = subprocess.run(
                [sys.executable, "-u", RUNNER, *map(str, args)],
                stdout=subprocess.PIPE, text=True, timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            return {"success": False, "error": f"Timed out after {timeout}s"}

    out = (proc.stdout or "").strip()
    if proc.returncode != 0 and not out:
        return {"success": False, "error": f"runner exited with code {proc.returncode}"}
    try:
        return json.loads(out)
    except ValueError:
        s, e = out.find("{"), out.rfind("}")
        if s != -1 and e > s:
            try:
                return json.loads(out[s:e + 1])
            except ValueError:
                pass
    return {"success": False, "error": "Runner produced no valid JSON", "raw": out[:300]}


@app.before_request
def require_api_key():
    if request.path == "/health" or not API_KEY:
        return None
    if not hmac.compare_digest(request.headers.get("X-API-Key", ""), API_KEY):
        return jsonify({"success": False, "error": "Unauthorized"}), 401
    return None


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "warmed": False})


@app.route("/process-document", methods=["POST"])
def process_document():
    upload = request.files.get("file")
    if upload is None or not upload.filename:
        return jsonify({"success": False, "error": "Missing file"}), 400

    employee_id = request.form.get("employee_id", "")
    doc_type = request.form.get("doc_type", "")

    tmp_dir = tempfile.mkdtemp(prefix="rmrs_")
    try:
        tmp_path = os.path.join(tmp_dir, secure_filename(upload.filename) or "upload")
        upload.save(tmp_path)
        # runner.py itself enforces 900s (OCR) + 300s (NLP) per stage
        return jsonify(run_cli("process_document", tmp_path, employee_id, doc_type, timeout=1300))
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@app.route("/retrain-if-needed", methods=["POST"])
def retrain_if_needed():
    data = request.get_json(force=True, silent=True) or {}
    return jsonify(run_cli("retrain_if_needed", int(data.get("threshold", 20)), timeout=300))


@app.route("/cleanup-learned-skills", methods=["POST"])
def cleanup_learned_skills():
    return jsonify(run_cli("cleanup_learned_skills", timeout=300))


@app.route("/get-stats", methods=["GET"])
def get_stats():
    return jsonify(run_cli("ml_status", timeout=120))


if __name__ == "__main__":
    port = int(os.environ.get("PYTHON_DAEMON_PORT", 5001))
    print(f"[DAEMON] Local dev server on 127.0.0.1:{port}", file=sys.stderr)
    app.run(host="127.0.0.1", port=port, debug=False, threaded=True)