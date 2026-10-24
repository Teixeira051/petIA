import { $, $$, ALL_CHARACTERS, EMOJI, FONT, SKIN_NAMES, api, applyViewport, chatState, clamp, ctx, cvs, gamesModal, ground, hud, keepupGame, mouse, particles, pets, pick, rand, resize, skinModal, volleyGame, world } from './core.js';
import { SoundSystem, syncAudioUI } from './sounds.js';
import { applyPetCount, burstHearts, confetti, currentExpr, drawBubble, drawFood, drawParticles, drawShadow, dropFood, foundPet, goSleep, notes, say, setState, startPetHide, startRun, updateDialogue, updateFood, updateParticles, updatePet, wake } from './pets.js';
import { drawPet, rr } from './skins.js';
import { startDance, startHideSeek, startJokenpo, startKeepUp, startTag, startVolley, stopCurrentGame, updateDance, updateJokenpo, updateKeepUp, updateTag, updateVolley } from './games.js';
import { closePetChat, esc, getChatElements, openPetChat, renderMarkdown, setupChat, uiIcon } from './chat.js';
import { hideHud, overPet, positionUI, updateBars, updateHit } from './ui.js';
import { refreshPortraits } from './portraits.js';

window.onerror = (msg, url, line, col, error) => {
  console.error(`[Renderer Window Error] ${msg} (${line}:${col})`, error);
};

resize();

window.addEventListener('resize', () => { resize(); refreshPortraits(); });

// Inicializa os pets só após receber a atribuição de monitor.

for (const p of pets) p.y = ground();

api.on('window-moving', () => {
  const now = performance.now();
  if (now - world.lastWindowReact < 22000) return;
  world.lastWindowReact = now;

  const reactingPet = pick(pets);
  if (!reactingPet) return;
  reactingPet.happyT = 70;
  reactingPet.armUp = 1;
  reactingPet.squash = -0.15;
  if (reactingPet.state === 'idle' || reactingPet.state === 'walk') {
    reactingPet.vy = -5.5;
  }

  if (reactingPet.id === 'gemi') {
    say(reactingPet, pick([
      'Eita! Cuidado com essa janela aí em cima! 🪟',
      'Lá vai ela voando! 🚀',
      'Quase me esmagou! 😅',
      'Arrumando a área de trabalho? 🧹',
      'Desviaaa! 🏃💨',
      'Para onde vai essa janela? 👀',
    ]), 3400);
  } else {
    say(reactingPet, pick([
      'Janela detectada em trânsito! 📐',
      'Opa, reposicionando layout em tempo real! 🪟',
      'Segura essa janela! 🚀',
      'Tô vendo esse drag and drop aí! 🧐',
      'Cálculo de colisão: 99.9% de segurança! ⚡',
      'Faxina de janelas no Windows! 💻',
    ]), 3400);
  }
});

['gemi', 'codex', 'claude', 'sparky'].forEach(setupChat);

const tokenCount = (value) => Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;

// Provider totals already include every request in this response. CLI usage is
// rendered on its own card and is never added to the chat provider's counters.
export function formatUsage(usage, fallbackText = null) {
  const estimated = usage?.estimated === true || (!usage && fallbackText !== null);
  const prefix = estimated ? '~' : '';
  const promptTokens = tokenCount(usage?.promptTokens);
  const completionTokens = tokenCount(usage?.completionTokens) ?? (!usage && fallbackText !== null ? Math.round(Array.from(fallbackText).length / 3.8) : null);
  const totalTokens = tokenCount(usage?.totalTokens);
  const outputOnly = !usage && fallbackText !== null;
  const displayTokens = totalTokens ?? (outputOnly ? completionTokens : null);
  const tokensLabel = displayTokens === null ? '—' : `${prefix}${displayTokens}`;
  const summary = totalTokens !== null ? `${tokensLabel} total` : (outputOnly ? `${tokensLabel} saída` : 'Uso não informado');
  const details = [];
  if (promptTokens !== null) details.push(`${prefix}${promptTokens} ent.`);
  if (completionTokens !== null && !outputOnly) details.push(`${prefix}${completionTokens} saída`);
  const cachedTokens = tokenCount(usage?.cachedTokens);
  if (cachedTokens !== null) details.push(`cache ${prefix}${cachedTokens}`);
  const thoughtsTokens = tokenCount(usage?.thoughtsTokens);
  const reasoningTokens = tokenCount(usage?.reasoningTokens);
  if (thoughtsTokens !== null || reasoningTokens !== null) details.push(`raciocínio ${prefix}${(thoughtsTokens ?? 0) + (reasoningTokens ?? 0)}`);
  const requests = tokenCount(usage?.requests);
  if (requests !== null) details.push(`${requests} ${requests === 1 ? 'chamada' : 'chamadas'}`);
  return { totalTokens, completionTokens, tokensLabel, summary, details, estimated, outputOnly };
}

