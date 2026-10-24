// Gemi & Codexy — processo principal (Electron)
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');
const { pathToFileURL } = require('node:url');
const { createConfigStore } = require('./lib/config-store');
const { createLogger } = require('./lib/logger');
const { createTrustedIpc, hardenWebContents, PET_IDS, SKINS, validId, isRecord, cleanSettings, cleanState, validChat, allowedExternalURL } = require('./lib/security');
const { createToolExecutor } = require('./lib/tool-executor');
const { describeDisplays, petAssignments, viewportFor } = require('./lib/displays');

let config = {};
const logFile = path.join(os.tmpdir(), 'gemi-boot.log');
const log = createLogger(logFile, { secrets: () => [config.apiKey, config.openaiKey, process.env.GEMINI_API_KEY, process.env.OPENAI_API_KEY] });

process.on('uncaughtException', (err) => {
  log('UNCAUGHT EXCEPTION:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason) => {
  log('UNHANDLED REJECTION:', reason && reason.stack ? reason.stack : reason);
});

log('Main process starting... PID:', process.pid);

const gotLock = app.requestSingleInstanceLock();
log('requestSingleInstanceLock result:', gotLock);
if (!gotLock) {
  log('Could not get single instance lock, exiting.');
  app.exit(0);
}

let win = null;
const windows = new Map();
let displays = [];
let topologyTimer = null;
let topmostTimer = null;
let quitting = false;
let tray = null;
let watcherProc = null;
const sessionHistory = new Map(); // Conversas ficam apenas na memória da sessão.
const controllers = new Map(); // id do chat -> AbortController
const children = new Map(); // callId -> processo do Codex
const rendererURL = pathToFileURL(path.join(__dirname, 'renderer', 'index.html')).href;
const ipc = createTrustedIpc(ipcMain, (event) => recordForSender(event.sender)?.window, rendererURL, (error) => log('IPC:', error.message));
const configStore = createConfigStore(path.join(app.getPath('userData'), 'config.json'), safeStorage);

const DEFAULT_SETTINGS = {
  sound: true,
  volume: 0.55,
  autoHide: true,
  autoSleep: true,
  autoEat: true,
  chatter: true,
  defaultFolder: '',
};

// Ordem de tentativa: se um modelo estiver no limite (429) ou indisponível (404/5xx), tenta o próximo
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest'];

// ---------- Config ----------
function loadConfig() {
  config = configStore.load();
  config.gemiSkin ||= 'robot';
  config.codexSkin ||= 'cat';
  config.claudeSkin ||= 'fox';
  config.sparkySkin ||= 'slime';
  config.petCount ||= 2;
  config.settings = { ...DEFAULT_SETTINGS, ...cleanSettings(config.settings || {}) };
  if (config.state) config.state = cleanState(config.state);
  config.petCount = Math.max(1, Math.min(4, Math.floor(Number(config.petCount) || 2)));
  config.petDisplays = isRecord(config.petDisplays) ? Object.fromEntries(PET_IDS.filter((id) => typeof config.petDisplays[id] === 'string').map((id) => [id, config.petDisplays[id]])) : {};
}
function saveConfig() {
  configStore.save(config);
}
const geminiApiKey = () => config.apiKey || process.env.GEMINI_API_KEY || '';
const openaiApiKey = () => config.openaiKey || process.env.OPENAI_API_KEY || '';

// ---------- Localizar ferramentas externas ----------
function findCodexExe() {
  const base = path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin');
  try {
    const found = fs.readdirSync(base)
      .map((d) => path.join(base, d, 'codex.exe'))
      .filter((p) => fs.existsSync(p))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (found.length) return found[0];
  } catch {}
  const winApp = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'codex.exe');
  return fs.existsSync(winApp) ? winApp : null;
}

function findAntigravity() {
  const base = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity IDE');
  const exe = path.join(base, 'Antigravity IDE.exe');
  const cli = path.join(base, 'resources', 'app', 'out', 'cli.js');
  return fs.existsSync(exe) && fs.existsSync(cli) ? { exe, cli } : null;
}

const validFolder = (p) => {
  try { return !!p && fs.statSync(p).isDirectory(); } catch { return false; }
};

// ---------- Janela ----------
function recordForSender(sender) {
  return [...windows.values()].find((record) => !record.window.isDestroyed() && record.window.webContents === sender);
}

function cancelPetRequests(petId) {
  for (const [id, controller] of controllers) {
    if (controller.petId !== petId) continue;
    controller.abort();
    for (const [callId, child] of children) if (child.owner === controller.owner && (callId === id || callId.startsWith(id + '-'))) { try { child.kill(); } catch {} }
  }
}

function cancelOwner(sender) {
  for (const controller of controllers.values()) if (controller.owner === sender) controller.abort();
  for (const child of children.values()) if (child.owner === sender) { try { child.kill(); } catch {} }
}

function broadcast(channel, data) {
  for (const { window } of windows.values()) if (!window.isDestroyed()) window.webContents.send(channel, data);
}

