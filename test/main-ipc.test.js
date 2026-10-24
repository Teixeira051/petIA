const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const rendererURL = pathToFileURL(path.join(root, 'renderer/index.html')).href;
const plain = (value) => JSON.parse(JSON.stringify(value));
const display = (id, x, width, height, scaleFactor = 1) => ({
  id, label: `Monitor ${id}`, scaleFactor,
  bounds: { x, y: 0, width, height },
  workArea: { x, y: 0, width, height: height - 40 },
});

function createMainFixture(t, config = {}) {
  const handlers = {};
  const created = [];
  const saved = [];
  const confirmations = [];
  const requests = [];
  const errors = [];
  const timers = new Map();
  let nextTimer = 0;
  let quitCount = 0;
  let displays = [display(1, 0, 1920, 1080), display(2, -1280, 1280, 720, 1.5)];
  let primaryId = 1;

  class Window extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height };
      this.destroyed = false;
      this.sent = [];
      this.webContents = new EventEmitter();
      Object.assign(this.webContents, {
        mainFrame: { url: rendererURL },
        send: (channel, data) => this.sent.push({ channel, data }),
        isDestroyed: () => this.destroyed,
        setWindowOpenHandler: () => {},
        session: { setPermissionRequestHandler: () => {}, setPermissionCheckHandler: () => {} },
      });
      created.push(this);
    }
    setAlwaysOnTop() {}
    setIgnoreMouseEvents() {}
    loadFile() {}
    showInactive() {}
    focus() {}
    isDestroyed() { return this.destroyed; }
    setBounds(bounds) { this.bounds = { ...bounds }; }
    getBounds() { return { ...this.bounds }; }
    destroy() { this.destroyed = true; this.emit('closed'); }
  }

  const app = new EventEmitter();
  Object.assign(app, {
    requestSingleInstanceLock: () => true,
    getPath: () => root,
    isReady: () => false,
    quit: () => { quitCount++; },
  });
  const screen = new EventEmitter();
  Object.assign(screen, {
    getAllDisplays: () => displays,
    getPrimaryDisplay: () => displays.find((item) => item.id === primaryId) || displays[0],
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => displays[0],
  });
  const fakeElectron = {
    app, BrowserWindow: Window, screen,
    ipcMain: {
      on: (channel, fn) => { handlers[channel] = fn; },
      handle: (channel, fn) => { handlers[channel] = fn; },
    },
    dialog: {
      showMessageBox: async (parent, options) => {
        confirmations.push({ parent, options });
        return { response: 0 };
      },
      showErrorBox: (_title, message) => errors.push(message),
    },
  };
  const sandbox = {
    require: (id) => {
      if (id === 'electron') return fakeElectron;
      if (id === './lib/config-store') return { createConfigStore: () => ({ load: () => plain(config), save: (value) => saved.push(plain(value)) }) };
      if (id === './lib/logger') return { createLogger: () => () => {} };
      if (id === 'fs') return { ...fs, existsSync: () => false };
      if (id === 'child_process') return { spawn: () => { throw new Error('Não execute processos no teste.'); }, execFile: () => {} };
      return require(id.startsWith('./') ? path.join(root, id) : id);
    },
    fetch: (url, options) => new Promise((_resolve, reject) => {
      requests.push({ url, signal: options.signal });
      options.signal.addEventListener('abort', () => {
        const error = new Error('Requisição de teste cancelada.');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }),
    __dirname: root,
    process: { env: {}, pid: 123, platform: 'win32', on: () => {} },
    console, AbortController, Buffer,
    setTimeout: (fn) => { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout: (id) => timers.delete(id),
    setInterval: () => 0, clearInterval: () => {},
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'main.js'), 'utf8'), sandbox);
  app.emit('ready');
  assert.deepEqual(errors, []);
  t.after(() => app.emit('before-quit'));

  const event = (window) => ({ sender: window.webContents, senderFrame: window.webContents.mainFrame });
  const dispatch = (channel, window, value) => handlers[channel](event(window), value);
  return {
    handlers, created, saved, confirmations, requests, event, dispatch,
    window: (id) => created.findLast((window) => !window.destroyed && window.options.title.endsWith(`Monitor ${id}`)),
    quitCount: () => quitCount,
    changeDisplays(next, primary = primaryId) {
      displays = next;
      primaryId = primary;
      screen.emit('display-metrics-changed');
      const pending = [...timers.values()];
      timers.clear();
      for (const fn of pending) fn();
    },
    chat(window, petId, id) {
      return dispatch('chat-send', window, { petId, id, history: [{ role: 'user', parts: [{ text: 'Mensagem de teste.' }] }] });
    },
  };
}