function appendUsageChip(container, text, title = '', extraClass = '') {
  const chip = document.createElement('span');
  chip.className = `tele-badge-chip ${extraClass}`.trim();
  chip.textContent = text;
  if (title) chip.title = title;
  container.appendChild(chip);
}

function makeUsageBadge(usage, fallbackText = null, source = 'Chat') {
  const display = formatUsage(usage, fallbackText);
  const badge = document.createElement('div');
  badge.className = 'msg-telemetry-badge';
  appendUsageChip(badge, `${source} · ${display.summary}`, display.outputOnly ? 'Estimativa apenas do texto de saída; entrada e total não foram informados.' : 'Total de tokens de todas as chamadas desta resposta. Cache e raciocínio são detalhamentos, não valores a somar ao total.');
  for (const detail of display.details) appendUsageChip(badge, detail);
  return badge;
}

api.on('chat-chunk', ({ petId, id, text }) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('typing');
  el.dataset.raw = (el.dataset.raw || '') + text;

  const bodyEl = el.querySelector('.msg-body') || el;
  bodyEl.innerHTML = renderMarkdown(el.dataset.raw);

  const rawLen = el.dataset.raw.length;
  const estimatedTokens = Math.round(rawLen / 3.8);
  const elapsedSec = Math.max(0.1, (performance.now() - (chatState[petId]?.startTime ?? performance.now())) / 1000);
  const speed = Math.round(estimatedTokens / elapsedSec);

  const liveEl = document.getElementById(`live-${id}`);
  if (liveEl) {
    const tokEl = liveEl.querySelector('.live-tok-counter');
    if (tokEl) tokEl.textContent = `~${estimatedTokens} saída (~${speed} t/s)`;
  }

  const els = getChatElements(petId);
  if (els.valTokens) { els.valTokens.textContent = `~${estimatedTokens}`; els.valTokens.title = 'Estimativa da saída enquanto a resposta chega.'; }
  if (els.valSpeed) els.valSpeed.textContent = `~${speed}`;
  els.log.scrollTop = els.log.scrollHeight;
});

api.on('chat-done', ({ petId, id, turns, model, usage, durationMs, aborted, finishReason }) => {
  chatState[petId].streaming = null;
  if (!aborted && Array.isArray(turns)) chatState[petId].history.push(...turns);
  chatState[petId].history = chatState[petId].history.slice(-30);
  if (chatState[petId]?.timerId) {
    clearInterval(chatState[petId].timerId);
    chatState[petId].timerId = null;
  }
  const els = getChatElements(petId);
  if (els.telemetry) els.telemetry.classList.remove('live');

  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('typing');
    const liveEl = document.getElementById(`live-${id}`);
    if (liveEl) liveEl.remove();

    const bodyEl = el.querySelector('.msg-body') || el;
    if (!bodyEl.innerHTML.trim() && el.dataset.raw) {
      bodyEl.innerHTML = renderMarkdown(el.dataset.raw);
    }

    const totalMs = durationMs ?? Math.max(0, performance.now() - (chatState[petId]?.startTime ?? performance.now()));
    const durationSec = (totalMs / 1000).toFixed(1) + 's';
    const display = formatUsage(usage, el.dataset.raw ?? '');
    const speed = display.completionTokens === null ? '—' : `${display.estimated ? '~' : ''}${Math.round(display.completionTokens / Math.max(0.1, totalMs / 1000))}`;

    // Atualiza barra de telemetria no cabeçalho
    if (els.valTokens) { els.valTokens.textContent = display.tokensLabel; els.valTokens.title = display.outputOnly ? 'Estimativa da saída; total não informado.' : 'Total de todas as chamadas desta resposta.'; }
    if (els.valTime) els.valTime.textContent = durationSec;
    if (els.valSpeed) els.valSpeed.textContent = speed;
    const responseLimited = !aborted && ['MAX_TOKENS', 'length'].includes(finishReason);
    els.status.textContent = `${model || 'IA'} • ${aborted ? 'Interrompido' : (responseLimited ? 'Limite da resposta' : 'Concluído')} (${durationSec})`;

    // Adiciona badge de telemetria no rodapé da mensagem
    const metaBadge = makeUsageBadge(usage, el.dataset.raw ?? '');
    if (responseLimited) appendUsageChip(metaBadge, 'Peça para continuar', 'A resposta atingiu o limite de saída. Envie uma nova mensagem se quiser continuar.');
    appendUsageChip(metaBadge, durationSec, 'Tempo total, incluindo espera por ferramentas.');
    appendUsageChip(metaBadge, `${speed} tok/s`, 'Saída dividida pelo tempo total da resposta.');
    appendUsageChip(metaBadge, model || 'IA', 'Modelo', 'model-tag');
    el.appendChild(metaBadge);
    els.log.scrollTop = els.log.scrollHeight;
  }

  SoundSystem.receive();
  const pet = pets.find(p => p.id === petId);
  if (pet) {
    pet.happyT = 60;
    pet.squash = 0.12;
    SoundSystem.chirp(pet.theme === 'gemini');
  }
});

