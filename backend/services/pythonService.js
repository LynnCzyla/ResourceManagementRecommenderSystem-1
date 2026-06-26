const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class PythonService {
    constructor() {
        const rootPath = path.join(__dirname, '../..');
        this.pythonPath = process.platform === 'win32'
            ? path.join(rootPath, 'python', 'venv', 'Scripts', 'python.exe')
            : path.join(rootPath, 'python', 'venv', 'bin', 'python');
        this.scriptPath = path.join(rootPath, 'python', 'scripts');
        
        console.log('🐍 Python Service Initialized (using spawn)');
        console.log(`Python Path: ${this.pythonPath}`);
        console.log(`Script Path: ${this.scriptPath}`);
    }

    async processDocument(imagePath, employeeId, docType) {
        console.log('🐍 Starting Python process...');
        
        return new Promise((resolve, reject) => {
            // Use spawn with -u flag for unbuffered output
            const args = [
                '-u',  // Force unbuffered stdout
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
                    PYTHONUNBUFFERED: '1'  // Force Python to be unbuffered
                }
            });
            
            let stdoutData = '';
            let stderrData = '';
            let resolved = false;
            
            // --- Handle stdout (JSON result) ---
            pythonProcess.stdout.on('data', (data) => {
                const chunk = data.toString();
                stdoutData += chunk;
                console.log(`📊 Received ${chunk.length} bytes`);
                
                // Try to parse JSON as soon as we have complete data
                try {
                    const jsonStart = stdoutData.indexOf('{');
                    const jsonEnd = stdoutData.lastIndexOf('}');
                    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                        const jsonStr = stdoutData.substring(jsonStart, jsonEnd + 1);
                        const parsed = JSON.parse(jsonStr);
                        if (!resolved) {
                            resolved = true;
                            console.log('✅ JSON parsed successfully!');
                            console.log(`📊 Skills found: ${parsed?.nlp?.skills?.length || 0}`);
                            resolve(parsed);
                        }
                    }
                } catch (e) {
                    // Not complete JSON yet, keep collecting
                }
            });
            
            // --- Handle stderr (debug logs) ---
            pythonProcess.stderr.on('data', (data) => {
                const chunk = data.toString();
                stderrData += chunk;
                if (stderrData.split('\n').length < 20) {
                    console.log(`🐍 Python: ${chunk.trim()}`);
                }
            });
            
            // --- Process exit ---
            pythonProcess.on('close', (code) => {
                console.log(`✅ Python process exited with code ${code}`);
                
                if (resolved) return;
                
                if (code !== 0) {
                    console.error('❌ Python error output:', stderrData);
                    reject(new Error(`Python exited with code ${code}: ${stderrData}`));
                    return;
                }
                
                // Final attempt to parse
                try {
                    const clean = stdoutData.trim();
                    const jsonStart = clean.indexOf('{');
                    const jsonEnd = clean.lastIndexOf('}');
                    if (jsonStart !== -1 && jsonEnd !== -1) {
                        const jsonStr = clean.substring(jsonStart, jsonEnd + 1);
                        const parsed = JSON.parse(jsonStr);
                        console.log('✅ JSON parsed from final output');
                        resolve(parsed);
                    } else {
                        reject(new Error('No JSON found in output'));
                    }
                } catch (e) {
                    console.error('❌ Final parse error:', e);
                    reject(e);
                }
            });
            
            // --- Error ---
            pythonProcess.on('error', (err) => {
                console.error('❌ Spawn error:', err);
                reject(err);
            });
            
            // --- Timeout (5 minutes) ---
            const timeout = setTimeout(() => {
                if (!resolved) {
                    console.error('❌ Python process timed out');
                    pythonProcess.kill();
                    reject(new Error('Python process timed out after 5 minutes'));
                }
            }, 300000);
            
            // Clear timeout on resolve/reject
            const originalResolve = resolve;
            const originalReject = reject;
            resolve = (...args) => { clearTimeout(timeout); originalResolve(...args); };
            reject = (...args) => { clearTimeout(timeout); originalReject(...args); };
        });
    }
}

module.exports = new PythonService();