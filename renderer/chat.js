import { $, ALL_CHARACTERS, api, chatPositions, chatState, getChatLayout, getPetPalette, ground, pets } from './core.js';
import { SoundSystem, syncAudioUI } from './sounds.js';
import { foundPet, say, setState, sparkles, wake } from './pets.js';
import { stopCurrentGame } from './games.js';
import { hideHud } from './ui.js';
import { paintPortrait } from './portraits.js';

const ICONS = new Set(['chat', 'idea', 'code', 'rocket', 'clock', 'key', 'tokens', 'bolt', 'spark', 'heart', 'arrow']);

export function uiIcon(name) {
  return ICONS.has(name) ? `<svg class="ui-icon" aria-hidden="true"><use href="#icon-${name}"></use></svg>` : '';
}

export function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderMarkdown(txt) {
  if (!txt) return '';
  let h = esc(txt);
  // Blocos de código ```lang ... ```
  h = h.replace(/```([a-z0-9_-]*)\n?([\s\S]*?)```/gi, (_m, _lang, code) => `<pre><code>${code.trim()}</code></pre>`);
  // Código inline `code`
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Negrito **texto**
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Itálico *texto*
  h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Quebras de linha para <br>
  h = h.replace(/\n/g, '<br>');
  return h;
}

export function getChatElements(petId) {
  const el = $(`#chat-${petId}`) || $('#chat-gemi');
  return {
    root: el,
    log: el.querySelector('.chat-log'),
    input: el.querySelector('textarea'),
    form: el.querySelector('.chat-form'),
    setup: el.querySelector('.chat-setup'),
    keyInput: el.querySelector('.key-input'),
    status: el.querySelector(`#${petId}-status`) || el.querySelector('.chat-title small'),
    btnSound: el.querySelector('.btn-sound'),
    btnCodex: el.querySelector('.btn-call-codex'),
    btnArgon: el.querySelector('.btn-call-argon'),
    telemetry: el.querySelector(`#${petId}-telemetry`) || el.querySelector('.chat-telemetry'),
    valTokens: el.querySelector('.tele-tokens-val'),
    valTime: el.querySelector('.tele-time-val'),
    valSpeed: el.querySelector('.tele-speed-val'),
  };
}

export function showWelcomeChat(petId) {
  const { log } = getChatElements(petId);
  const def = ALL_CHARACTERS.find(c => c.id === petId) || ALL_CHARACTERS[0];
  const name = def.name;
  const greetings = {
    gemi: ['Oi, que bom te ver.', 'Uma boa conversa ou uma ideia nova? Estou por aqui para te acompanhar.'],
    codex: ['Vamos fazer acontecer?', 'Da primeira ideia ao próximo passo. Conte comigo para pensar e criar com você.'],
    claude: ['O que vamos descobrir?', 'Traga sua curiosidade. A gente pode explorar uma ideia, trocar histórias ou só conversar.'],
    sparky: ['Uma faísca de ideia?', 'Vamos dar espaço para a criatividade. Estou aqui para imaginar e construir com você.'],
  };
  const [greeting, description] = greetings[petId] || greetings.gemi;
  const actions = [
    { icon: 'chat', label: 'Vamos conversar', caption: 'Uma pergunta ou um bom papo.', prompt: 'O que você gosta de fazer?' },
    { icon: 'idea', label: 'Uma ideia nova', caption: 'Inspiração para o seu dia.', prompt: 'Me dê uma ideia criativa para um projeto.' },
    { icon: 'code', label: 'Chamar o Codex', caption: 'Ajuda para fazer acontecer.', tool: 'codex' },
    { icon: 'rocket', label: 'Abrir o Argon', caption: 'Continue no seu editor.', tool: 'argon' },
  ];

  const welcome = document.createElement('div');
  welcome.className = 'chat-welcome';
  welcome.innerHTML = `
    <div class="welcome-avatar"><canvas class="pet-portrait" data-pet-portrait="${esc(petId)}" width="96" height="96" aria-hidden="true"></canvas><span class="welcome-spark">${uiIcon('spark')}</span></div>
    <span class="welcome-kicker">Seu momento com ${esc(name)}</span>
    <h3 class="welcome-title">${greeting}</h3>
    <p class="welcome-desc">${description}</p>
    <div class="chat-chips welcome-actions">
      ${actions.map((action) => `<button type="button" class="chip" ${action.tool ? `data-tool="${action.tool}"` : `data-prompt="${esc(action.prompt)}"`}><span class="chip-icon">${uiIcon(action.icon)}</span><span class="chip-copy"><strong class="chip-label">${action.label}</strong><small class="chip-caption">${action.caption}</small></span></button>`).join('')}
    </div>
  `;
  log.appendChild(welcome);
  paintPortrait(welcome.querySelector('canvas'), pets.find((pet) => pet.id === petId) || petId);

  welcome.querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (['codex', 'argon'].includes(btn.dataset.tool)) {
        handleToolButtonClick(petId, btn.dataset.tool);
      } else {
        SoundSystem.pop();
        sendChatMessage(petId, btn.dataset.prompt);
      }
    });
  });
}