api.on('chat-error', ({ petId, id, message, durationMs, usage, providerUsage }) => {
  chatState[petId].streaming = null;
  if (chatState[petId]?.timerId) {
    clearInterval(chatState[petId].timerId);
    chatState[petId].timerId = null;
  }
  const el = document.getElementById(id);
  if (el) el.remove();
  const els = getChatElements(petId);
  if (els.telemetry) els.telemetry.classList.remove('live');

  const durStr = durationMs !== undefined && durationMs !== null ? ` Tempo decorrido: ${(durationMs / 1000).toFixed(1)}s.` : '';
  const errMsg = document.createElement('div');
  errMsg.className = 'msg model error';
  errMsg.innerHTML = `⚠️ ${renderMarkdown(message || 'Erro na comunicação com a IA.')} <small style="display:block;margin-top:4px;color:var(--muted)">${durStr} Use <strong>⚡ Codex</strong> ou <strong>🚀 Argon</strong> para solicitar uma tarefa local com confirmação.</small>`;
  if (usage ?? providerUsage) errMsg.appendChild(makeUsageBadge(usage ?? providerUsage, null, 'Chat parcial'));

  els.log.appendChild(errMsg);
  els.log.scrollTop = els.log.scrollHeight;
  els.status.textContent = `Aguardando tentativa…`;
});

api.on('tool-request', ({ petId, callId, name, args }) => {
  const existing = document.getElementById('card-' + callId);
  if (existing) { existing.dataset.toolName = name; return; }
  const card = document.createElement('div');
  card.className = 'msg tool-card';
  card.classList.toggle('argon', name === 'abrir_antigravity');
  card.id = 'card-' + callId;
  card.dataset.toolName = name;
  card.innerHTML = '<div class="tool-card-head"><div class="tool-card-brand"><span class="tool-logo">' + uiIcon(name === 'chamar_codex' ? 'code' : 'rocket') + '</span><strong>' + (name === 'chamar_codex' ? 'Codex' : 'Argon') + '</strong></div></div>' +
    '<div class="tool-task-box"><strong>Tarefa:</strong> ' + esc(args?.tarefa) + '</div>' +
    '<div class="tool-status-text">Aguardando confirmação na janela do Windows…</div><div class="tool-output hidden"></div>';
  getChatElements(petId).log.appendChild(card);
});

api.on('chat-continue', ({ id }) => {
  const el = document.getElementById(id);
  if (el) el.classList.add('typing');
});

api.on('tool-status', ({ text, callId }) => {
  const card = callId ? document.getElementById(`card-${callId}`) : null;
  if (card) {
    const st = card.querySelector('.tool-status-text');
    if (st) st.textContent = text;
  }
});