function currentViewport(record) {
  const display = displays.find((item) => item.id === record.displayId);
  return display ? {
    ...viewportFor(display, displays, config.petCount, config.petDisplays),
    state: config.state || {},
    histories: Object.fromEntries(PET_IDS.filter((id) => petAssignments(displays, config.petCount, config.petDisplays)[id] === record.displayId).map((id) => [id, sessionHistory.get(id) || []])),
    skins: { gemi: config.gemiSkin, codex: config.codexSkin, claude: config.claudeSkin, sparky: config.sparkySkin },
  } : null;
}

function pushViewports() {
  for (const record of windows.values()) {
    const viewport = currentViewport(record);
    if (viewport && !record.window.isDestroyed()) record.window.webContents.send('viewport', viewport);
  }
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function createWindow(display) {
  const window = new BrowserWindow({
    ...display.windowBounds,
    transparent: true, frame: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false,
    backgroundColor: '#00000000', title: 'Gemi Pets — ' + display.label,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true,
      nodeIntegration: false, sandbox: true, webSecurity: true, webviewTag: false,
      backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required',
    },
  });
  const record = { window, displayId: display.id, ignoringMouse: true, confirmingTool: false };
  windows.set(display.id, record);
  const owner = window.webContents;
  hardenWebContents(owner);
  window.setAlwaysOnTop(true, 'screen-saver');
  window.setIgnoreMouseEvents(true, { forward: true });
  window.webContents.on('console-message', (event) => log('[Renderer ' + display.id + ']', event.message || ''));
  window.webContents.on('did-fail-load', (_event, code, description) => log('Renderer failed:', code, description));
  window.webContents.on('did-finish-load', () => {
    const viewport = currentViewport(record);
    if (viewport && !window.isDestroyed()) window.webContents.send('viewport', viewport);
  });
  window.on('closed', () => {
    cancelOwner(owner);
    if (windows.get(display.id) === record) windows.delete(display.id);
  });
  const show = () => { if (!window.isDestroyed()) { window.showInactive(); window.setAlwaysOnTop(true, 'screen-saver'); } };
  window.once('ready-to-show', show);
  setTimeout(show, 1500);
  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  return record;
}

function syncDisplays() {
  if (quitting) return;
  displays = describeDisplays(screen.getAllDisplays(), screen.getPrimaryDisplay().id);
  if (!displays.length) return;
  // Create replacement windows first so unplugging a monitor cannot quit the app.
  for (const display of displays) {
    const existing = windows.get(display.id);
    if (existing && !existing.window.isDestroyed()) existing.window.setBounds(display.windowBounds);
    else createWindow(display);
  }
  win = windows.get(displays[0].id)?.window || null;
  for (const [id, record] of windows) {
    if (!displays.some((display) => display.id === id)) {
      windows.delete(id);
      if (!record.window.isDestroyed()) record.window.destroy();
    }
  }
  pushViewports();
}

function scheduleDisplaySync() {
  clearTimeout(topologyTimer);
  topologyTimer = setTimeout(syncDisplays, 150);
}

function movePet(petId, targetId, state) {
  if (!PET_IDS.slice(0, config.petCount).includes(petId) || !displays.some((display) => display.id === targetId)) throw new Error('Pet ou tela indisponível.');
  if (state) config.state = { ...config.state, ...cleanState({ [petId]: state }) };
  if (petAssignments(displays, config.petCount, config.petDisplays)[petId] !== targetId) cancelPetRequests(petId);
  config.petDisplays[petId] = targetId;
  saveConfig();
  pushViewports();
}

function targetRecord(petId) {
  const assignments = petAssignments(displays, config.petCount, config.petDisplays);
  if (petId && assignments[petId]) return windows.get(assignments[petId]);
  const nearest = screen.getDisplayNearestPoint?.(screen.getCursorScreenPoint());
  return windows.get(String(nearest?.id)) || windows.get(displays[0]?.id);
}

// ---------- Monitor de janelas do Windows ----------
function startWindowWatcher() {
  const exe = path.join(__dirname, 'watcher', 'window-watcher.exe').replace('app.asar', 'app.asar.unpacked');
  if (!fs.existsSync(exe)) return;
  try {
    watcherProc = spawn(exe, [], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    watcherProc.on('error', () => { watcherProc = null; });
    let buffer = '';
    watcherProc.stdout.on('data', (d) => {
      buffer += d.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) {
        if (line.includes('WINDOW_MOVE_START')) broadcast('window-moving');
      }
    });
    watcherProc.on('exit', () => { watcherProc = null; });
  } catch (e) {
    console.warn('Window watcher desativado:', e.message);
  }
}

// ---------- Monitor de Aplicativos (Spotify e Antigravity / Argon) ----------
let currentAppContext = { spotify: false, antigravity: false };
let appWatcherTimer = null;

function checkRunningApps() {
  if (process.platform !== 'win32') return;
  execFile(path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tasklist.exe'), ['/fo', 'csv', '/nh'], { windowsHide: true, timeout: 5000 }, (err, stdout) => {
    if (err || !stdout) return;
    const hasSpotify = /spotify/i.test(stdout);
    const hasAntigravity = /antigravity/i.test(stdout);
    if (hasSpotify !== currentAppContext.spotify || hasAntigravity !== currentAppContext.antigravity) {
      currentAppContext = { spotify: hasSpotify, antigravity: hasAntigravity };
      broadcast('app-context', currentAppContext);
    }
  });
}

