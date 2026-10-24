const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gemi-renderer-test-'));
const env = { ...process.env };
for (const key of ['ELECTRON_RUN_AS_NODE', 'GEMINI_API_KEY', 'OPENAI_API_KEY']) delete env[key];
const child = spawn(require('electron'), [path.join(__dirname, '../test/electron-renderer.cjs'), directory], { env, windowsHide: true, stdio: 'inherit' });
const timer = setTimeout(() => { child.kill(); }, 45000);
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('close', (code) => {
  clearTimeout(timer);
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  process.exitCode = code ?? 1;
});