api.on('tool-result', ({ ok, text, canceled, callId, durationMs, usage }) => {
  const card = callId ? document.getElementById(`card-${callId}`) : null;
  if (card) {
    if (card._timer) {
      clearInterval(card._timer);
      card._timer = null;
    }
    const spinner = card.querySelector('.tool-spinner');
    if (spinner) spinner.remove();
    const durStr = durationMs !== undefined && durationMs !== null ? ` em ${(durationMs / 1000).toFixed(1)}s` : '';
    const st = card.querySelector('.tool-status-text');
    if (st) st.textContent = ok ? `✓ Concluído com sucesso${durStr}` : (canceled ? '✕ Cancelado' : `⚠ Erro na execução${durStr}`);
    const out = card.querySelector('.tool-output');
    if (out && text) {
      out.textContent = text;
      out.classList.remove('hidden');
    }
    const oldUsage = card.querySelector('.tool-usage');
    if (oldUsage) oldUsage.remove();
    const isCodex = card.dataset.toolName === 'chamar_codex' || card.classList.contains('codex');
    if (usage || (isCodex && !canceled)) {
      const badge = makeUsageBadge(usage, null, isCodex ? 'Codex CLI' : 'Ferramenta');
      badge.classList.add('tool-usage');
      card.appendChild(badge);
    }
  }
  SoundSystem.receive();
});

api.on('app-context', (ctx) => {
  const oldSpot = world.appContext.spotify;
  const oldAnti = world.appContext.antigravity;
  Object.assign(world.appContext, ctx);

  if (!oldSpot && world.appContext.spotify && pets[0]) {
    say(pets[0], 'Ouvindo Spotify! 🎧🎶 Solta o som!', 3000);
    notes(pets[0].x, pets[0].y - 45, 3);
  }
  if (!oldAnti && world.appContext.antigravity && pets[1]) {
    say(pets[1], 'Antigravity IDE aberto! 🚀💻 Bora codar!', 3000);
    particles.push({
      type: 'code',
      ch: '</>',
      x: pets[1].x,
      y: pets[1].y - 35,
      vx: 0,
      vy: -1.2,
      life: 50,
      max: 50,
      size: 14,
      color: '#34d399',
    });
  }
});

$$('.btn-pet-count').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    SoundSystem.pop();
    const count = parseInt(btn.dataset.count, 10);
    applyPetCount(count, true);
    world.hudHideAt = performance.now() + 1600;
  });
});

$('#act-games').addEventListener('click', () => {
  SoundSystem.pop();
  hideHud();
  gamesModal.classList.remove('hidden');
});

$('#act-feed').addEventListener('click', () => { SoundSystem.pop(); hideHud(); dropFood(); });

$('#act-chat').addEventListener('click', () => { SoundSystem.pop(); if (world.hoveredPet) openPetChat(world.hoveredPet.id); });

$('#act-sleep').addEventListener('click', () => {
  SoundSystem.pop();
  hideHud();
  if (world.hoveredPet) world.hoveredPet.state === 'sleep' ? wake(world.hoveredPet) : goSleep(world.hoveredPet);
});

$('#act-hide').addEventListener('click', () => {
  SoundSystem.pop();
  hideHud();
  if (world.hoveredPet) startPetHide(world.hoveredPet);
  else if (pets[0]) startPetHide(pets[0]);
});

$('#act-sound').addEventListener('click', () => {
  SoundSystem.toggle();
});

$('#score-exit').addEventListener('click', () => { SoundSystem.pop(); stopCurrentGame(); });

$('#btn-close-games').addEventListener('click', () => { SoundSystem.pop(); gamesModal.classList.add('hidden'); });

export async function startGame(type) {
  const starts = { volley: startVolley, hideseek: startHideSeek, tag: startTag, keepup: startKeepUp, jokenpo: startJokenpo, dance: startDance };
  if (!starts[type]) return;
  try {
    if (api.gatherPets) acceptViewport(await api.gatherPets());
    api.focus();
    starts[type]();
  } catch (error) { if (pets[0]) say(pets[0], error.message, 3000); }
}

$$('.game-card').forEach((card) => {
  card.addEventListener('click', () => {
    SoundSystem.pop();
    const gameType = card.dataset.game;
    gamesModal.classList.add('hidden');
    startGame(gameType);
  });
});

$('#btn-skin-picker').addEventListener('click', () => {
  if (!world.hoveredPet) return;
  SoundSystem.pop();
  world.activeModalPet = world.hoveredPet;
  $$('.skin-opt').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.skin === world.activeModalPet.skin);
  });
  skinModal.classList.remove('hidden');
  refreshPortraits();
});