test('duas telas recebem janelas isoladas, escala e resolução físicas corretas', async (t) => {
  const fixture = createMainFixture(t);
  assert.equal(fixture.created.length, 2);
  const first = fixture.window(1);
  const second = fixture.window(2);
  for (const window of [first, second]) {
    assert.equal(window.options.webPreferences.sandbox, true);
    assert.equal(window.options.webPreferences.contextIsolation, true);
    assert.equal(window.options.webPreferences.nodeIntegration, false);
  }
  assert.deepEqual(first.getBounds(), { x: 0, y: 260, width: 1920, height: 780 });
  assert.deepEqual(second.getBounds(), { x: -1280, y: 0, width: 1280, height: 680 });
  const one = await fixture.dispatch('get-config', first);
  const two = await fixture.dispatch('get-config', second);
  assert.deepEqual(plain(one.viewport.visiblePetIds), ['gemi']);
  assert.deepEqual(plain(two.viewport.visiblePetIds), ['codex']);
  assert.equal(two.viewport.scaleFactor, 1.5);
  assert.deepEqual(plain(two.viewport.resolution), { width: 1920, height: 1080 });
});

test('resolução e hotplug redimensionam janelas e recuperam pets sem duplicação', async (t) => {
  const fixture = createMainFixture(t);
  const first = fixture.window(1);
  const removed = fixture.window(2);
  fixture.changeDisplays([display(1, 0, 800, 600)]);
  assert.equal(removed.destroyed, true);
  assert.deepEqual(first.getBounds(), { x: 0, y: 0, width: 800, height: 560 });
  assert.deepEqual(plain((await fixture.dispatch('get-config', first)).viewport.visiblePetIds), ['gemi', 'codex']);
  assert.equal(fixture.quitCount(), 0);

  fixture.changeDisplays([display(1, 0, 800, 600), display(2, -1280, 1280, 720, 1.5)]);
  const reconnected = fixture.window(2);
  assert.notEqual(reconnected, removed);
  const visible = await Promise.all([first, reconnected].map(async (window) => (await fixture.dispatch('get-config', window)).viewport.visiblePetIds));
  assert.deepEqual(visible.flat().sort(), ['codex', 'gemi']);
  assert.equal(fixture.created.filter((window) => !window.destroyed).length, 2);
});

test('transferir pet preserva estado dos outros pets e mudanças de chave/configuração', async (t) => {
  const fixture = createMainFixture(t);
  const first = fixture.window(1);
  const second = fixture.window(2);
  fixture.dispatch('save-state', first, { gemi: { food: 71, fun: 72, energy: 73 } });
  fixture.dispatch('save-state', second, { codex: { food: 61, fun: 62, energy: 63 } });
  await fixture.dispatch('move-pet', first, { petId: 'gemi', displayId: '2', state: { food: 81, fun: 82, energy: 83 } });
  await fixture.dispatch('set-key', second, { geminiKey: 'CHAVE-APENAS-PARA-TESTE' });
  const one = await fixture.dispatch('get-config', first);
  const two = await fixture.dispatch('get-config', second);
  assert.deepEqual(plain(one.viewport.visiblePetIds), []);
  assert.deepEqual(plain(two.viewport.visiblePetIds), ['gemi', 'codex']);
  assert.deepEqual(plain(two.state), {
    gemi: { food: 81, fun: 82, energy: 83 },
    codex: { food: 61, fun: 62, energy: 63 },
  });
  assert.equal(two.hasKey, true);
  assert.equal(Object.hasOwn(two, 'apiKey'), false);
  assert.equal(fixture.saved.at(-1).petDisplays.gemi, '2');
  assert.deepEqual(fixture.saved.at(-1).state, plain(two.state));
  await assert.rejects(async () => fixture.dispatch('move-pet', first, { petId: 'gemi', displayId: '1' }), /Pet indisponível/);
});

test('IPC rejeita janela desconhecida e subframe mesmo com URL local correta', async (t) => {
  const fixture = createMainFixture(t);
  const first = fixture.window(1);
  const foreign = { sender: {}, senderFrame: { url: rendererURL } };
  const subframe = { sender: first.webContents, senderFrame: { url: rendererURL } };
  for (const event of [foreign, subframe]) {
    fixture.handlers['set-pet-count'](event, 4);
    await assert.rejects(async () => fixture.handlers['get-config'](event), /Origem IPC não autorizada/);
  }
  assert.equal((await fixture.dispatch('get-config', first)).petCount, 2);
  assert.equal(fixture.saved.length, 0);
});

test('tool-run usa confirmação nativa na janela que solicitou e permite recusa', async (t) => {
  const fixture = createMainFixture(t);
  const second = fixture.window(2);
  const payload = { petId: 'codex', id: 'direct-test', callId: 'direct-test', name: 'chamar_codex', args: { tarefa: 'apenas teste' } };
  await fixture.handlers['tool-run']({ sender: second.webContents, senderFrame: {} }, payload);
  assert.equal(fixture.confirmations.length, 0);
  await fixture.dispatch('tool-run', second, payload);
  assert.equal(fixture.confirmations.length, 1);
  const { parent, options } = fixture.confirmations[0];
  assert.equal(parent, second);
  assert.match(options.detail, /PASTA:/);
  assert.match(options.detail, /apenas teste/);
  assert.equal(options.defaultId, 0);
  assert.ok(second.sent.some(({ channel, data }) => channel === 'tool-result' && data.canceled));
  assert.equal(fixture.requests.length, 0);
});

