const fs = require('node:fs');
const path = require('node:path');

const KEY_FIELDS = ['apiKey', 'openaiKey'];

function createConfigStore(file, safeStorage) {
  function save(config) {
    const stored = { ...config };
    for (const key of KEY_FIELDS) {
      delete stored[key];
      delete stored[`${key}Encrypted`];
      if (!config[key]) continue;
      if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') {
        throw new Error('O armazenamento seguro do sistema está indisponível. Nenhuma chave foi salva.');
      }
      stored[`${key}Encrypted`] = safeStorage.encryptString(config[key]).toString('base64');
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(stored, null, 2), { mode: 0o600 });
      fs.renameSync(temporary, file);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }

  function load() {
    let stored;
    try {
      stored = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw new Error('Não foi possível ler a configuração. O arquivo foi preservado.', { cause: error });
    }
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) throw new Error('Configuração inválida.');
    const config = { ...stored };
    for (const key of KEY_FIELDS) {
      if (stored[`${key}Encrypted`]) {
        try {
          config[key] = safeStorage.decryptString(Buffer.from(stored[`${key}Encrypted`], 'base64'));
        } catch {
          throw new Error('Não foi possível desbloquear as chaves neste usuário do Windows. A configuração foi preservada.');
        }
      }
      delete config[`${key}Encrypted`];
    }
    // Só substitui o arquivo legado depois de conseguir criptografar todas as chaves.
    if (KEY_FIELDS.some((key) => Object.hasOwn(stored, key))) save(config);
    return config;
  }
  return { load, save };
}

module.exports = { createConfigStore };