// ---------- Tray ----------
const send = (cmd, arg) => {
  const record = targetRecord(PET_IDS.includes(arg) ? arg : cmd === 'key' ? 'gemi' : undefined);
  if (record && !record.window.isDestroyed()) record.window.webContents.send('command', { cmd, arg });
};

function buildTrayMenu() {
  const startup = app.getLoginItemSettings({ path: process.execPath, args: app.isPackaged ? [] : [app.getAppPath()] }).openAtLogin;
  const s = config.settings;
  const petCount = config.petCount || 2;

  const petMenus = [
    { label: '✨ Gemi', submenu: [
      { label: '💬 Conversar', click: () => send('chat', 'gemi') },
      { label: '🎭 Trocar skin', click: () => send('skin-modal', 'gemi') },
    ] },
  ];
  if (petCount >= 2) {
    petMenus.push({ label: '⚡ Codexy', submenu: [
      { label: '💬 Conversar', click: () => send('chat', 'codex') },
      { label: '🎭 Trocar skin', click: () => send('skin-modal', 'codex') },
    ] });
  }
  if (petCount >= 3) {
    petMenus.push({ label: '🦊 Raposo', submenu: [
      { label: '💬 Conversar', click: () => send('chat', 'claude') },
      { label: '🎭 Trocar skin', click: () => send('skin-modal', 'claude') },
    ] });
  }
  if (petCount >= 4) {
    petMenus.push({ label: '🌟 Sparky', submenu: [
      { label: '💬 Conversar', click: () => send('chat', 'sparky') },
      { label: '🎭 Trocar skin', click: () => send('skin-modal', 'sparky') },
    ] });
  }

  return Menu.buildFromTemplate([
    ...petMenus,
    { label: '🖥️ Telas dos pets', submenu: PET_IDS.slice(0, petCount).map((id) => ({
      label: ({ gemi: 'Gemi', codex: 'Codexy', claude: 'Raposo', sparky: 'Sparky' })[id],
      submenu: displays.map((display) => ({
        label: display.label + ' · ' + display.resolution.width + ' × ' + display.resolution.height + ' · ' + Math.round(display.scaleFactor * 100) + '%',
        type: 'radio', checked: petAssignments(displays, petCount, config.petDisplays)[id] === display.id,
        click: () => movePet(id, display.id),
      })),
    })) },
    { label: 'Reunir pets nesta tela', click: () => {
      const record = targetRecord();
      if (!record) return;
      for (const id of PET_IDS.slice(0, config.petCount)) {
        if (petAssignments(displays, config.petCount, config.petDisplays)[id] !== record.displayId) cancelPetRequests(id);
        config.petDisplays[id] = record.displayId;
      }
      saveConfig(); pushViewports();
    } },
    { type: 'separator' },
    {
      label: '👥 Quantidade de Pets',
      submenu: [1, 2, 3, 4].map((cnt) => ({
        label: `${cnt} ${cnt === 1 ? 'Personagem (Gemi)' : cnt === 2 ? 'Personagens (Gemi & Codexy)' : cnt === 3 ? 'Personagens (+ Raposo)' : 'Personagens (Equipe 4 Pets)'}`,
        type: 'radio',
        checked: petCount === cnt,
        click: () => {
          config.petCount = cnt;
          saveConfig();
          pushViewports();
          pushSettings();
        },
      })),
    },
    { type: 'separator' },
    { label: '🎮 Jogos e brincadeiras', submenu: [
      { label: '🏐 Vôlei', click: () => send('game', 'volley') },
      { label: '🙈 Esconde-esconde', click: () => send('game', 'hideseek') },
      { label: '🏃 Pega-pega', click: () => send('game', 'tag') },
      { label: '⚽ Embaixadinhas', click: () => send('game', 'keepup') },
      { label: '✌️ Jokenpô', click: () => send('game', 'jokenpo') },
      { label: '🎵 Dancinha', click: () => send('game', 'dance') },
    ] },
    { label: '🍎 Dar comida', click: () => send('feed') },
    { label: '🏃 Correr agora', click: () => send('run') },
    { label: '😴 Dormir / acordar', click: () => send('sleep') },
    { type: 'separator' },
    { label: '🔊 Sons', type: 'checkbox', checked: !!s.sound, click: (i) => { config.settings.sound = i.checked; saveConfig(); pushSettings(); } },
    { label: '⚙️ Configurações…', click: () => send('settings') },
    { label: '🔑 Chave do Gemini…', click: () => send('key') },
    {
      label: 'Iniciar com o Windows', type: 'checkbox', checked: startup,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, path: process.execPath, args: app.isPackaged ? [] : [app.getAppPath()] }),
    },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() },
  ]);
}

function pushSettings() {
  broadcast('settings', config.settings);
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function createTray(dataUrl) {
  const img = nativeImage.createFromDataURL(dataUrl).resize({ width: 32, height: 32 });
  if (tray) { tray.setImage(img); return; }
  tray = new Tray(img);
  tray.setToolTip('Gemi & Amigos — seus pets da taskbar');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => send('chat', 'gemi'));
  tray.on('right-click', () => tray.setContextMenu(buildTrayMenu()));
}

