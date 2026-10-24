const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
if (process.platform !== 'win32') throw new Error('O atalho requer Windows.');
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gemi-shortcut-'));
const script = path.join(temp, 'shortcut.vbs');
const vbs = [
  'Set sh = CreateObject("WScript.Shell")',
  'Set link = sh.CreateShortcut(sh.SpecialFolders("Desktop") & "\\Gemi Pets.lnk")',
  'link.TargetPath = "wscript.exe"',
  'link.Arguments = ' + quote('"' + path.join(__dirname, 'Iniciar Gemi.vbs') + '"'),
  'link.WorkingDirectory = ' + quote(__dirname),
  'link.IconLocation = ' + quote(path.join(__dirname, 'assets/icon.ico')),
  'link.Description = "Gemi Pets"', 'link.Save',
].join('\r\n');
try {
  fs.writeFileSync(script, vbs);
  execFileSync(path.join(process.env.SystemRoot || 'C:/Windows', 'System32/cscript.exe'), ['//nologo', script], { windowsHide: true, stdio: 'inherit' });
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
