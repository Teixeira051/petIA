const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { hardenWebContents } = require('../lib/security');
const { createConfigStore } = require('../lib/config-store');
app.setPath('userData', process.argv.at(-1));
app.disableHardwareAcceleration();
const errors = [];
let directCalls = 0;
ipcMain.handle('get-config', () => ({ petCount: 1, settings: { sound: false }, appContext: { spotify: false, antigravity: false } }));
const testViewport = { displayId: 'test-primary', label: 'Tela de teste', bounds: { x: 0, y: 0, width: 1200, height: 700 }, workArea: { x: 0, y: 0, width: 1200, height: 700 }, resolution: { width: 1200, height: 700 }, scaleFactor: 1, totalPetCount: 4, visiblePetIds: ['gemi', 'codex', 'claude', 'sparky'], displays: [{ id: 'test-primary' }, { id: 'test-secondary' }] };
ipcMain.handle('gather-pets', () => testViewport);
ipcMain.handle('set-key', () => ({ hasKey: false, hasOpenaiKey: false }));
for (const channel of ['set-ignore', 'focus', 'save-state', 'set-skin', 'set-pet-count', 'set-settings', 'open-external', 'tray-icon', 'chat-abort', 'save-session']) ipcMain.on(channel, () => {});
ipcMain.on('chat-send', () => { errors.push('Não deveria haver chamadas de rede neste teste.'); });
ipcMain.on('tool-run', (event, data) => {
  directCalls++;
  event.sender.send('tool-request', data);
  event.sender.send('tool-result', { ...data, ok: false, canceled: true, text: 'Cancelado no teste.' });
});
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1200, height: 700, webPreferences: { preload: path.join(__dirname, '../preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  hardenWebContents(win.webContents);
  win.webContents.on('console-message', (details) => { if (details.level === 'error' || details.level === 3) errors.push(details.message); });
  win.webContents.on('preload-error', (_event, _file, error) => errors.push(error.message));
  win.webContents.on('render-process-gone', (_event, details) => errors.push(JSON.stringify(details)));
  try {
    await win.loadFile(path.join(__dirname, '../renderer/index.html'));
    const result = await win.webContents.executeJavaScript(`(async () => {
      const core = await import('./core.js');
      const pets = await import('./pets.js');
      const games = await import('./games.js');
      const chat = await import('./chat.js');
      const skins = await import('./skins.js');
      const renderer = await import('./renderer.js');
      const zeroUsage = renderer.formatUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedTokens: 0, thoughtsTokens: 0, reasoningTokens: 0, requests: 1, estimated: false });
      if (zeroUsage.tokensLabel !== '0' || zeroUsage.estimated || !zeroUsage.details.includes('0 ent.')) throw Error('Uso real zero virou estimativa');
      const actualUsage = renderer.formatUsage({ promptTokens: 100, completionTokens: 20, totalTokens: 120, cachedTokens: 60, thoughtsTokens: 0, reasoningTokens: 4, requests: 2, estimated: false });
      if (actualUsage.totalTokens !== 120 || !actualUsage.details.includes('cache 60') || !actualUsage.details.includes('2 chamadas')) throw Error('Contagem agregada ou cache incorretos');
      if (renderer.formatUsage(null).summary !== 'Uso não informado' || !renderer.formatUsage({ totalTokens: 2, estimated: true }).tokensLabel.startsWith('~')) throw Error('Uso desconhecido/estimado não foi identificado');
      const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      await pause(300);
      if (typeof require !== 'undefined' || typeof process !== 'undefined') throw Error('Node exposto ao renderer');
      if (core.pets.length !== 1) throw Error('Quantidade inicial incorreta: ' + core.pets.length);
      window.gemi.on('app-context', () => {});
      for (const count of [4, 1, 2, 3, 4]) { pets.applyPetCount(count); await pause(20); if (core.pets.length !== count) throw Error('Contagem de pets incorreta'); }
      for (const skin of ['robot', 'cat', 'ghost', 'slime', 'fox', 'duck']) {
        core.pets[0].skin = skin;
        skins.drawPet(core.ctx, core.pets[0], { expr: 'happy', time: 0 });
      }
      for (const start of [games.startVolley, games.startTag, games.startKeepUp, games.startJokenpo, games.startDance, games.startHideSeek]) { start(); await pause(150); games.stopCurrentGame(); }
      const viewport = { displayId: 'test-secondary', label: 'Tela 2', bounds: { x: -2560, y: 0, width: 2560, height: 1440 }, workArea: { x: -2560, y: 0, width: 2560, height: 1400 }, resolution: { width: 3840, height: 2160 }, scaleFactor: 1.5, totalPetCount: 4, displays: [{ id: 'test-primary' }, { id: 'test-secondary' }] };
      renderer.acceptViewport({ ...viewport, visiblePetIds: [] });
      await pause(100);
      if (core.pets.length) throw Error('Pets duplicados em monitor vazio');
      renderer.acceptViewport({ ...viewport, visiblePetIds: ['codex', 'sparky'], skins: { codex: 'ghost' }, state: { codex: { food: 41, fun: 50, energy: 70 } }, histories: { codex: [{ role: 'user', parts: [{ text: '<img src=x> conversa anterior' }] }] } });
      await pause(50);
      if (core.pets.map((pet) => pet.id).join(',') !== 'codex,sparky') throw Error('Identidade incorreta ao mudar de tela');
      if (core.pets[0].skin !== 'ghost' || core.pets[0].stats.food !== 41) throw Error('Skin ou estado não acompanharam o pet');
      const restoredLog = chat.getChatElements('codex').log;
      if (!restoredLog.textContent.includes('conversa anterior') || restoredLog.querySelector('img')) throw Error('Histórico não restaurado com escape');
      if (document.getElementById('act-monitor').hidden || !document.getElementById('hud-display-info').textContent.includes('3840')) throw Error('Controle do monitor indisponível');
      await renderer.startGame('tag');
      if (core.pets.length !== 4 || core.world.activeGame !== 'tag') throw Error('Jogo não reuniu os pets nesta tela');
      games.stopCurrentGame();
      const escaped = chat.renderMarkdown('<img src=x onerror="alert(1)"> **ok**');
      if (escaped.includes('<img') || !escaped.includes('<strong>ok</strong>')) throw Error('Falha ao escapar HTML');
      chat.openPetChat('gemi');
      chat.executeToolDirect('gemi', 'chamar_codex', '<img src=x> apenas teste');
      await pause(100);
      const card = document.querySelector('.tool-card');
      if (!card || card.querySelector('img') || !card.textContent.includes('Cancelado')) throw Error('Card de ferramenta incorreto');
      if (core.world.frameCount < 2) throw Error('Animação não iniciou');
      return { pets: core.pets.length, frames: core.world.frameCount, games: 6, skins: 6 };
    })()`);
    assert.equal(directCalls, 1);
    // Exercita o cofre real do Electron; as chaves abaixo são dados fictícios do teste.
    const file = path.join(process.argv.at(-1), 'secure-test.json');
    const store = createConfigStore(file, safeStorage);
    store.save({ apiKey: 'gemini-test-secret', openaiKey: 'openai-test-secret' });
    const persisted = fs.readFileSync(file, 'utf8');
    assert.ok(!persisted.includes('gemini-test-secret') && !persisted.includes('openai-test-secret'));
    assert.equal(store.load().apiKey, 'gemini-test-secret');
    assert.deepEqual(errors, []);
    console.log('PASS Electron: módulos, ' + result.games + ' jogos, ' + result.skins + ' skins, chat, sandbox e cofre real.');
    app.exit(0);
  } catch (error) {
    console.error(error.stack);
    console.error(errors);
    app.exit(1);
  }
}).catch((error) => { console.error(error); app.exit(1); });
