import { $, $$, ALL_CHARACTERS, SKIN_NAMES, api, chatPositions, cvs, getChatLayout, ground, hud, mouse, pets, scoreEl, world } from './core.js';
import { fitPanel } from './layout.js';
import { paintPortrait } from './portraits.js';

export function showHud(pet) {
  if (pet.state === 'chat' || world.activeGame || world.dragPet) return;
  world.hoveredPet = pet;
  updateBars(pet);

  const portrait = $('#hud-pet-icon canvas');
  if (portrait) {
    portrait.dataset.petPortrait = pet.id;
    paintPortrait(portrait, pet);
  }
  $('#hud-pet-name').textContent = pet.name;
  const subtitles = { gemi: 'Uma boa ideia começa aqui.', codex: 'Seu parceiro para o próximo passo.', claude: 'Curioso por natureza.', sparky: 'Uma faísca de criatividade.' };
  $('#hud-pet-subtitle').textContent = pet.state === 'sleep' ? 'Recarregando para novas aventuras.' : subtitles[pet.id] || 'Sempre por perto.';
  $('#hud-skin-name').textContent = SKIN_NAMES[pet.skin] || 'Skin';
  hud.classList.toggle('codex-theme', pet.theme === 'codex');
  hud.classList.toggle('claude-theme', pet.theme === 'claude');
  hud.classList.toggle('sparky-theme', pet.theme === 'sparky');
  updateSleepBtn();

  // Atualiza botões de contagem no HUD
  $$('.btn-pet-count').forEach((b) => {
    const active = Number(b.dataset.count) === world.activePetCount;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });

  hud.classList.add('show');
  world.hudHideAt = performance.now() + 1600;
}

export function hideHud() {
  hud.classList.remove('show');
}

export function updateBars(pet) {
  for (const k of ['food', 'fun', 'energy']) {
    const el = $(`#bar-${k}`);
    const value = Math.max(0, Math.min(100, Math.round(Number(pet.stats[k]) || 0)));
    el.style.width = `${value}%`;
    el.classList.toggle('low', pet.stats[k] < 25);
    $(`#value-${k}`).textContent = `${value}%`;
    const meter = el.closest('.stat');
    meter.setAttribute('aria-valuenow', String(value));
    meter.setAttribute('aria-valuetext', `${value}%`);
  }
}

export function updateSleepBtn() {
  if (!world.hoveredPet) return;
  const sleeping = world.hoveredPet.state === 'sleep';
  $('#act-sleep-label').textContent = sleeping ? 'Acordar' : 'Dormir';
  $('#act-sleep-icon use').setAttribute('href', sleeping ? '#icon-sun' : '#icon-moon');
  const button = $('#act-sleep');
  button.title = sleeping ? 'Acordar o pet' : 'Tirar uma soneca';
  button.setAttribute('aria-label', button.title);
}

export function setIgnore(b) {
  if (b !== world.ignoring) {
    world.ignoring = b;
    api.setIgnore(b);
  }
}

export function overPet(p, x, y) {
  if (p.state === 'hide') {
    if (p.hideType === 'taskbar') return x > p.x - 26 && x < p.x + 26 && y > ground() - 34 && y < ground() + 10;
    return x > p.x - 26 && x < p.x + 26 && y > p.y - 50 && y < p.y + 6;
  }
  return x > p.x - 25 && x < p.x + 25 && y > p.y - 70 && y < p.y + 4;
}

export function updateHit() {
  if (mouse.x < -900) {
    setIgnore(!world.dragPet);
    return;
  }
  const el = document.elementFromPoint(mouse.x, mouse.y);
  const overUI = !!el && el !== cvs && el !== document.body && el !== document.documentElement;
  const pOver = pets.find((p) => overPet(p, mouse.x, mouse.y));
  setIgnore(!(overUI || pOver || world.dragPet));
  if (pOver && !world.activeGame && pOver.state !== 'chat') {
    if (pOver.state === 'hide') {
      // Pequeno estímulo ao passar por perto
    } else {
      showHud(pOver);
    }
  } else if (overUI && hud.contains(el)) {
    world.hudHideAt = performance.now() + 1600;
  }
}

export function positionUI(now) {
  const viewport = { width: world.W, height: world.H };
  // Bounds are local to this monitor, including monitors with a different DPI.
  // Scroll long menus rather than letting their close button leave the screen.
  for (const panel of [hud, $('#skin-modal'), $('#games-modal'), scoreEl]) {
    if (!panel) continue;
    panel.style.minWidth = '0';
    panel.style.maxWidth = `${Math.max(1, world.W - 16)}px`;
    panel.style.maxHeight = `${Math.max(1, world.H - 16)}px`;
    panel.style.overflowY = 'auto';
  }
  if (hud.classList.contains('show') && world.hoveredPet) {
    const w = hud.offsetWidth, h = hud.offsetHeight;
    const box = fitPanel(viewport, { width: w, height: h }, { x: world.hoveredPet.x - w / 2, y: world.hoveredPet.y - 78 - h, margin: 8 });
    hud.style.left = `${box.left}px`;
    hud.style.top = `${box.top}px`;
    if (now > world.hudHideAt && !hud.matches(':hover') && !overPet(world.hoveredPet, mouse.x, mouse.y)) hideHud();
  }

  for (const ch of ALL_CHARACTERS) {
    const chatEl = $(`#chat-${ch.id}`);
    if (chatEl && chatEl.classList.contains('open')) {
      const box = getChatLayout(chatPositions[ch.id] || world.W / 2);
      chatPositions[ch.id] = box.centerX;
      chatEl.style.width = `${box.width}px`;
      chatEl.style.height = `${box.height}px`;
      chatEl.style.left = `${box.left}px`;
      chatEl.style.top = `${box.top}px`;
    }
  }
  if (world.activeGame) {
    const box = fitPanel(viewport, { width: scoreEl.offsetWidth, height: scoreEl.offsetHeight }, { x: world.W / 2 - scoreEl.offsetWidth / 2, y: ground() - 470, margin: 8 });
    scoreEl.style.left = `${box.left}px`;
    scoreEl.style.top = `${box.top}px`;
  }
}
