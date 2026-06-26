import sys
import json
import time
from pathlib import Path

# Force unbuffered output
sys.stdout = sys.stdout.detach()
sys.stdout = open(sys.stdout.fileno(), 'w', buffering=1)

# Silence prints (they go to stderr)
import builtins
builtins.print = lambda *a, **k: None

sys.path.append(str(Path(__file__).parent.parent))

try:
    from modules.module1_ocr import OCRProcessor
    from modules.module2_nlp import NLPProcessor
    from modules.module3_integration import DocumentProcessor
except ImportError as e:
    sys.stdout.write(json.dumps({"success": False, "error": f"Import error: {str(e)}"}))
    sys.stdout.flush()
    sys.exit(1)

class Runner:
    def __init__(self):
        self.processor = DocumentProcessor()
    
    def process_document(self, image_path, employee_id, doc_type):
        try:
            start = time.time()
            result = self.processor.process_document_complete(image_path, employee_id, doc_type)
            if result and result.get('success') and result.get('ocr'):
                result['ocr']['processing_time'] = time.time() - start
            return result
        except Exception as e:
            return {'success': False, 'error': str(e)}

def main():
    if len(sys.argv) < 2:
        sys.stdout.write(json.dumps({"error": "No command"}))
        sys.stdout.flush()
        return
    
    runner = Runner()
    cmd = sys.argv[1]
    
    if cmd == "process_document" and len(sys.argv) >= 5:
        result = runner.process_document(sys.argv[2], sys.argv[3], sys.argv[4])
        sys.stdout.write(json.dumps(result))
        sys.stdout.flush()
    else:
        sys.stdout.write(json.dumps({"error": f"Unknown command: {cmd}"}))
        sys.stdout.flush()

if __name__ == "__main__":
    main()