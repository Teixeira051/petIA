const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createConfigStore } = require('../lib/config-store');
const secure = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from('protected:' + text),
  decryptString: (buffer) => {
    const text = buffer.toString();
    if (!text.startsWith('protected:')) throw new Error('invalid');
    return text.slice(10);
  },
};
function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gemi-config-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'config.json');
  return { file, store: createConfigStore(file, secure) };
}

test('migra as duas chaves legadas e preserva pets e preferências', (t) => {
  const { file, store } = setup(t);
  const original = { apiKey: 'gemini-secret', openaiKey: 'openai-secret', petCount: 4, settings: { sound: false } };
  fs.writeFileSync(file, JSON.stringify(original));
  assert.deepEqual(store.load(), original);
  const saved = fs.readFileSync(file, 'utf8');
  assert.ok(!saved.includes('gemini-secret') && !saved.includes('openai-secret'));
  assert.ok(!Object.hasOwn(JSON.parse(saved), 'apiKey'));
  assert.deepEqual(store.load(), original);
});

test('falha do cofre nunca substitui o arquivo legado nem grava chave em texto puro', (t) => {
  const { file } = setup(t);
  const legacy = JSON.stringify({ apiKey: 'keep-me' });
  fs.writeFileSync(file, legacy);
  const store = createConfigStore(file, { ...secure, isEncryptionAvailable: () => false });
  assert.throws(() => store.load(), /indisponível/);
  assert.equal(fs.readFileSync(file, 'utf8'), legacy);
  assert.throws(() => store.save({ apiKey: 'new-secret' }));
  assert.equal(fs.readFileSync(file, 'utf8'), legacy);
});

test('remove chaves apagadas e preserva arquivo indecifrável ou corrompido', (t) => {
  const { file, store } = setup(t);
  store.save({ apiKey: 'secret' });
  store.save({ apiKey: '' });
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), {});
  for (const content of ['{invalid', JSON.stringify({ apiKeyEncrypted: 'invalid' })]) {
    fs.writeFileSync(file, content);
    assert.throws(() => store.load());
    assert.equal(fs.readFileSync(file, 'utf8'), content);
  }
});

test('não usa backend Linux basic_text como armazenamento seguro', (t) => {
  const { file } = setup(t);
  const store = createConfigStore(file, { ...secure, getSelectedStorageBackend: () => 'basic_text' });
  assert.throws(() => store.save({ apiKey: 'secret' }), /indisponível/);
  assert.equal(fs.existsSync(file), false);
});