test('uma janela não pode cancelar chat pertencente à outra tela', async (t) => {
  const fixture = createMainFixture(t, { apiKey: 'CHAVE-APENAS-PARA-TESTE' });
  const first = fixture.window(1);
  const second = fixture.window(2);
  const pending = fixture.chat(second, 'codex', 'request-second-screen');
  assert.equal(fixture.requests.length, 1);
  fixture.dispatch('chat-abort', first, 'request-second-screen');
  assert.equal(fixture.requests[0].signal.aborted, false);
  fixture.dispatch('chat-abort', second, 'request-second-screen');
  assert.equal(fixture.requests[0].signal.aborted, true);
  await pending;
  assert.ok(second.sent.some(({ channel, data }) => channel === 'chat-done' && data.aborted));
  assert.equal(first.sent.some(({ channel }) => channel === 'chat-done'), false);
});

test('remover uma tela aborta seu chat e mantém a solicitação da outra tela', async (t) => {
  const fixture = createMainFixture(t, { apiKey: 'CHAVE-APENAS-PARA-TESTE' });
  const first = fixture.window(1);
  const second = fixture.window(2);
  const primaryChat = fixture.chat(first, 'gemi', 'request-primary');
  const secondaryChat = fixture.chat(second, 'codex', 'request-secondary');
  assert.equal(fixture.requests.length, 2);
  fixture.changeDisplays([display(1, 0, 1920, 1080)]);
  assert.equal(second.destroyed, true);
  assert.equal(fixture.requests[0].signal.aborted, false);
  assert.equal(fixture.requests[1].signal.aborted, true);
  await secondaryChat;
  fixture.dispatch('chat-abort', first, 'request-primary');
  await primaryChat;
  assert.equal(fixture.quitCount(), 0);
});

test('histórico acompanha o pet transferido e permanece apenas na memória da sessão', async (t) => {
  const fixture = createMainFixture(t);
  const first = fixture.window(1);
  const second = fixture.window(2);
  const history = [
    { role: 'user', parts: [{ text: 'session-memory-marker: mensagem do usuário.' }] },
    { role: 'model', parts: [{ text: 'Resposta de teste do pet.' }] },
  ];
  fixture.dispatch('save-session', first, { petId: 'gemi', history });
  fixture.dispatch('save-session', second, { petId: 'gemi', history: [] });
  assert.equal(fixture.saved.length, 0);
  const initial = await fixture.dispatch('get-config', first);
  assert.deepEqual(plain(initial.viewport.histories.gemi), history);
  assert.equal(Object.hasOwn((await fixture.dispatch('get-config', second)).viewport.histories, 'gemi'), false);

  await fixture.dispatch('move-pet', first, { petId: 'gemi', displayId: '2' });
  await fixture.dispatch('set-key', second, { geminiKey: 'CHAVE-APENAS-PARA-TESTE' });
  const moved = await fixture.dispatch('get-config', second);
  assert.deepEqual(plain(moved.viewport.histories.gemi), history);
  assert.equal(Object.hasOwn((await fixture.dispatch('get-config', first)).viewport.histories, 'gemi'), false);
  assert.ok(fixture.saved.length > 0);
  assert.ok(fixture.saved.every((config) => !Object.hasOwn(config, 'histories') && !Object.hasOwn(config, 'sessionHistory')));
  assert.equal(JSON.stringify(fixture.saved).includes('session-memory-marker'), false);
});

test('mover um pet cancela só seu chat mesmo quando outro chat pertence à mesma janela', async (t) => {
  const fixture = createMainFixture(t, {
    apiKey: 'CHAVE-APENAS-PARA-TESTE',
    petDisplays: { gemi: '1', codex: '1' },
  });
  const first = fixture.window(1);
  const gemiChat = fixture.chat(first, 'gemi', 'request-moving-pet');
  const codexChat = fixture.chat(first, 'codex', 'request-staying-pet');
  assert.equal(fixture.requests.length, 2);
  await fixture.dispatch('move-pet', first, { petId: 'gemi', displayId: '2' });
  assert.equal(fixture.requests[0].signal.aborted, true);
  assert.equal(fixture.requests[1].signal.aborted, false);
  await gemiChat;
  fixture.dispatch('chat-abort', first, 'request-staying-pet');
  await codexChat;
  assert.deepEqual(plain((await fixture.dispatch('get-config', first)).viewport.visiblePetIds), ['codex']);
  assert.deepEqual(plain((await fixture.dispatch('get-config', fixture.window(2))).viewport.visiblePetIds), ['gemi']);
});