export function handleToolButtonClick(petId, tool) {
  SoundSystem.pop();
  const els = getChatElements(petId);
  const task = els.input.value.trim();
  if (task) {
    els.input.value = '';
    els.input.style.height = 'auto';
    executeToolDirect(petId, tool === 'codex' ? 'chamar_codex' : 'abrir_antigravity', task);
  } else {
    els.input.value = `/${tool} `;
    els.input.focus();
  }
}

export function executeToolDirect(petId, toolName, task) {
  task = task || 'Ajude com o código do projeto atual';
  const els = getChatElements(petId);
  const isCodex = toolName === 'chamar_codex';
  const brand = isCodex ? 'Codex' : 'Argon';
  const callId = `direct-${crypto.randomUUID()}`;
  const startTime = performance.now();

  SoundSystem.tool();

  const card = document.createElement('div');
  card.className = `msg tool-card ${isCodex ? 'codex' : 'argon'}`;
  card.id = `card-${callId}`;
  card.innerHTML = `
    <div class="tool-card-head">
      <div class="tool-card-brand">
        <span class="tool-logo">${uiIcon(isCodex ? 'code' : 'rocket')}</span>
        <strong>${brand}</strong>
      </div>
      <div class="tele-badge-chip" id="timer-${callId}">${uiIcon('clock')} <strong class="elapsed-val">0.0s</strong></div>
    </div>
    <div class="tool-task-box">
      <strong>Tarefa:</strong> <code>${esc(task)}</code>
    </div>
    <div class="tool-status-row">
      <div class="tool-spinner"></div>
      <span class="tool-status-text">Confirme a tarefa para continuar.</span>
    </div>
    <div class="tool-output hidden"></div>
  `;
  els.log.appendChild(card);
  els.log.scrollTop = els.log.scrollHeight;

  els.status.textContent = 'Aguardando sua confirmação…';

  // Cronômetro da tarefa em tempo real
  const timer = setInterval(() => {
    const elapsedSec = ((performance.now() - startTime) / 1000).toFixed(1) + 's';
    const timerEl = document.getElementById(`timer-${callId}`);
    if (timerEl) {
      const b = timerEl.querySelector('.elapsed-val');
      if (b) b.textContent = elapsedSec;
    }
  }, 90);
  card._timer = timer;

  api.toolRun({
    petId,
    id: callId,
    callId,
    name: toolName,
    args: { tarefa: task },
  });
}

