const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { hardenWebContents } = require('../lib/security');
/* global window, document, innerWidth, innerHeight, devicePixelRatio, getComputedStyle, KeyboardEvent */

const argument = (name) => { const index = process.argv.indexOf(name); return index < 0 ? '' : process.argv[index + 1]; };
const profile = argument('--design-profile');
const outputDirectory = argument('--design-output');
const expectedScale = Number(argument('--design-scale')) || 1;
if (!profile) throw new Error('O teste exige um perfil temporário isolado.');
app.setPath('userData', profile);
app.commandLine.appendSwitch('force-device-scale-factor', String(expectedScale));
app.disableHardwareAcceleration();
const errors = [];
const viewport = {
  displayId: 'design-test', label: 'Monitor de teste',
  bounds: { x: 0, y: 0, width: 1366, height: 768 },
  workArea: { x: 0, y: 0, width: 1366, height: 728 },
  resolution: { width: Math.round(1366 * expectedScale), height: Math.round(768 * expectedScale) },
  scaleFactor: expectedScale, totalPetCount: 4, visiblePetIds: ['gemi', 'codex', 'claude', 'sparky'],
  displays: [{ id: 'design-test' }, { id: 'design-secondary' }],
};
ipcMain.handle('get-config', () => ({
  petCount: 4, viewport, hasKey: true, hasOpenaiKey: true,
  settings: { sound: false, volume: 0, chatter: false, autoHide: false, autoSleep: false, autoEat: false },
  appContext: { spotify: false, antigravity: false },
}));
ipcMain.handle('set-key', () => ({ hasKey: true, hasOpenaiKey: true }));
ipcMain.handle('pick-folder', () => '');
ipcMain.handle('gather-pets', () => viewport);
ipcMain.handle('move-pet', () => ({ displayId: 'design-secondary' }));
for (const channel of ['set-ignore', 'focus', 'save-state', 'set-skin', 'set-pet-count', 'set-settings', 'tray-icon', 'chat-abort', 'save-session']) ipcMain.on(channel, () => {});
for (const channel of ['chat-send', 'tool-run', 'open-external']) ipcMain.on(channel, () => errors.push('Ação externa inesperada: ' + channel));

