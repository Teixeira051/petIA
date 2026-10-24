const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function removeTemporaryProfile(profile) {
  const cleanupTarget = path.resolve(profile);
  if (path.dirname(cleanupTarget) !== path.resolve(os.tmpdir()) || !path.basename(cleanupTarget).startsWith('gemi-design-test-')) {
    throw new Error('O perfil temporário não está no diretório de limpeza esperado.');
  }
  fs.rmSync(cleanupTarget, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

async function main() {
  const outputDirectory = process.argv[2] ? path.resolve(process.argv[2]) : '';
  if (outputDirectory) fs.mkdirSync(outputDirectory, { recursive: true });
  const deadline = Date.now() + 90000;
  const env = { ...process.env };
  for (const key of ['ELECTRON_RUN_AS_NODE', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'CODEX_API_KEY']) delete env[key];
  for (const scale of [1, 1.5]) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gemi-design-test-'));
    try {
      await new Promise((resolve, reject) => {
        const args = [
          `--force-device-scale-factor=${scale}`, path.join(__dirname, '../test/electron-design.cjs'),
          '--design-profile', profile, '--design-scale', String(scale),
          ...(outputDirectory ? ['--design-output', outputDirectory] : []),
        ];
        const child = spawn(require('electron'), args, { env, windowsHide: true, stdio: 'inherit' });
        let settled = false;
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; child.kill(); }, Math.max(1, deadline - Date.now()));
        const finish = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error); else resolve();
        };
        child.on('error', finish);
        child.on('close', (code) => finish(timedOut ? new Error('O teste visual excedeu 90 segundos.') : code === 0 ? null : new Error(`O teste visual com DPI ${scale} saiu com código ${code}.`)));
      });
    } finally {
      removeTemporaryProfile(profile);
    }
  }
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
