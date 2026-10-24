const fs = require('node:fs');

function createLogger(file, { maxBytes = 1024 * 1024, secrets = () => [] } = {}) {
  return (...args) => {
    try {
      let message = args.map(String).join(' ').slice(0, 8192);
      for (const secret of secrets()) {
        if (secret) message = message.split(secret).join('[CHAVE REMOVIDA]');
      }
      const line = `[${new Date().toISOString()}] ${message}\n`;
      const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
      if (size + Buffer.byteLength(line) > maxBytes) {
        fs.rmSync(`${file}.1`, { force: true });
        if (fs.existsSync(file)) fs.renameSync(file, `${file}.1`);
      }
      fs.appendFileSync(file, line);
    } catch { /* O log nunca deve interromper o app. */ }
  };
}

module.exports = { createLogger };