async function bootstrap() {
  const core = await import('./core.js');
  const chat = await import('./chat.js');
  const ui = await import('./ui.js');
  const games = await import('./games.js');
  const portraits = await import('./portraits.js');
  await import('./renderer.js');
  await document.fonts.ready;

  const check = (value, message) => { if (!value) throw new Error(message); };
  async function until(predicate, message) {
    const deadline = performance.now() + 4000;
    while (!predicate()) {
      if (performance.now() > deadline) throw new Error(message);
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
  }
  const bounds = (element) => {
    check(element, 'Elemento do teste ausente.');
    const box = element.getBoundingClientRect();
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
  };
  function inside(element, name, container = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }) {
    const box = bounds(element);
    check(box.width > 0 && box.height > 0 && box.left >= container.left - 1 && box.top >= container.top - 1 && box.right <= container.right + 1 && box.bottom <= container.bottom + 1,
      name + ' fora dos limites: ' + JSON.stringify({ box, container, viewport: [innerWidth, innerHeight] }));
    return box;
  }
  async function painted(element) {
    ui.positionUI(performance.now());
    await until(() => !element.getAnimations().some((animation) => animation.playState === 'running'), 'A animação do painel não terminou.');
    ui.positionUI(performance.now());
    portraits.refreshPortraits();
  }
  function reset() {
    document.activeElement?.blur();
    core.hud.scrollTop = 0;
    games.stopCurrentGame();
    for (const id of ['gemi', 'codex', 'claude', 'sparky']) {
      chat.closePetChat(id, true);
      chat.getChatElements(id).setup.classList.add('hidden');
    }
    document.getElementById('skin-modal').classList.add('hidden');
    document.getElementById('games-modal').classList.add('hidden');
    ui.hideHud();
    core.world.hoveredPet = null;
    for (const pet of core.pets) {
      pet.timer = 1e9;
      pet.nextRunAt = Infinity;
      pet.nextHideAt = Infinity;
      pet.say = null;
      pet.x = Math.min(innerWidth - 40, Math.max(40, pet.x));
    }
  }
  function portraitPixels() {
    const canvases = [...document.querySelectorAll('canvas[data-pet-portrait],canvas[data-skin-portrait]')].filter((canvas) => {
      const style = getComputedStyle(canvas);
      return style.visibility === 'visible' && canvas.getBoundingClientRect().width > 0 && canvas.closest('.chat.open,#hud.show,#skin-modal:not(.hidden)');
    });
    check(canvases.length > 0, 'Nenhum retrato visível.');
    for (const canvas of canvases) {
      check(canvas.width === Math.round(canvas.clientWidth * devicePixelRatio) && canvas.height === Math.round(canvas.clientHeight * devicePixelRatio), 'Retrato não acompanha o DPI.');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      check(pixels.some((value, index) => index % 4 === 3 && value > 0), 'Retrato vazio: ' + (canvas.dataset.petPortrait || canvas.dataset.skinPortrait));
    }
  }
  function addMessage(log, role, text) {
    const message = document.createElement('div');
    message.className = 'msg ' + role;
    if (role === 'user') message.textContent = text; else message.innerHTML = chat.renderMarkdown(text);
    log.appendChild(message);
    return message;
  }
  function assertChat(elements) {
    const panel = inside(elements.root, 'Chat');
    for (const selector of ['.chat-head', '.btn-close', '.chat-form', 'textarea', '.send']) inside(elements.root.querySelector(selector), selector, panel);
    check(elements.root.scrollWidth <= elements.root.clientWidth + 1, 'O painel de chat tem overflow horizontal.');
    check(elements.log.scrollWidth <= elements.log.clientWidth + 1, 'Mensagens alargaram o chat.');
  }

  await until(() => core.pets.length === 4 && core.world.frameCount > 1, 'O renderer não terminou de iniciar.');
  window.__design = {
    async sized(width, height, scale) {
      await until(() => Math.abs(innerWidth - width) <= 1 && Math.abs(innerHeight - height) <= 1 && core.world.W === innerWidth && core.world.H === innerHeight, 'A janela não recebeu o tamanho solicitado.');
      check(Math.abs(devicePixelRatio - scale) < .01, 'DPI diferente do solicitado: ' + devicePixelRatio);
    },
    async layout(width, height, scale) {
      await until(() => Math.abs(innerWidth - width) <= 1 && Math.abs(innerHeight - height) <= 1 && core.world.W === innerWidth && core.world.H === innerHeight, 'A janela não recebeu o tamanho solicitado.');
      check(Math.abs(devicePixelRatio - scale) < .01, 'DPI diferente do solicitado: ' + devicePixelRatio);
      check(core.cvs.width === Math.round(innerWidth * devicePixelRatio) && core.cvs.height === Math.round(innerHeight * devicePixelRatio), 'Canvas da área de trabalho não acompanha o DPI.');
      reset();
      check(getComputedStyle(document.body).backgroundColor === 'rgba(0, 0, 0, 0)' && getComputedStyle(document.documentElement).backgroundColor === 'rgba(0, 0, 0, 0)', 'O produto deixou de ser transparente.');
      for (const [x, y] of [[2, 2], [innerWidth / 2, 2], [innerWidth - 2, 2]]) {
        const target = document.elementFromPoint(x, y);
        check([core.cvs, document.body, document.documentElement].includes(target), 'Decoração está bloqueando o desktop: ' + target?.tagName + '#' + target?.id);
      }
      for (const panel of document.querySelectorAll('.chat:not(.open),#hud:not(.show)')) check(getComputedStyle(panel).visibility === 'hidden', 'Painel fechado permanece visível para foco.');
      const hiddenInput = chat.getChatElements('codex').input;
      hiddenInput.focus();
      check(document.activeElement !== hiddenInput, 'Um chat fechado recebeu foco.');

      const pet = core.pets.find((item) => item.id === 'gemi');
      pet.x = innerWidth / 2;
      const elements = chat.getChatElements('gemi');
      elements.log.replaceChildren();
      chat.openPetChat('gemi');
      await painted(elements.root);
      assertChat(elements);
      portraitPixels();
      elements.input.focus();
      check(document.activeElement === elements.input, 'O compositor não recebe foco.');
      for (let index = 0; index < 14; index++) addMessage(elements.log, index % 2 ? 'model' : 'user', 'Mensagem longa de teste ' + index + ': ' + 'conteúdo legível '.repeat(10));
      addMessage(elements.log, 'model', '```js\nconst exemplo = "' + 'x'.repeat(700) + '";\n```');
      const card = document.createElement('div');
      card.className = 'msg tool-card';
      const output = document.createElement('div');
      output.className = 'tool-output';
      output.textContent = 'Resultado de teste: ' + 'pasta/arquivo-sem-espacos/'.repeat(80);
      card.appendChild(output);
      elements.log.appendChild(card);
      await painted(elements.root);
      assertChat(elements);
      check(elements.log.scrollHeight > elements.log.clientHeight, 'O histórico longo não criou rolagem.');
      elements.log.scrollTop = elements.log.scrollHeight;
      check(elements.log.scrollTop > 0, 'O histórico não pode ser rolado.');

      elements.root.querySelector('.btn-key').click();
      await painted(elements.root);
      assertChat(elements);
      check(!elements.setup.classList.contains('hidden') && elements.setup.clientHeight > 0, 'Configuração da chave não abriu.');
      elements.setup.scrollTop = elements.setup.scrollHeight;
      inside(elements.setup.querySelector('.btn-save-key'), 'Salvar chave');
      elements.root.querySelector('.btn-cancel-key').click();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      check(!elements.root.classList.contains('open'), 'Escape não fechou o chat.');

      for (const x of [28, innerWidth - 28]) {
        pet.x = x; pet.y = core.ground();
        ui.showHud(pet); core.world.hudHideAt = Infinity;
        await painted(core.hud);
        inside(core.hud, 'HUD na borda');
        core.hud.scrollTop = core.hud.scrollHeight;
        inside(document.getElementById('act-monitor'), 'Controle de outra tela');
        portraitPixels();
        ui.hideHud();
      }
      core.world.hoveredPet = pet;
      for (const [button, panel, close] of [['act-games', 'games-modal', 'btn-close-games'], ['btn-skin-picker', 'skin-modal', 'btn-close-skin']]) {
        document.getElementById(button).click();
        const modal = document.getElementById(panel);
        await painted(modal);
        check(!modal.classList.contains('hidden'), 'Modal não abriu: ' + panel);
        const box = inside(modal, panel);
        inside(document.getElementById(close), 'Fechar ' + panel, box);
        check(modal.scrollWidth <= modal.clientWidth + 1, 'Overflow horizontal no modal ' + panel);
        if (panel === 'skin-modal') portraitPixels();
        document.getElementById(close).click();
        check(modal.classList.contains('hidden'), 'Modal não fechou: ' + panel);
      }
      reset();
      return { width: innerWidth, height: innerHeight, scale: devicePixelRatio };
    },
    async scene(name) {
      reset();
      const gemi = core.pets.find((pet) => pet.id === 'gemi');
      gemi.x = name === 'overview' ? 235 : innerWidth / 2;
      const welcome = chat.getChatElements('gemi');
      welcome.log.replaceChildren();
      if (name === 'overview' || name === 'narrow') {
        chat.openPetChat('gemi'); gemi.y = core.chatPetY();
        await painted(welcome.root);
      }
      if (name === 'overview') {
        const codex = core.pets.find((pet) => pet.id === 'codex');
        codex.x = 702;
        const conversation = chat.getChatElements('codex');
        conversation.log.replaceChildren();
        chat.openPetChat('codex'); codex.y = core.chatPetY();
        conversation.log.replaceChildren();
        addMessage(conversation.log, 'user', 'Pode me ajudar a organizar as ideias do meu projeto?');
        addMessage(conversation.log, 'model', 'Claro! Vamos começar pelo que você quer construir.\n\n**Me conte o objetivo e o que já está funcionando.** Posso ajudar a planejar o próximo passo ou chamar o Codex para trabalhar com você.');
        const card = document.createElement('div');
        card.className = 'msg tool-card codex';
        card.innerHTML = '<strong>Codex</strong><div class="tool-status-text">Pronto para receber sua próxima tarefa.</div>';
        conversation.log.appendChild(card);
        await painted(conversation.root);
        const raposo = core.pets.find((pet) => pet.id === 'claude');
        raposo.x = innerWidth - 176; raposo.y = core.ground();
        ui.showHud(raposo); core.world.hudHideAt = Infinity;
        await painted(core.hud);
      } else if (name === 'skins' || name === 'games') {
        core.world.hoveredPet = gemi;
        document.getElementById(name === 'skins' ? 'btn-skin-picker' : 'act-games').click();
        await painted(document.getElementById(name === 'skins' ? 'skin-modal' : 'games-modal'));
      }
      portraits.refreshPortraits();
      return { width: innerWidth, height: innerHeight, scale: devicePixelRatio };
    },
  };
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    width: 1366, height: 728, useContentSize: true, minWidth: 1, minHeight: 1,
    webPreferences: { preload: path.join(__dirname, '../preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: { deviceScaleFactor: expectedScale } },
  });
  hardenWebContents(win.webContents);
  win.webContents.setAudioMuted(true);
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => {
    errors.push('Requisição externa inesperada no renderer.'); callback({ cancel: true });
  });
  win.webContents.on('console-message', (details) => { if (details.level === 'error' || details.level === 3) errors.push(details.message); });
  win.webContents.on('preload-error', (_event, _file, error) => errors.push(error.message));
  win.webContents.on('render-process-gone', (_event, details) => errors.push(JSON.stringify(details)));
  const sizes = [[1366, 728], [800, 560], [910, 470], [360, 580]];
  const results = [];
  async function screenshot(name, width, height) {
    win.setContentSize(width, height);
    await win.webContents.executeJavaScript(`window.__design.sized(${width},${height},${expectedScale})`);
    await win.webContents.executeJavaScript(`window.__design.scene(${JSON.stringify(name)})`);
    // Only the test capture receives a neutral desktop. Product CSS stays transparent.
    const style = await win.webContents.insertCSS('html { background: #e8edf2 !important; }');
    try {
      await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      await new Promise((resolve, reject) => {
        const finish = () => { clearTimeout(timer); win.webContents.removeListener('paint', painted); resolve(); };
        const painted = (_event, _dirty, image) => { if (!image.isEmpty()) finish(); };
        const timer = setTimeout(() => { win.webContents.removeListener('paint', painted); reject(new Error('O renderer não produziu a captura completa.')); }, 4000);
        win.webContents.on('paint', painted);
        win.webContents.invalidate();
      });
      // Prime the software compositor before its final snapshot. This bounded
      // settling delay is capture-only; layout readiness uses explicit checks.
      await win.webContents.capturePage();
      await new Promise((resolve) => setTimeout(resolve, 350));
      await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const image = await win.webContents.capturePage();
      const file = path.join(outputDirectory, `petIA-redesign-${name}${expectedScale === 1 ? '' : '-dpi150'}.png`);
      fs.writeFileSync(file, image.toPNG());
      console.log('Screenshot: ' + file);
    } finally { await win.webContents.removeInsertedCSS(style); }
  }
  try {
    await win.loadFile(path.join(__dirname, '../renderer/index.html'));
    await win.webContents.executeJavaScript('(' + bootstrap.toString() + ')()');
    for (const [width, height] of sizes) {
      win.setContentSize(width, height);
      results.push(await win.webContents.executeJavaScript(`window.__design.layout(${width},${height},${expectedScale})`));
      console.log(`Layout ${width}x${height} DPI ${expectedScale}: OK`);
    }
    if (outputDirectory) {
      fs.mkdirSync(outputDirectory, { recursive: true });
      await screenshot('overview', 1366, 728);
      if (expectedScale === 1) {
        await screenshot('skins', 800, 560);
        await screenshot('games', 800, 560);
        await screenshot('narrow', 360, 580);
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS Electron design: ' + JSON.stringify(results));
    app.exit(0);
  } catch (error) {
    console.error(error.stack);
    console.error(errors);
    app.exit(1);
  }
}).catch((error) => { console.error(error.stack); app.exit(1); });
