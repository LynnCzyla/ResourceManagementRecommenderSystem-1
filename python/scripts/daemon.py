"""
Warm Python Microservice Daemon for RMRS
Keeps spaCy, scikit-learn models, and Supabase client pre-warmed in memory.
Runs on http://127.0.0.1:5001.
"""
import sys
import os
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS

# Add parent directory to sys.path
sys.path.append(str(Path(__file__).parent.parent))

from scripts.runner import Runner

app = Flask(__name__)
CORS(app)

print("[DAEMON] Initializing pre-warmed Runner instance...", file=sys.stderr)
runner_instance = None

def get_runner():
    global runner_instance
    if runner_instance is None:
        runner_instance = Runner()
    return runner_instance

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "warmed": runner_instance is not None
    })

@app.route('/warmup', methods=['POST', 'GET'])
def warmup():
    get_runner()
    return jsonify({
        "status": "ready",
        "warmed": True
    })

@app.route('/process-document', methods=['POST'])
def process_document():
    data = request.get_json(force=True) or {}
    image_path = data.get('image_path')
    employee_id = data.get('employee_id')
    doc_type = data.get('doc_type')
    
    if not image_path:
        return jsonify({"success": False, "error": "Missing image_path"}), 400
        
    runner = get_runner()
    result = runner.process_document(image_path, employee_id, doc_type)
    return jsonify(result)

@app.route('/retrain-if-needed', methods=['POST'])
def retrain_if_needed():
    data = request.get_json(force=True) or {}
    threshold = int(data.get('threshold', 20))
    runner = get_runner()
    result = runner.retrain_if_needed(threshold)
    return jsonify(result)

@app.route('/get-stats', methods=['GET'])
def get_stats():
    runner = get_runner()
    result = runner.get_stats()
    return jsonify(result)

if __name__ == '__main__':
    port = int(os.environ.get('PYTHON_DAEMON_PORT', 5001))
    print(f"[DAEMON] Pre-warming models...", file=sys.stderr)
    get_runner()
    print(f"[DAEMON] Starting warm daemon on port {port}...", file=sys.stderr)
    app.run(host='127.0.0.1', port=port, debug=False, threaded=True)
