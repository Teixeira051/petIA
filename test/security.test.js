const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isTrustedSender, createTrustedIpc, hardenWebContents, cleanSettings, cleanState, allowedExternalURL, validChat } = require('../lib/security');

const rendererURL = 'file:///C:/pets/renderer/index.html';
function fixture() {
  const frame = { url: rendererURL };
  const webContents = { mainFrame: frame };
  const win = { webContents, isDestroyed: () => false };
  return { win, event: { sender: webContents, senderFrame: frame } };
}

test('IPC aceita apenas a janela e o frame principal locais', () => {
  const { win, event } = fixture();
  assert.equal(isTrustedSender(event, win, rendererURL), true);
  assert.equal(isTrustedSender({ ...event, sender: {} }, win, rendererURL), false);
  assert.equal(isTrustedSender({ ...event, senderFrame: { url: rendererURL } }, win, rendererURL), false);
  event.senderFrame.url = 'https://attacker.example';
  assert.equal(isTrustedSender(event, win, rendererURL), false);
  assert.equal(isTrustedSender({ senderFrame: null }, win, rendererURL), false);
});

test('todos os tipos de IPC bloqueiam remetentes externos antes do callback', async () => {
  const { win, event } = fixture();
  const handlers = {};
  const native = { on: (ch, fn) => { handlers[ch] = fn; }, handle: (ch, fn) => { handlers[ch] = fn; } };
  let called = 0;
  const ipc = createTrustedIpc(native, () => win, rendererURL, () => {});
  ipc.on('write', () => called++);
  ipc.handle('read', () => ++called);
  handlers.write({});
  assert.throws(() => handlers.read({}), /não autorizada/);
  assert.equal(called, 0);
  handlers.write(event);
  assert.equal(await handlers.read(event), 2);
});

test('navegação, popups, webviews e permissões são bloqueados', () => {
  const handlers = {};
  const contents = { on: (ch, fn) => { handlers[ch] = fn; }, setWindowOpenHandler: (fn) => { handlers.open = fn; }, session: { setPermissionRequestHandler: (fn) => { handlers.permission = fn; }, setPermissionCheckHandler: (fn) => { handlers.check = fn; } } };
  hardenWebContents(contents);
  assert.deepEqual(handlers.open(), { action: 'deny' });
  for (const ch of ['will-navigate', 'will-frame-navigate', 'will-attach-webview']) {
    let blocked = false;
    handlers[ch]({ preventDefault: () => { blocked = true; } });
    assert.equal(blocked, true);
  }
  handlers.permission(null, 'camera', (allowed) => assert.equal(allowed, false));
  assert.equal(handlers.check(), false);
});

test('configurações e estado rejeitam campos extras e limitam valores', () => {
  assert.deepEqual(cleanSettings({ volume: 99, sound: false, apiKey: 'secret', injected: true }), { volume: 1, sound: false });
  assert.deepEqual(cleanState({ gemi: { food: 999, energy: -10, injected: true }, injected: {} }), { gemi: { food: 100, energy: 0 } });
  assert.throws(() => cleanSettings(null));
  assert.equal(validChat({ petId: 'gemi', id: 'stream-1', history: [] }), true);
  for (const history of [[null], [{ role: 'user', parts: 'invalid' }], [{ role: 'user', parts: [null] }]]) assert.equal(validChat({ petId: 'gemi', id: 'x', history }), false);
  assert.equal(validChat({ petId: 'other', id: 'stream-1', history: [] }), false);
});

test('links externos aceitam somente páginas oficiais de configuração', () => {
  assert.equal(allowedExternalURL('https://aistudio.google.com/apikey'), true);
  for (const url of ['file:///C:/Windows', 'javascript:alert(1)', 'https://aistudio.google.com.attacker.example', 'https://attacker@aistudio.google.com', 'http://platform.openai.com']) assert.equal(allowedExternalURL(url), false);
});
