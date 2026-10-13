const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

class PythonService {
    constructor() {
        const rootPath = path.join(__dirname, '../..');
        this.pythonPath = process.platform === 'win32'
            ? path.join(rootPath, 'python', 'venv', 'Scripts', 'python.exe')
            : path.join(rootPath, 'python', 'venv', 'bin', 'python');
        this.scriptPath = path.join(rootPath, 'python', 'scripts');

        this.daemonUrl = process.env.PYTHON_DAEMON_URL || 'http://127.0.0.1:5001';
        
        console.log('🐍 Python Service Initialized');
        console.log(`Python Path: ${this.pythonPath}`);
        console.log(`Script Path: ${this.scriptPath}`);
        console.log(`Daemon URL: ${this.daemonUrl}`);
    }

    // Auth header for the remote Python service (Railway). Must match PYTHON_API_KEY there.
    _headers(extra = {}) {
        const h = { ...extra };
        if (process.env.PYTHON_API_KEY) h['X-API-Key'] = process.env.PYTHON_API_KEY;
        return h;
    }

    // true on a dev machine with python/venv; false on Render (Node-only image)
    _hasLocalPython() {
        return fs.existsSync(this.pythonPath);
    }

    async processDocument(fileBuffer, filename, employeeId, docType) {
        console.log('🐍 Starting Python document processing...');

        // The file is sent to the Python service as multipart. Render and Railway
        // do not share a disk, so a local file path would be meaningless there.
        try {
            const controller = new AbortController();
            // OCR can legitimately take minutes on scanned multi-page PDFs.
            const timeoutId = setTimeout(() => controller.abort(), 600000);
            const form = new FormData();
            form.append('file', new Blob([fileBuffer]), filename);
            form.append('employee_id', String(employeeId));
            form.append('doc_type', String(docType || ''));

            const res = await fetch(`${this.daemonUrl}/process-document`, {
                method: 'POST',
                headers: this._headers(), // do NOT set Content-Type: fetch adds the multipart boundary
                body: form,
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                console.log('⚡ Processed via Python service!');
                console.log(`📊 Skills found: ${data?.nlp?.skills?.length || 0}`);
                return data;
            }
            const body = await res.text().catch(() => '');
            console.log(`⚠️ Python service responded ${res.status}: ${body.slice(0, 200)}`);
            if (!this._hasLocalPython()) {
                throw new Error(`Python service error ${res.status}`);
            }
        } catch (err) {
            // In production there is no local venv, so surface the error instead of a doomed spawn.
            if (!this._hasLocalPython()) throw err;
            console.log(`⚠️ Python service unavailable (${err.message}), falling back to local spawn`);
        }

        // Local-dev fallback only (python/venv exists, no service running).
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rmrs_'));
        const tempPath = path.join(tmpDir, path.basename(filename));
        fs.writeFileSync(tempPath, fileBuffer);
        try {
            return await this._spawnProcessDocument(tempPath, employeeId, docType);
        } finally {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
        }
    }

    async getStats() {
        const res = await fetch(`${this.daemonUrl}/get-stats`, { headers: this._headers() });
        if (!res.ok) throw new Error(`Python service error ${res.status}`);
        return res.json();
    }

    // Original cold-start path — kept as the fallback for local dev (no
    // daemon running) and for the rare case the daemon itself is down.
    async _spawnProcessDocument(imagePath, employeeId, docType) {
        return new Promise((resolve, reject) => {
            const args = [
                '-u',
                path.join(this.scriptPath, 'runner.py'),
                'process_document',
                imagePath,
                employeeId,
                docType
            ];
            
            console.log('🔧 Python args:', args.join(' '));
            
            const pythonProcess = spawn(this.pythonPath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    PYTHONUNBUFFERED: '1'
                }
            });
            
            let stdoutData = '';
            let stderrData = '';
            let resolved = false;
            
            // --- Handle stdout (JSON result & progress) ---
            pythonProcess.stdout.on('data', (data) => {
                const chunk = data.toString();
                stdoutData += chunk;
                // Stream non-JSON progress lines live to console
                if (chunk.startsWith('[') || chunk.includes('\n[')) {
                    process.stdout.write(chunk);
                }
            });
            
            // --- Handle stderr (live logs: OCR progress, NLP, aliases) ---
            pythonProcess.stderr.on('data', (data) => {
                const chunk = data.toString();
                stderrData += chunk;
                process.stderr.write(chunk);
            });
            
            // --- Process exit ---
            pythonProcess.on('close', (code) => {
                console.log(`✅ Python process exited with code ${code}`);
                
                // Log any stderr data
                if (stderrData) {
                    console.log(`📋 Python stderr:\n${stderrData}`);
                }
                
                // Log full stdout for debugging
                if (stdoutData) {
                    console.log(`📋 Python stdout:\n${stdoutData.substring(0, 500)}${stdoutData.length > 500 ? '...' : ''}`);
                }
                
                if (code !== 0) {
                    reject(new Error(`Python exited with code ${code}: ${stderrData || 'No stderr output'}`));
                    return;
                }
                
                // Try to parse JSON
                try {
                    const clean = stdoutData.trim();
                    
                    // Filter out debug lines (lines starting with [ or containing [XXX])
                    const lines = clean.split('\n');
                    const jsonLines = lines.filter(line => {
                        const trimmed = line.trim();
                        // Skip debug lines that start with [ like [NLP], [ML], [RUNNER], etc.
                        return !trimmed.match(/^\[.*\]/);
                    });
                    const filtered = jsonLines.join('').trim();
                    
                    const jsonStart = filtered.indexOf('{');
                    const jsonEnd = filtered.lastIndexOf('}');
                    
                    if (jsonStart !== -1 && jsonEnd !== -1) {
                        const jsonStr = filtered.substring(jsonStart, jsonEnd + 1);
                        const parsed = JSON.parse(jsonStr);
                        console.log('✅ JSON parsed successfully!');
                        console.log(`📊 Skills found: ${parsed?.nlp?.skills?.length || 0}`);
                        resolve(parsed);
                    } else {
                        console.error('❌ No JSON found in output');
                        console.error(`📄 Raw output: ${clean.substring(0, 300)}`);
                        reject(new Error('No JSON found in Python output'));
                    }
                } catch (e) {
                    console.error('❌ JSON parse error:', e.message);
                    console.error(`📄 Raw output: ${stdoutData.substring(0, 300)}`);
                    reject(new Error(`Failed to parse JSON: ${e.message}`));
                }
            });
            
            // --- Error ---
            pythonProcess.on('error', (err) => {
                console.error('❌ Spawn error:', err);
                reject(err);
            });
            
            // --- Timeout (10 minutes) ---
            // ============ FIX: was 5 minutes (300000ms) — too tight for
            // scanned multi-page PDFs going through OCR one page at a time
            // with max_workers=1 (serial), especially on a memory-constrained
            // instance where "hard" pages fall through to the slower
            // enhanced OCR pass. Raised to 10 minutes to give real documents
            // enough headroom to finish instead of being killed mid-OCR. ============
            const timeout = setTimeout(() => {
                if (!resolved) {
                    console.error('❌ Python process timed out');
                    pythonProcess.kill();
                    reject(new Error('Python process timed out after 10 minutes'));
                }
            }, 600000);
            // ====================================================
            
            // Clear timeout on resolve/reject
            const originalResolve = resolve;
            const originalReject = reject;
            resolve = (...args) => { clearTimeout(timeout); resolved = true; originalResolve(...args); };
            reject = (...args) => { clearTimeout(timeout); resolved = true; originalReject(...args); };
        });
    }


    async retrainIfNeeded(threshold = 20) {
        console.log(`🎯 Checking whether ML needs retraining (threshold=${threshold})...`);

        // ⚡ Try warm Python daemon first
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000);
            const res = await fetch(`${this.daemonUrl}/retrain-if-needed`, {
                method: 'POST',
                headers: this._headers({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ threshold }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (res.ok) {
                const data = await res.json();
                console.log('⚡ Retrain checked via warm Python daemon!');
                return data;
            }
        } catch (daemonErr) {
            if (!this._hasLocalPython()) throw daemonErr;
            // else: fall back to local spawn (dev)
        }

        return new Promise((resolve, reject) => {
            const args = [
                '-u',
                path.join(this.scriptPath, 'runner.py'),
                'retrain_if_needed',
                String(threshold)
            ];

            const pythonProcess = spawn(this.pythonPath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, PYTHONUNBUFFERED: '1' }
            });

            let stdoutData = '';
            let stderrData = '';

            pythonProcess.stdout.on('data', (data) => {
                stdoutData += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                stderrData += data.toString();
                console.log(`🐍 ${data.toString().trim()}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(stderrData || `retrain_if_needed exited with code ${code}`));
                    return;
                }
                try {
                    const result = JSON.parse(stdoutData);
                    resolve(result);
                } catch (e) {
                    resolve({ success: false, retrained: false, reason: 'parse_error' });
                }
            });

            pythonProcess.on('error', (err) => {
                reject(err);
            });
        });
    }

    async cleanupLearnedSkills() {
        console.log('🧹 Cleaning up learned skills...');

        try {
            const res = await fetch(`${this.daemonUrl}/cleanup-learned-skills`, {
                method: 'POST',
                headers: this._headers()
            });
            if (res.ok) return await res.json();
            if (!this._hasLocalPython()) throw new Error(`Python service error ${res.status}`);
        } catch (daemonErr) {
            if (!this._hasLocalPython()) throw daemonErr;
            // else: fall back to local spawn (dev)
        }

        return new Promise((resolve, reject) => {
            const args = [
                '-u',
                path.join(this.scriptPath, 'runner.py'),
                'cleanup_learned_skills'
            ];
            
            const pythonProcess = spawn(this.pythonPath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, PYTHONUNBUFFERED: '1' }
            });
            
            let stdoutData = '';
            let stderrData = '';
            
            pythonProcess.stdout.on('data', (data) => {
                stdoutData += data.toString();
            });
            
            pythonProcess.stderr.on('data', (data) => {
                stderrData += data.toString();
                console.log(`🐍 ${data.toString().trim()}`);
            });
            
            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(stderrData));
                } else {
                    try {
                        const result = JSON.parse(stdoutData);
                        resolve(result);
                    } catch (e) {
                        resolve({ success: true });
                    }
                }
            });
            
            pythonProcess.on('error', (err) => {
                reject(err);
            });
        });
    }
}



module.exports = new PythonService();