export function openPetChat(petId) {
  stopCurrentGame();
  const pet = pets.find((p) => p.id === petId) || pets[0];
  if (!pet) return;
  if (pet.state === 'sleep') wake(pet);
  if (pet.state === 'hide') foundPet(pet, true);
  hideHud();

  const els = getChatElements(petId);
  const box = getChatLayout(pet.x);
  chatPositions[petId] = box.centerX;
  els.root.style.width = `${box.width}px`;
  els.root.style.height = `${box.height}px`;
  els.root.style.left = `${box.left}px`;
  els.root.style.top = `${box.top}px`;
  // The most recently opened conversation stays reachable on narrow displays.
  document.querySelectorAll('.chat').forEach((panel) => { panel.style.zIndex = '200'; });
  els.root.style.zIndex = '201';

  setState(pet, 'chat');
  pet.vx = 0; pet.vy = 0; pet.say = null;
  els.root.classList.add('open');
  SoundSystem.pop();
  sparkles(pet.x, pet.y - 30, 14, getPetPalette(pet));

  if (!els.log.children.length) {
    showWelcomeChat(petId);
  }

  syncAudioUI();
  api.focus();
  setTimeout(() => els.input.focus(), 220);
}

export function closePetChat(petId, immediate = false) {
  const els = getChatElements(petId);
  if (els.root) els.root.classList.remove('open');
  if (els.root?.contains(document.activeElement)) document.activeElement.blur();
  const pet = pets.find((p) => p.id === petId);
  if (pet && pet.state === 'chat') {
    setState(pet, 'idle', 60);
    pet.y = ground();
    pet.say = null;
  }
  if (!immediate) SoundSystem.pop();
}

export function sendChatMessage(petId, text) {
  if (!text || !text.trim()) return;
  text = text.trim();
  const els = getChatElements(petId);
  const pet = pets.find((p) => p.id === petId);
  if (chatState[petId].streaming) api.chatAbort(chatState[petId].streaming);

  // Remove card de boas-vindas na primeira mensagem
  const welcome = els.log.querySelector('.chat-welcome');
  if (welcome) welcome.remove();

  // 1. Mensagem do usuário
  const userMsg = document.createElement('div');
  userMsg.className = 'msg user';
  userMsg.textContent = text;
  els.log.appendChild(userMsg);
  els.log.scrollTop = els.log.scrollHeight;

  SoundSystem.send();

  // Salva no histórico
  chatState[petId].history.push({ role: 'user', parts: [{ text }] });
  api.saveSession?.(petId, chatState[petId].history);

  // Atalhos diretos de ferramentas (/codex ou /argon)
  if (/^\/(codex|code)[:\s]*/i.test(text)) {
    const task = text.replace(/^\/(codex|code)[:\s]*/i, '').trim();
    executeToolDirect(petId, 'chamar_codex', task);
    return;
  }
  if (/^\/(argon|antigravity)[:\s]*/i.test(text)) {
    const task = text.replace(/^\/(argon|antigravity)[:\s]*/i, '').trim();
    executeToolDirect(petId, 'abrir_antigravity', task);
    return;
  }

  // Verifica se há chave configurada
  const hasKey = chatState.gemi.hasKey || (petId === 'codex' && chatState.codex.hasKey);
  if (!hasKey) {
    els.setup.classList.remove('hidden');
    const warnMsg = document.createElement('div');
    warnMsg.className = 'msg model error';
    warnMsg.innerHTML = `${uiIcon('key')} <strong>Vamos conectar?</strong> Adicione sua chave do Gemini acima para começar a conversa.`;
    els.log.appendChild(warnMsg);
    els.log.scrollTop = els.log.scrollHeight;
    return;
  }

  const streamId = `stream-${crypto.randomUUID()}`;
  const modelMsg = document.createElement('div');
  modelMsg.className = 'msg model typing';
  modelMsg.id = streamId;
  modelMsg.dataset.raw = '';

  // Elemento do cronômetro ao vivo com indicador de tokens
  const liveBadge = document.createElement('div');
  liveBadge.className = 'tele-live-badge';
  liveBadge.id = `live-${streamId}`;
  liveBadge.innerHTML = `${uiIcon('clock')} <strong class="live-stopwatch">0.0s</strong> <span class="live-tok-counter">conectando…</span>`;
  modelMsg.appendChild(liveBadge);

  const textBody = document.createElement('div');
  textBody.className = 'msg-body';
  modelMsg.appendChild(textBody);

  els.log.appendChild(modelMsg);
  els.log.scrollTop = els.log.scrollHeight;
  els.status.textContent = `${pet ? pet.name : 'Assistente'} gerando resposta…`;

  chatState[petId].streaming = streamId;
  chatState[petId].startTime = performance.now();
  chatState[petId].lastRaw = '';

  // Inicia cronômetro ao vivo (atualiza a cada 80ms)
  if (chatState[petId].timerId) clearInterval(chatState[petId].timerId);
  chatState[petId].timerId = setInterval(() => {
    const elapsedSec = ((performance.now() - chatState[petId].startTime) / 1000).toFixed(1) + 's';
    const liveEl = document.getElementById(`live-${streamId}`);
    if (liveEl) {
      const sw = liveEl.querySelector('.live-stopwatch');
      if (sw) sw.textContent = elapsedSec;
    }
    if (els.valTime) els.valTime.textContent = elapsedSec;
    if (els.telemetry) els.telemetry.classList.add('live');
  }, 80);

  api.chatSend({
    petId,
    id: streamId,
    history: chatState[petId].history,
    state: pet ? pet.stats : {},
  });
}