// ---------- IA: prompts e ferramentas ----------
const PERSONAS = {
  gemi: 'Você é o Gemi ✨, um robozinho amigável e esperto que mora em cima da barra de tarefas do Windows do usuário. Seu cérebro principal é o Gemini (Google).',
  codex: 'Você é o Codexy ⚡, um gatinho/mascote ágil e técnico que mora em cima da barra de tarefas do Windows. Você é especialista em desenvolvimento, terminal e ferramentas como o Codex da OpenAI.',
  claude: 'Você é o Raposo 🦊, uma raposinha charmosa, atenciosa e muito culta que mora na barra de tarefas. Você se destaca por explicações detalhadas, lógica elegante e conselhos precisos.',
  sparky: 'Você é o Sparky 🌟, uma gotinha cósmica entusiasmada e criativa que mora na barra de tarefas. Você vibra com soluções rápidas, design moderno e comemora cada linha de código funcional!',
};

function systemPrompt(petId, s = {}) {
  const p = PERSONAS[petId] || PERSONAS.gemi;
  return [
    p,
    'Responda sempre em português do Brasil, de jeito simpático, solícito e direto ao ponto. A janela de chat é compacta: prefira respostas concisas e práticas (até ~7 linhas) a não ser que o usuário peça uma resposta detalhada ou código completo. Use markdown e blocos de código com destaque.',
    'Você possui duas ferramentas poderosas: chamar_codex (agente autônomo da OpenAI que lê/edita arquivos locais e roda comandos no terminal do PC) e abrir_antigravity (abre o Antigravity IDE, também chamado de "argon", e entrega uma tarefa para o agente).',
    'Converse livremente e tire dúvidas de programação, scripts e ideias. Só chame ferramentas quando o usuário pedir (ex.: "/codex", "/argon", "chama o codex") ou quando ele solicitar manipulação de arquivos ou execução de comandos no computador dele.',
    'Quando uma ferramenta responder, faça um breve resumo dos resultados obtidos.',
    `Seu humor agora: comida ${Math.round(s.food ?? 80)}%, diversão ${Math.round(s.fun ?? 80)}%, energia ${Math.round(s.energy ?? 80)}%.`,
  ].join('\n');
}

const TOOLS = [{
  functionDeclarations: [
    {
      name: 'chamar_codex',
      description: 'Delega uma tarefa de programação ao Codex (agente da OpenAI) que roda localmente no PC do usuário, podendo ler/editar arquivos e executar comandos na pasta indicada. Use para trabalho real em projetos/arquivos ou quando o usuário pedir o Codex.',
      parameters: {
        type: 'OBJECT',
        properties: {
          tarefa: { type: 'STRING', description: 'Instrução completa e autossuficiente para o Codex.' },
          pasta: { type: 'STRING', description: 'Caminho absoluto da pasta do projeto (opcional).' },
        },
        required: ['tarefa'],
      },
    },
    {
      name: 'abrir_antigravity',
      description: 'Abre o Antigravity IDE (também chamado de "argon" pelo usuário) com o chat do agente já recebendo a tarefa. Use quando o usuário pedir para mandar algo para o Antigravity/argon ou para tarefas grandes que ele queira acompanhar no IDE.',
      parameters: {
        type: 'OBJECT',
        properties: {
          tarefa: { type: 'STRING', description: 'Instrução completa para o agente do Antigravity.' },
          pasta: { type: 'STRING', description: 'Caminho absoluto da pasta do projeto (opcional).' },
        },
        required: ['tarefa'],
      },
    },
  ],
}];

// Garante que o histórico começa com uma mensagem de texto do usuário
function trimHistory(history) {
  let h = Array.isArray(history) ? history.slice(-30) : [];
  while (h.length && !(h[0].role === 'user' && h[0].parts?.some((p) => typeof p.text === 'string'))) h.shift();
  return h;
}

function friendlyGeminiError(e) {
  const m = e.message || '';
  if (e.status === 429) return 'O Gemini atingiu o limite de uso gratuito por agora. Espere alguns segundos e tente de novo 🙏';
  if (e.status === 400 && /api key/i.test(m)) return 'A chave do Gemini parece inválida. Clique em 🔑 e cole uma nova.';
  if (e.status === 403) return 'A chave do Gemini não tem permissão. Gere outra no Google AI Studio (🔑).';
  if (/fetch failed|ENOTFOUND|network/i.test(m)) return 'Sem conexão com a internet 📡';
  return m || 'Erro desconhecido';
}