$('#btn-close-skin').addEventListener('click', () => { SoundSystem.pop(); skinModal.classList.add('hidden'); });

$$('.skin-opt').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!world.activeModalPet) return;
    SoundSystem.pop();
    const skin = btn.dataset.skin;
    world.activeModalPet.skin = skin;
    refreshPortraits();
    api.setSkin(world.activeModalPet.id, skin);
    $('#hud-skin-name').textContent = SKIN_NAMES[skin] || 'Skin';
    world.activeModalPet.squash = 0.2;
    world.activeModalPet.happyT = 80;
    burstHearts(world.activeModalPet, 4);
    say(world.activeModalPet, `Skin ${SKIN_NAMES[skin]} ativada! 🎭`, 1800);
    skinModal.classList.add('hidden');
  });
});

window.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (world.dragPet && !world.dragOffset.moved && Math.hypot(e.clientX - world.dragOffset.sx, e.clientY - world.dragOffset.sy) > 5) {
    world.dragOffset.moved = true;
    if (world.dragPet.state === 'sleep') wake(world.dragPet);
    setState(world.dragPet, 'drag');
    hideHud();
    say(world.dragPet, pick(['Uaaau! 😵', 'Me solta! 😆', 'Tô voando!']), 1500);
  }
});

document.addEventListener('mouseleave', () => { mouse.x = -999; mouse.y = -999; });

cvs.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || world.activeGame) return;
  const p = pets.find((pt) => pt.state !== 'chat' && overPet(pt, e.clientX, e.clientY));
  if (p) {
    if (p.state === 'hide') {
      foundPet(p, true);
      return;
    }
    world.dragPet = p;
    world.dragOffset = { ox: e.clientX - p.x, oy: e.clientY - p.y, sx: e.clientX, sy: e.clientY, moved: false };
  }
});

window.addEventListener('mouseup', (e) => {
  if (world.activeGame === 'dance') {
    SoundSystem.pop();
    confetti(mouse.x, mouse.y, 25);
    return;
  }
  if (!world.dragPet || e.button !== 0) return;
  if (world.dragOffset.moved) {
    world.dragPet.vx = clamp(mouse.vx, -25, 25);
    world.dragPet.vy = clamp(mouse.vy, -25, 25);
    setState(world.dragPet, 'fall');
  } else {
    world.dragPet.happyT = 90;
    world.dragPet.squash = 0.18;
    burstHearts(world.dragPet, 3);
    SoundSystem.chirp(world.dragPet.id === 'gemi');
    say(world.dragPet, pick(['Hehe! 💜', 'Adorei! 😆', 'Clique direito pra conversar!']), 1800);
  }
  world.dragPet = null;
});

window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (world.activeGame) return;
  const p = pets.find((pt) => overPet(pt, e.clientX, e.clientY));
  if (p) {
    if (p.state === 'hide') {
      foundPet(p, true);
      return;
    }
    const chatEl = $(`#chat-${p.id}`);
    if (chatEl.classList.contains('open')) closePetChat(p.id);
    else openPetChat(p.id);
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (world.activeGame) stopCurrentGame();
  else {
    for (const ch of ALL_CHARACTERS) closePetChat(ch.id);
    skinModal.classList.add('hidden');
    gamesModal.classList.add('hidden');
  }
});

api.on('command', ({ cmd, arg }) => {
  if (cmd === 'chat') openPetChat(arg || 'gemi');
  else if (cmd === 'game') {
    startGame(arg);
  }
  else if (cmd === 'feed') dropFood();
  else if (cmd === 'hide' && pets[0]) startPetHide(pets[0]);
  else if (cmd === 'sound') SoundSystem.toggle();
  else if (cmd === 'run') { for (const p of pets) startRun(p); }
  else if (cmd === 'sleep') { for (const p of pets) p.state === 'sleep' ? wake(p) : goSleep(p); }
  else if (cmd === 'key') { openPetChat('gemi'); const { setup } = getChatElements('gemi'); setup.classList.remove('hidden'); }
  else if (cmd === 'skin-modal') {
    const p = pets.find((pt) => pt.id === (arg || 'gemi'));
    if (p) { world.hoveredPet = p; $('#btn-skin-picker').click(); }
  }
});

