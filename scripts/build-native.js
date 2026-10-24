const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function buildNative({ watcherOnly = false } = {}) {
  if (process.platform !== 'win32') throw new Error('A compilação nativa requer Windows e .NET Framework.');
  const systemRoot = process.env.SystemRoot || 'C:/Windows';
  const candidates = [process.env.CSC_PATH, path.join(systemRoot, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'), path.join(systemRoot, 'Microsoft.NET/Framework/v4.0.30319/csc.exe')].filter(Boolean);
  const compiler = candidates.find((file) => fs.existsSync(file));
  if (!compiler) throw new Error('Compilador C# não encontrado. Instale .NET Framework ou defina CSC_PATH.');
  execFileSync(compiler, ['/nologo', '/optimize+', '/target:exe', '/reference:System.Windows.Forms.dll', '/out:' + path.join(root, 'watcher/window-watcher.exe'), path.join(root, 'watcher/WindowWatcher.cs')], { cwd: root, windowsHide: true, stdio: 'inherit' });
  if (!watcherOnly) {
    const generated = path.join(root, 'build/native');
    fs.mkdirSync(generated, { recursive: true });
    const iconTool = path.join(generated, 'make-icon.exe');
    execFileSync(compiler, ['/nologo', '/optimize+', '/target:exe', '/reference:System.Drawing.dll', '/out:' + iconTool, path.join(root, 'make-icon.cs')], { cwd: root, windowsHide: true, stdio: 'inherit' });
    execFileSync(iconTool, [path.join(root, 'assets')], { cwd: root, windowsHide: true, stdio: 'inherit' });
  }
}
if (require.main === module) buildNative({ watcherOnly: process.argv.includes('--watcher-only') });
module.exports = { buildNative };