// Faz uma chamada em streaming e devolve as "parts" da resposta do modelo e estatísticas de tokens
async function geminiStreamOnce(model, body, key, signal, onText) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = '';
    try { const j = await res.json(); msg = j.error?.message || ''; } catch {}
    const err = new Error(msg || `Erro ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const parts = [];
  let usage = null;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      let j;
      try { j = JSON.parse(line.slice(5).trim()); } catch { continue; }
      if (j.usageMetadata) {
        usage = {
          promptTokens: j.usageMetadata.promptTokenCount || 0,
          completionTokens: j.usageMetadata.candidatesTokenCount || 0,
          totalTokens: j.usageMetadata.totalTokenCount || 0,
          thoughtsTokens: j.usageMetadata.thoughtsTokenCount || 0,
        };
      }
      for (const p of j.candidates?.[0]?.content?.parts || []) {
        if (p.thought) continue;
        if (p.functionCall) {
          parts.push({ functionCall: p.functionCall, ...(p.thoughtSignature ? { thoughtSignature: p.thoughtSignature } : {}) });
        } else if (typeof p.text === 'string') {
          if (p.text) onText(p.text);
          const last = parts[parts.length - 1];
          if (last && typeof last.text === 'string') {
            last.text += p.text;
            if (p.thoughtSignature) last.thoughtSignature = p.thoughtSignature;
          } else {
            parts.push({ text: p.text, ...(p.thoughtSignature ? { thoughtSignature: p.thoughtSignature } : {}) });
          }
        } else if (p.thoughtSignature) {
          const last = parts[parts.length - 1];
          if (last) last.thoughtSignature = p.thoughtSignature;
        }
      }
    }
  }
  return { parts, usage };
}

async function geminiChat(sender, { petId, id, history, state }) {
  const emit = (ch, data = {}) => {
    if (ch === 'chat-done' && !data.aborted && data.turns) sessionHistory.set(petId, [...trimHistory(history), ...data.turns].slice(-30));
    if (!sender.isDestroyed()) sender.send(ch, { petId, id, ...data });
  };
  const key = geminiApiKey();
  if (!key) { emit('chat-error', { message: 'NO_KEY' }); return; }

  const startTime = Date.now();
  const ac = new AbortController();
  ac.owner = sender;
  ac.petId = petId;
  controllers.set(id, ac);
  const contents = trimHistory(history);
  const turns = [];
  const models = [...new Set([config.geminiModel, ...GEMINI_MODELS].filter(Boolean))];
  let model = null;
  let finalUsage = null;

  try {
    for (let round = 0; round < 4; round++) {
      const body = {
        systemInstruction: { parts: [{ text: systemPrompt(petId, state) }] },
        contents: [...contents, ...turns],
        tools: TOOLS,
        generationConfig: { temperature: 0.8 },
      };

      let parts = null;
      let lastErr = null;
      for (const m of model ? [model] : models) {
        let gotText = false;
        try {
          const streamRes = await geminiStreamOnce(m, body, key, ac.signal, (t) => { gotText = true; emit('chat-chunk', { text: t }); });
          parts = streamRes.parts;
          if (streamRes.usage) finalUsage = streamRes.usage;
          model = m;
          break;
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          lastErr = e;
          if (gotText || ![404, 429, 500, 503].includes(e.status)) break;
        }
      }
      if (!parts) throw lastErr || new Error('Sem resposta do Gemini');
      if (!parts.length) parts = [{ text: '' }];
      turns.push({ role: 'model', parts });

      const calls = parts.filter((p) => p.functionCall);
      if (!calls.length) break;

      const responses = [];
      for (const c of calls) {
        const callId = `${id}-${round}-${responses.length}`;
        const result = await handleToolCall(sender, petId, id, callId, c.functionCall.name, c.functionCall.args || {});
        responses.push({
          functionResponse: {
            name: c.functionCall.name,
            ...(c.functionCall.id ? { id: c.functionCall.id } : {}),
            response: result,
          },
        });
      }
      turns.push({ role: 'user', parts: responses });
      emit('chat-continue');
    }

    const durationMs = Date.now() - startTime;
    if (!finalUsage || !finalUsage.totalTokens) {
      const promptChars = JSON.stringify(contents).length;
      const outputChars = turns.reduce((acc, t) => acc + (t.parts || []).map((p) => p.text || '').join('').length, 0);
      const promptTokens = Math.max(1, Math.round(promptChars / 3.8));
      const completionTokens = Math.max(1, Math.round(outputChars / 3.8));
      finalUsage = {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        estimated: true,
      };
    }
    emit('chat-done', { turns, model, usage: finalUsage, durationMs });
  } catch (e) {
    const durationMs = Date.now() - startTime;
    if (e.name === 'AbortError') emit('chat-done', { turns, model, usage: finalUsage, durationMs, aborted: true });
    else emit('chat-error', { message: friendlyGeminiError(e), status: e.status, quotaExceeded: e.status === 429, durationMs });
  } finally {
    controllers.delete(id);
  }
}

// ---------- OpenAI (opcional, só se o usuário colocar uma chave para o Codexy) ----------
async function openaiChat(sender, { petId, id, history }, key) {
  const emit = (ch, data = {}) => { if (!sender.isDestroyed()) sender.send(ch, { petId, id, ...data }); };
  const startTime = Date.now();
  const ac = new AbortController();
  ac.owner = sender;
  ac.petId = petId;
  controllers.set(id, ac);
  let text = '';
  let usage = null;
  try {
    const messages = trimHistory(history)
      .map((m) => ({ role: m.role === 'model' ? 'assistant' : 'user', content: (m.parts || []).map((p) => p.text || '').join('') }))
      .filter((m) => m.content);
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ac.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: config.openaiModel || 'gpt-4o-mini',
        stream: true,
        stream_options: { include_usage: true },
        messages: [{ role: 'system', content: systemPrompt(petId) }, ...messages],
      }),
    });
    if (!res.ok) {
      let msg = `Erro ${res.status}`;
      try { const j = await res.json(); msg = j.error?.message || msg; } catch {}
      emit('chat-error', { message: msg, status: res.status });
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.usage) {
            usage = {
              promptTokens: parsed.usage.prompt_tokens || 0,
              completionTokens: parsed.usage.completion_tokens || 0,
              totalTokens: parsed.usage.total_tokens || 0,
            };
          }
          const chunk = parsed.choices?.[0]?.delta?.content || '';
          if (chunk) { text += chunk; emit('chat-chunk', { text: chunk }); }
        } catch {}
      }
    }
    const durationMs = Date.now() - startTime;
    if (!usage) {
      const promptChars = JSON.stringify(messages).length;
      const promptTokens = Math.max(1, Math.round(promptChars / 3.8));
      const completionTokens = Math.max(1, Math.round(text.length / 3.8));
      usage = { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, estimated: true };
    }
    emit('chat-done', { turns: [{ role: 'model', parts: [{ text }] }], model: 'openai', usage, durationMs });
  } catch (e) {
    const durationMs = Date.now() - startTime;
    if (e.name === 'AbortError') emit('chat-done', { turns: [{ role: 'model', parts: [{ text }] }], usage, durationMs, aborted: true });
    else emit('chat-error', { message: e.message, durationMs });
  } finally {
    controllers.delete(id);
  }
}

// ---------- Ferramentas: Codex e Antigravity ----------
function friendlyCodexError(m) {
  if (/usage limit/i.test(m)) {
    const at = m.match(/try again at ([^.]+?)\.?$/i) || m.match(/try again at ([\d:]+ ?[AP]M)/i);
    return `O Codex atingiu o limite de uso do seu plano do ChatGPT${at ? ` (libera às ${at[1]})` : ''}.`;
  }
  if (/not logged in|unauthorized|401/i.test(m)) return 'O Codex não está logado. Abra o app do Codex e entre com sua conta.';
  return m;
}

function runCodex({ tarefa, pasta, writable }, onStatus, callId, owner) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const exe = findCodexExe();
    if (!exe) return resolve({ ok: false, text: 'Não achei o Codex instalado neste PC.', durationMs: Date.now() - startTime });
    const cwd = pasta;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemi-codex-'));
    const tmpOut = path.join(tmpDir, 'response.txt');
    const args = ['exec', '--json', '--skip-git-repo-check', '--ephemeral', '-s', writable ? 'workspace-write' : 'read-only', '-C', cwd, '-o', tmpOut, '--', String(tarefa || '')];

    let child;
    try {
      child = spawn(exe, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (e) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return resolve({ ok: false, text: e.message, durationMs: Date.now() - startTime });
    }
    child.owner = owner;
    children.set(callId, child);

    let buf = '', lastMsg = '', errMsg = '', stderr = '';
    const timer = setTimeout(() => { errMsg = 'Tempo esgotado (10 min).'; try { child.kill(); } catch {} }, 10 * 60 * 1000);

    child.stdout.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const line of lines) {
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        if (ev.type === 'error') errMsg = ev.message || errMsg;
        else if (ev.type === 'turn.failed') errMsg = ev.error?.message || errMsg;
        else if (ev.item) {
          const it = ev.item;
          if (it.type === 'command_execution' && ev.type === 'item.started') onStatus(`⚙️ [${elapsed}s] ${String(it.command || '').slice(0, 90)}`);
          else if (it.type === 'file_change') onStatus(`✏️ [${elapsed}s] editando arquivos…`);
          else if (it.type === 'reasoning') onStatus(`🧠 [${elapsed}s] pensando…`);
          else if (it.type === 'agent_message' && it.text) lastMsg = it.text;
        }
      }
    });
    child.stderr.on('data', (d) => { stderr = (stderr + d.toString()).slice(-4000); });
    child.on('error', (e) => { errMsg = e.message; });
    child.on('close', (code) => {
      clearTimeout(timer);
      children.delete(callId);
      const durationMs = Date.now() - startTime;
      try {
        if (fs.existsSync(tmpOut)) {
          const t = fs.readFileSync(tmpOut, 'utf8').trim();
          if (t) lastMsg = t;
          fs.unlinkSync(tmpOut);
        }
      } catch {}
      fs.rmSync(tmpDir, { recursive: true, force: true });
      if (code === 0 && lastMsg && !errMsg) return resolve({ ok: true, text: lastMsg, durationMs });
      const m = errMsg || stderr.trim().split(/\r?\n/).filter((l) => !/Reading additional input/.test(l)).pop() || `O Codex saiu com código ${code}.`;
      resolve({ ok: false, text: friendlyCodexError(m), durationMs });
    });
  });
}

function runAntigravity({ tarefa, pasta }) {
  const startTime = Date.now();
  const ag = findAntigravity();
  if (!ag) return { ok: false, text: 'Não achei o Antigravity IDE instalado neste PC.', durationMs: Date.now() - startTime };
  const folder = validFolder(pasta) ? pasta : null;
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
  delete env.VSCODE_DEV;
  try {
    const child = spawn(ag.exe, [ag.cli, 'chat', '-m', 'agent', String(tarefa || '')], {
      cwd: folder || os.homedir(),
      env,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', () => {});
    child.unref();
    return {
      ok: true,
      text: `Abri o Antigravity IDE${folder ? ` em ${folder}` : ''} com a tarefa. O agente de lá continua o trabalho por você 🚀`,
      durationMs: Date.now() - startTime,
    };
  } catch (e) {
    return { ok: false, text: e.message, durationMs: Date.now() - startTime };
  }
}

const executeTool = createToolExecutor({
  confirm: async ({ name, tarefa, pasta, writable }, { owner } = {}) => {
    const record = recordForSender(owner);
    const parent = record?.window;
    if (!parent || parent.isDestroyed()) return false;
    record.confirmingTool = true;
    parent.setIgnoreMouseEvents(false);
    try {
      const access = name === 'abrir_antigravity'
        ? 'O Antigravity usa as permissões próprias do IDE e pode alterar arquivos e executar comandos.'
        : writable ? 'O Codex poderá editar arquivos e executar comandos nesta pasta.' : 'Codex em modo somente leitura.';
      const result = await dialog.showMessageBox(parent, {
        type: 'warning', title: 'Autorizar tarefa no computador',
        message: name === 'chamar_codex' ? 'Executar esta tarefa com o Codex?' : 'Enviar esta tarefa ao Antigravity?',
        detail: 'PASTA: ' + pasta + '\n\n' + access + '\n\nTAREFA:\n' + tarefa,
        buttons: ['Cancelar', 'Executar tarefa'], defaultId: 0, cancelId: 0, noLink: true,
      });
      return result.response === 1;
    } finally {
      record.confirmingTool = false;
      if (!parent.isDestroyed()) parent.setIgnoreMouseEvents(record.ignoringMouse, { forward: true });
    }
  },
  runCodex, runAntigravity,
});

async function handleToolCall(sender, petId, id, callId, name, args) {
  const emit = (ch, data = {}) => { if (!sender.isDestroyed()) sender.send(ch, { petId, id, callId, ...data }); };
  emit('tool-request', { name, args });
  const r = await executeTool(name, args, {
    defaultFolder: config.settings.defaultFolder, owner: sender,
    signal: controllers.get(id)?.signal,
    onStatus: (text) => emit('tool-status', { text }), callId,
  });
  emit('tool-result', r);
  return r.ok ? { resultado: r.text.slice(0, 6000) } : { erro: r.text };
}

// ---------- IPC ----------
ipc.on('set-ignore', (event, ignore) => {
  const record = recordForSender(event.sender);
  if (!record || typeof ignore !== 'boolean') return;
  record.ignoringMouse = ignore;
  if (!record.confirmingTool) record.window.setIgnoreMouseEvents(ignore, { forward: true });
});
ipc.on('focus', (event) => recordForSender(event.sender)?.window.focus());

ipc.handle('get-config', (event) => ({
  viewport: currentViewport(recordForSender(event.sender)),
  hasKey: !!geminiApiKey(),
  hasOpenaiKey: !!openaiApiKey(),
  hasCodex: !!findCodexExe(),
  hasAntigravity: !!findAntigravity(),
  gemiSkin: config.gemiSkin,
  codexSkin: config.codexSkin,
  claudeSkin: config.claudeSkin || 'fox',
  sparkySkin: config.sparkySkin || 'slime',
  petCount: config.petCount || 2,
  state: config.state || null,
  settings: config.settings,
  appContext: currentAppContext,
}));

ipc.on('set-pet-count', (_e, cnt) => {
  config.petCount = Math.max(1, Math.min(4, Math.floor(Number(cnt) || 2)));
  saveConfig();
  pushViewports();
});

ipc.on('save-state', (_e, s) => { config.state = { ...config.state, ...cleanState(s) }; saveConfig(); });

ipc.handle('set-key', (_e, keys) => {
  if (!isRecord(keys)) throw new Error('Chaves inválidas.');
  const updated = { ...config };
  for (const [input, field] of [['geminiKey', 'apiKey'], ['openaiKey', 'openaiKey']]) {
    if (keys[input] === undefined) continue;
    if (typeof keys[input] !== 'string' || keys[input].length > 4096) throw new Error('Chave inválida.');
    updated[field] = keys[input].trim();
  }
  configStore.save(updated);
  config = updated;
  const status = { hasKey: !!geminiApiKey(), hasOpenaiKey: !!openaiApiKey() };
  broadcast('key-status', status);
  return status;
});

ipc.on('set-skin', (_e, payload) => {
  if (!isRecord(payload)) return;
  const { petId, skin } = payload;
  if (!PET_IDS.includes(petId) || !SKINS.includes(skin)) return;
  if (petId === 'gemi') config.gemiSkin = skin;
  else if (petId === 'codex') config.codexSkin = skin;
  else if (petId === 'claude') config.claudeSkin = skin;
  else if (petId === 'sparky') config.sparkySkin = skin;
  saveConfig();
  pushViewports();
});

ipc.on('set-settings', (_e, s) => {
  config.settings = { ...config.settings, ...cleanSettings(s) };
  saveConfig();
  pushSettings();
});

ipc.handle('pick-folder', async (event) => {
  const r = await dialog.showOpenDialog(recordForSender(event.sender).window, { title: 'Escolha a pasta do projeto', properties: ['openDirectory'] });
  return r.canceled ? '' : r.filePaths[0] || '';
});

ipc.on('save-session', (event, payload) => {
  if (!isRecord(payload) || !validChat({ petId: payload.petId, id: 'session', history: payload.history }) || !currentViewport(recordForSender(event.sender)).visiblePetIds.includes(payload.petId)) return;
  sessionHistory.set(payload.petId, payload.history.slice(-30));
});

ipc.handle('move-pet', (event, payload) => {
  const record = recordForSender(event.sender);
  if (!isRecord(payload) || !currentViewport(record).visiblePetIds.includes(payload.petId)) throw new Error('Pet indisponível nesta tela.');
  const currentIndex = displays.findIndex((display) => display.id === record.displayId);
  const next = payload.displayId || displays[(currentIndex + 1) % displays.length].id;
  movePet(payload.petId, String(next), payload.state);
  return { displayId: String(next) };
});

ipc.handle('gather-pets', (event) => {
  const record = recordForSender(event.sender);
  config.petCount = Math.max(2, config.petCount);
  for (const id of PET_IDS.slice(0, config.petCount)) {
    if (petAssignments(displays, config.petCount, config.petDisplays)[id] !== record.displayId) cancelPetRequests(id);
    config.petDisplays[id] = record.displayId;
  }
  saveConfig(); pushViewports();
  return currentViewport(record);
});

ipc.on('open-external', (_e, url) => { if (allowedExternalURL(url)) return shell.openExternal(url); });
ipc.on('tray-icon', (_e, dataUrl) => {
  if (typeof dataUrl === 'string' && dataUrl.length <= 100000 && dataUrl.startsWith('data:image/png;base64,')) createTray(dataUrl);
});

ipc.on('chat-send', (e, payload) => {
  if (!validChat(payload) || controllers.has(payload.id) || controllers.size >= 8 || !currentViewport(recordForSender(e.sender)).visiblePetIds.includes(payload.petId)) return;
  sessionHistory.set(payload.petId, payload.history.slice(-30));
  const okey = openaiApiKey();
  if (payload.petId === 'codex' && okey) return openaiChat(e.sender, payload, okey);
  return geminiChat(e.sender, payload);
});

ipc.on('chat-abort', (event, id) => {
  if (!validId(id)) return;
  const controller = controllers.get(id);
  if (controller?.owner !== event.sender) return;
  controller.abort();
  for (const [callId, child] of children) {
    if (child.owner === event.sender && (callId === id || callId.startsWith(id + '-'))) { try { child.kill(); } catch {} }
  }

});

// Todos os atalhos passam pela mesma confirmação nativa que as chamadas da IA.
ipc.on('tool-run', async (e, payload) => {
  if (!isRecord(payload) || !PET_IDS.includes(payload.petId) || !validId(payload.id) || !validId(payload.callId)) return;
  const { petId, id, callId, name, args } = payload;
  if (controllers.has(id) || controllers.size >= 8) return;
  const ac = new AbortController();
  ac.owner = e.sender;
  ac.petId = petId;
  controllers.set(id, ac);
  try { await handleToolCall(e.sender, petId, id, callId, name, args); }
  finally { controllers.delete(id); }
});

// ---------- Ciclo de vida ----------
app.on('second-instance', () => {
  log('Second instance triggered!');
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.setAlwaysOnTop(true, 'screen-saver');
    send('chat', 'gemi');
  }
});

function onReady() {
  log('onReady fired! Loading config and creating window...');
  try {
    loadConfig();
    syncDisplays();
    screen.on('display-metrics-changed', scheduleDisplaySync);
    screen.on('display-added', scheduleDisplaySync);
    screen.on('display-removed', scheduleDisplaySync);
    topmostTimer = setInterval(() => { for (const { window } of windows.values()) if (!window.isDestroyed()) window.setAlwaysOnTop(true, 'screen-saver'); }, 10000);
    startWindowWatcher();
    checkRunningApps();
    appWatcherTimer = setInterval(checkRunningApps, 30000);
    log('onReady finished initialization successfully!');
  } catch (err) {
    log('Error inside onReady:', err && err.stack ? err.stack : err);
    dialog.showErrorBox('Não foi possível iniciar Gemi Pets', err.message);
    app.quit();
  }
}

log('At lifecycle setup. app.isReady():', app.isReady());
if (app.isReady()) {
  onReady();
} else {
  app.once('ready', onReady);
}

const cleanup = () => {
  quitting = true;
  clearTimeout(topologyTimer);
  if (topmostTimer) clearInterval(topmostTimer);
  for (const ac of controllers.values()) ac.abort();
  if (appWatcherTimer) { clearInterval(appWatcherTimer); appWatcherTimer = null; }
  if (watcherProc) { try { watcherProc.kill(); } catch {} }
  for (const child of children.values()) { try { child.kill(); } catch {} }
};
app.on('window-all-closed', () => { cleanup(); app.quit(); });
app.on('before-quit', cleanup);