export function frame(now) {
  try {
    const dt = Math.min(3, (now - world.last) / 16.667);
    world.last = now; world.T += dt / 60;
    world.frameCount++;
    if (world.frameCount === 1 || world.frameCount === 60) {
      console.log(`[Frame #${world.frameCount}] W: ${world.W}, H: ${world.H}, ground: ${ground()}, pets: ${pets.map(p => `${p.name}@(${Math.round(p.x)},${Math.round(p.y)})`).join(', ')}`);
    }

    const ivx = (mouse.x - mouse.px) / dt, ivy = (mouse.y - mouse.py) / dt;
    if (mouse.px > -900 && mouse.x > -900) {
      mouse.vx = mouse.vx * 0.5 + ivx * 0.5;
      mouse.vy = mouse.vy * 0.5 + ivy * 0.5;
    }
    mouse.px = mouse.x; mouse.py = mouse.y;

    for (const p of pets) p.moving = false;

  // Atualização dos Jogos
  if (world.activeGame === 'volley') updateVolley(dt);
  else if (world.activeGame === 'tag') updateTag(dt, now);
  else if (world.activeGame === 'keepup') updateKeepUp(dt);
  else if (world.activeGame === 'jokenpo') updateJokenpo(dt);
  else if (world.activeGame === 'dance') updateDance(dt, now);
  else updateDialogue(now);

  for (const p of pets) updatePet(p, dt, now);
  updateFood(dt);
  updateParticles(dt);

  // Partículas contextuais ocasionais quando Spotify ou Antigravity estão ativos
  if (world.appContext.spotify && Math.random() < 0.035 * dt) {
    const p = pick(pets);
    if (p.state !== 'sleep' && p.state !== 'hide') {
      notes(p.x + rand(-15, 15), p.y - 45, 1);
    }
  }
  if (world.appContext.antigravity && Math.random() < 0.035 * dt) {
    const p = pick(pets);
    if (p.state !== 'sleep' && p.state !== 'hide') {
      particles.push({
        type: 'code',
        ch: pick(['{ }', '</>', 'const', '01', 'fn()', 'async', '=>', 'import']),
        x: p.x + (p.dir === 1 ? 20 : -20) + rand(-6, 6),
        y: p.y - 20,
        vx: rand(-0.3, 0.3),
        vy: -rand(0.8, 1.5),
        life: 50,
        max: 50,
        size: 11,
        color: p.theme === 'gemini' ? '#38bdf8' : '#34d399',
      });
    }
  }

  updateHit();

  ctx.clearRect(0, 0, world.W, world.H);

  // Desenho específico de cada jogo
  if (world.activeGame === 'volley') {
    // Linha e rede de vôlei
    const g = ground(), netTop = g - volleyGame.netH;
    const lg = ctx.createLinearGradient(volleyGame.left, 0, volleyGame.right, 0);
    lg.addColorStop(0, 'rgba(66,133,244,0)'); lg.addColorStop(0.15, 'rgba(66,133,244,.9)');
    lg.addColorStop(0.5, 'rgba(155,114,203,.9)'); lg.addColorStop(0.85, 'rgba(16,163,127,.9)'); lg.addColorStop(1, 'rgba(16,163,127,0)');
    ctx.fillStyle = lg; ctx.fillRect(volleyGame.left, g - 3, volleyGame.right - volleyGame.left, 3);

    ctx.font = `700 11px ${FONT}`; ctx.fillStyle = 'rgba(234,237,255,.35)'; ctx.textAlign = 'center';
    ctx.fillText('VOCÊ', (volleyGame.left + volleyGame.netX) / 2, g - 10);
    ctx.fillText('PETS', (volleyGame.netX + volleyGame.right) / 2, g - 10);

    ctx.fillStyle = 'rgba(234,237,255,.85)'; ctx.fillRect(volleyGame.netX - 2, netTop, 4, volleyGame.netH);
    ctx.strokeStyle = 'rgba(234,237,255,.25)'; ctx.lineWidth = 1;
    for (let y = netTop + 12; y < g - 30; y += 9) {
      ctx.beginPath(); ctx.moveTo(volleyGame.netX - 14, y); ctx.lineTo(volleyGame.netX + 14, y); ctx.stroke();
    }
    ctx.fillStyle = '#fff'; rr(ctx, volleyGame.netX - 16, netTop, 32, 6, 3); ctx.fill();

    // Bola e mão
    const b = volleyGame.ball;
    const k = Math.max(0.3, 1 - (g - b.y) / 400);
    ctx.fillStyle = `rgba(0,0,0,${0.25 * k})`;
    ctx.beginPath(); ctx.ellipse(b.x, g - 1, b.r * k, 3.5 * k, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
    ctx.shadowColor = 'rgba(0,194,154,.6)'; ctx.shadowBlur = 12;
    ctx.fillStyle = '#fbfbff'; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.clip();
    ctx.lineWidth = 3.2;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = i % 2 === 0 ? '#4285F4' : '#10A37F';
      ctx.rotate(Math.PI * 2 / 3);
      ctx.beginPath(); ctx.arc(0, b.r * 1.15, b.r * 1.05, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // Mão do jogador
    if (mouse.x < volleyGame.netX && mouse.x > volleyGame.left - 60 && mouse.y > 0) {
      const r = 26;
      const gr = ctx.createRadialGradient(mouse.x, mouse.y, 4, mouse.x, mouse.y, r);
      gr.addColorStop(0, 'rgba(124,244,255,.35)'); gr.addColorStop(1, 'rgba(66,133,244,.08)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(124,244,255,.8)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = `20px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('✋', mouse.x, mouse.y + 1); ctx.textBaseline = 'alphabetic';
    }
  } else if (world.activeGame === 'keepup') {
    // Bola de futebol nas embaixadinhas
    const b = keepupGame.ball, g = ground();
    const k = Math.max(0.3, 1 - (g - b.y) / 400);
    ctx.fillStyle = `rgba(0,0,0,${0.25 * k})`;
    ctx.beginPath(); ctx.ellipse(b.x, g - 1, b.r * k, 3.5 * k, 0, 0, Math.PI * 2); ctx.fill();

    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1e293b';
    for (let i = 0; i < 5; i++) {
      ctx.rotate(Math.PI * 2 / 5);
      ctx.beginPath(); ctx.arc(0, b.r * 0.55, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();

    // Mão do jogador para salvar
    if (mouse.y > 0) {
      const r = 24;
      ctx.fillStyle = 'rgba(124,244,255,.2)'; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(124,244,255,.8)'; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.font = `18px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('✋', mouse.x, mouse.y + 1); ctx.textBaseline = 'alphabetic';
    }
  } else if (world.activeGame === 'dance') {
    // Pista de dança com luzes coloridas discretas
    const g = ground();
    const floorGrad = ctx.createRadialGradient(world.W / 2, g, 20, world.W / 2, g, 220);
    floorGrad.addColorStop(0, 'rgba(155, 114, 203, 0.45)');
    floorGrad.addColorStop(0.5, 'rgba(0, 194, 154, 0.25)');
    floorGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = floorGrad;
    ctx.beginPath(); ctx.ellipse(world.W / 2, g - 1, 240, 14, 0, 0, Math.PI * 2); ctx.fill();
  }

  drawFood();

  // Desenha sombras e pets
  for (const p of pets) drawShadow(p);
  for (const p of pets) {
    drawPet(ctx, p, {
      time: world.T,
      moving: p.moving,
      phase: p.phase,
      squash: p.squash,
      expr: currentExpr(p),
      blink: p.blink > 0,
      armUp: p.armUp,
      talking: p.talking,
    });
  }

  drawParticles();
  for (const p of pets) drawBubble(p);
  positionUI(now);
  } catch (err) {
    console.error('[Frame Exception]', err);
  }

  requestAnimationFrame(frame);
}

setInterval(() => {
  for (const p of pets) {
    p.stats.food = clamp(p.stats.food - 0.011, 0, 100);
    p.stats.fun = clamp(p.stats.fun + (world.activeGame ? 0.4 : -0.016), 0, 100);
    if (p.state !== 'sleep') p.stats.energy = clamp(p.stats.energy - (world.activeGame ? 0.04 : 0.008), 0, 100);
  }
  if (world.hoveredPet && hud.classList.contains('show')) updateBars(world.hoveredPet);
}, 1000);

setInterval(() => {
  const stateObj = {};
  for (const p of pets) stateObj[p.id] = p.stats;
  api.saveState(stateObj);
}, 20000);

export function makeTrayIcon() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  if (pets[0]) drawPet(x, pets[0], { scale: 0.74, expr: 'happy', time: 0 });
  api.setTrayIcon(c.toDataURL('image/png'));
}

export function acceptViewport(viewport) {
  if (!viewport) return;
  const previousIds = pets.map((pet) => pet.id).join(',');
  if (previousIds !== viewport.visiblePetIds?.join(',')) stopCurrentGame();
  applyViewport(viewport);
  applyPetCount(viewport.totalPetCount || world.activePetCount, false, false);
  for (const pet of pets) {
    if (viewport.skins?.[pet.id]) pet.skin = viewport.skins[pet.id];
    if (!previousIds.split(',').includes(pet.id)) {
      if (viewport.state?.[pet.id]) Object.assign(pet.stats, viewport.state[pet.id]);
      if (viewport.histories?.[pet.id]) {
        chatState[pet.id].history = viewport.histories[pet.id];
        const log = getChatElements(pet.id).log;
        log.replaceChildren();
        for (const message of chatState[pet.id].history) {
          const text = (message.parts || []).map((part) => part.text || '').join('');
          if (!text) continue;
          const item = document.createElement('div');
          item.className = 'msg ' + (message.role === 'user' ? 'user' : 'model');
          if (message.role === 'user') item.textContent = text; else item.innerHTML = renderMarkdown(text);
          log.appendChild(item);
        }
      }
    }
  }
  const moveButton = $('#act-monitor');
  if (moveButton) { moveButton.hidden = (viewport.displays?.length || 1) < 2; moveButton.classList.toggle('hidden', moveButton.hidden); }
  const displayInfo = $('#hud-display-info');
  if (displayInfo) { displayInfo.hidden = false; displayInfo.classList.remove('hidden'); displayInfo.textContent = viewport.label + ' · ' + viewport.resolution.width + ' × ' + viewport.resolution.height + ' · ' + Math.round(viewport.scaleFactor * 100) + '%'; }
  refreshPortraits();
}

api.on('viewport', acceptViewport);
api.on('key-status', (status) => {
  chatState.gemi.hasKey = chatState.claude.hasKey = chatState.sparky.hasKey = status.hasKey;
  chatState.codex.hasKey = status.hasOpenaiKey;
});

$('#act-monitor')?.addEventListener('click', async () => {
  const pet = world.hoveredPet;
  if (!pet) return;
  hideHud();
  await api.movePet(pet.id, pet.stats);
});

(async function init() {
  try {
    const cfg = await api.getConfig();
    chatState.gemi.hasKey = cfg.hasKey;
    chatState.codex.hasKey = cfg.hasOpenaiKey;
    chatState.codex.hasCli = cfg.hasCodex;
    chatState.claude.hasKey = cfg.hasKey;
    chatState.sparky.hasKey = cfg.hasKey;
    if (cfg.viewport) acceptViewport(cfg.viewport);
    else applyPetCount(cfg.petCount || 2, false, false);
    const skins = { gemi: cfg.gemiSkin, codex: cfg.codexSkin, claude: cfg.claudeSkin, sparky: cfg.sparkySkin };
    for (const pet of pets) {
      if (skins[pet.id]) pet.skin = skins[pet.id];
      if (cfg.state?.[pet.id]) Object.assign(pet.stats, cfg.state[pet.id]);
    }
    if (cfg.appContext) Object.assign(world.appContext, cfg.appContext);
    if (cfg.settings?.sound !== undefined) SoundSystem.setEnabled(cfg.settings.sound);
    if (cfg.settings?.volume !== undefined) SoundSystem.setVolume(cfg.settings.volume);
    syncAudioUI();
    refreshPortraits();
  } catch {}

  api.on('settings', (s) => {
    if (s?.sound !== undefined) SoundSystem.setEnabled(s.sound);
    if (s?.volume !== undefined) SoundSystem.setVolume(s.volume);
    syncAudioUI();
  });

  api.on('set-pet-count', (cnt) => {
    applyPetCount(cnt, true, false);
  });

  makeTrayIcon();
  for (const pet of pets) say(pet, 'Oi! Eu sou ' + pet.name + ' ✨', 3000);
  requestAnimationFrame(frame);
})();