export function setupChat(petId) {
  const els = getChatElements(petId);
  if (!els.root) return;

  // Envio de formulário
  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = els.input.value.trim();
    if (val) {
      sendChatMessage(petId, val);
      els.input.value = '';
      els.input.style.height = 'auto';
    }
  });

  // Enter envia, Shift+Enter faz quebra de linha
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      els.form.requestSubmit();
    }
  });

  // Auto-resize do textarea
  els.input.addEventListener('input', () => {
    els.input.style.height = 'auto';
    els.input.style.height = `${Math.min(els.input.scrollHeight, 90)}px`;
  });

  // Botão fechar
  const btnClose = els.root.querySelector('.btn-close');
  if (btnClose) btnClose.addEventListener('click', () => closePetChat(petId));

  // Botão limpar conversa
  const btnClear = els.root.querySelector('.btn-clear');
  if (btnClear) btnClear.addEventListener('click', () => {
    SoundSystem.pop();
    els.log.innerHTML = '';
    chatState[petId].history = [];
    api.saveSession?.(petId, []);
    showWelcomeChat(petId);
  });

  // Botão de chave
  const btnKey = els.root.querySelector('.btn-key');
  if (btnKey) btnKey.addEventListener('click', () => {
    SoundSystem.pop();
    els.setup.classList.toggle('hidden');
  });

  // Botões do modal de chave
  const btnCancelKey = els.setup.querySelector('.btn-cancel-key');
  if (btnCancelKey) btnCancelKey.addEventListener('click', () => {
    SoundSystem.pop();
    els.setup.classList.add('hidden');
  });
  const btnSaveKey = els.setup.querySelector('.btn-save-key');
  if (btnSaveKey) btnSaveKey.addEventListener('click', async () => {
    SoundSystem.pop();
    try {
    const val = els.keyInput.value.trim();
    if (petId === 'codex') {
      const res = await api.setKey({ openaiKey: val });
      chatState.codex.hasKey = res.hasOpenaiKey;
    } else {
      const res = await api.setKey({ geminiKey: val });
      chatState.gemi.hasKey = res.hasKey;
      chatState.claude.hasKey = res.hasKey;
      chatState.sparky.hasKey = res.hasKey;
    }
    els.keyInput.value = '';
    els.setup.classList.add('hidden');
    say(pets.find(p => p.id === petId) || pets[0], 'Chave salva com sucesso! 🔑✨', 2200);
    } catch (error) { els.status.textContent = error.message; }
  });

  // Botão de som
  if (els.btnSound) {
    els.btnSound.addEventListener('click', () => {
      SoundSystem.toggle();
      syncAudioUI();
    });
  }

  // Botões de chamada direta de ferramentas
  if (els.btnCodex) {
    els.btnCodex.addEventListener('click', () => handleToolButtonClick(petId, 'codex'));
  }
  if (els.btnArgon) {
    els.btnArgon.addEventListener('click', () => handleToolButtonClick(petId, 'argon'));
  }
}
