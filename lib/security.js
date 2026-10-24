function isTrustedSender(event, win, rendererURL) {
  try {
    return !!win && !win.isDestroyed() && event.sender === win.webContents &&
      event.senderFrame === win.webContents.mainFrame && event.senderFrame.url === rendererURL;
  } catch { return false; }
}

function createTrustedIpc(ipcMain, getWindow, rendererURL, onError) {
  const trusted = (event) => isTrustedSender(event, getWindow(event), rendererURL);
  return {
    on(channel, listener) {
      ipcMain.on(channel, (event, ...args) => {
        if (!trusted(event)) return;
        try { return Promise.resolve(listener(event, ...args)).catch(onError); } catch (error) { onError(error); }
      });
    },
    handle(channel, listener) {
      ipcMain.handle(channel, (event, ...args) => {
        if (!trusted(event)) throw new Error('Origem IPC não autorizada.');
        return listener(event, ...args);
      });
    },
  };
}

function hardenWebContents(contents) {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event) => event.preventDefault());
  contents.on('will-frame-navigate', (event) => event.preventDefault());
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  contents.session.setPermissionCheckHandler(() => false);
}

const PET_IDS = ['gemi', 'codex', 'claude', 'sparky'];
const SKINS = ['robot', 'cat', 'ghost', 'slime', 'fox', 'duck'];
const validId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

function cleanSettings(value) {
  if (!isRecord(value)) throw new Error('Configurações inválidas.');
  const result = {};
  for (const key of ['sound', 'autoHide', 'autoSleep', 'autoEat', 'chatter']) {
    if (typeof value[key] === 'boolean') result[key] = value[key];
  }
  if (Number.isFinite(value.volume)) result.volume = Math.max(0, Math.min(1, value.volume));
  if (typeof value.defaultFolder === 'string' && value.defaultFolder.length <= 4096) result.defaultFolder = value.defaultFolder;
  return result;
}

function cleanState(value) {
  if (!isRecord(value)) throw new Error('Estado inválido.');
  const result = {};
  for (const id of PET_IDS) {
    if (!isRecord(value[id])) continue;
    result[id] = {};
    for (const stat of ['food', 'fun', 'energy']) {
      if (Number.isFinite(value[id][stat])) result[id][stat] = Math.max(0, Math.min(100, value[id][stat]));
    }
  }
  return result;
}

function validChat(value) {
  if (!isRecord(value) || !PET_IDS.includes(value.petId) || !validId(value.id) || !Array.isArray(value.history)) return false;
  if (value.state !== undefined && !isRecord(value.state)) return false;
  if (!value.history.every((message) => isRecord(message) && ['user', 'model'].includes(message.role) &&
    Array.isArray(message.parts) && message.parts.length <= 100 && message.parts.every((part) =>
      isRecord(part) && (typeof part.text === 'string' || isRecord(part.functionCall) || isRecord(part.functionResponse))))) return false;
  try { return value.history.length <= 200 && JSON.stringify(value).length <= 200000; } catch { return false; }
}

function allowedExternalURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      ['aistudio.google.com', 'platform.openai.com'].includes(url.hostname);
  } catch { return false; }
}

module.exports = { isTrustedSender, createTrustedIpc, hardenWebContents, PET_IDS, SKINS, validId, isRecord, cleanSettings, cleanState, validChat, allowedExternalURL };
