const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = [
  'chat-chunk', 'chat-continue', 'chat-done', 'chat-error',
  'tool-request', 'tool-status', 'tool-result',
  'command', 'window-moving', 'settings', 'app-context',
  'set-pet-count', 'viewport', 'key-status',
];

contextBridge.exposeInMainWorld('gemi', {
  setIgnore: (b) => ipcRenderer.send('set-ignore', b),
  focus: () => ipcRenderer.send('focus'),
  movePet: (petId, state, displayId) => ipcRenderer.invoke('move-pet', { petId, state, displayId }),
  gatherPets: () => ipcRenderer.invoke('gather-pets'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveSession: (petId, history) => ipcRenderer.send('save-session', { petId, history }),
  saveState: (s) => ipcRenderer.send('save-state', s),
  setKey: (keys) => ipcRenderer.invoke('set-key', keys),
  setSkin: (petId, skin) => ipcRenderer.send('set-skin', { petId, skin }),
  setPetCount: (n) => ipcRenderer.send('set-pet-count', n),
  setSettings: (s) => ipcRenderer.send('set-settings', s),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  openExternal: (u) => ipcRenderer.send('open-external', u),
  setTrayIcon: (d) => ipcRenderer.send('tray-icon', d),
  chatSend: (opts) => ipcRenderer.send('chat-send', opts),
  chatAbort: (id) => ipcRenderer.send('chat-abort', id),
  toolRun: (d) => ipcRenderer.send('tool-run', d),
  on: (ch, fn) => { if (CHANNELS.includes(ch)) ipcRenderer.on(ch, (_e, d) => fn(d)); },
});
