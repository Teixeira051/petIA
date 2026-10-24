import { $$, ALL_CHARACTERS, DIALOGUES, EMOJI, FONT, GEM_PALETTE, api, chatPetY, chatPositions, clamp, ctx, getPetPalette, getPetX, ground, mouse, particles, pets, pick, rand, world } from './core.js';
import { fitPanel, getPetSlot, wrapBubbleText } from './layout.js';
import { SoundSystem } from './sounds.js';
import { rr, starPath } from './skins.js';
import { closePetChat } from './chat.js';
import { hideHud, updateSleepBtn } from './ui.js';

export function createPet(id, name, theme, skin, initialX) {
  return {
    id,
    name,
    theme,
    skin,
    x: initialX,
    y: 0,
    vx: 0,
    vy: 0,
    dir: -1,
    state: 'idle',
    timer: 120,
    phase: 0,
    moving: false,
    blink: 0,
    blinkT: rand(100, 250),
    say: null,
    sayT: 0,
    armUp: 0,
    squash: 0,
    happyT: 0,
    target: initialX,
    talking: false,
    nextRunAt: performance.now() + rand(30000, 75000),
    nextHideAt: performance.now() + rand(45000, 95000),
    hideType: 'box',
    hideTimer: 0,
    hideTargetX: initialX,
    stats: { food: 85, fun: 80, energy: 90 },
  };
}

export function getTargetSlotX(index, total) {
  return getPetSlot(world.W, index, total);
}

export function applyPetCount(count, notify = false, persist = true) {
  count = clamp(Math.floor(Number(count) || 2), 1, 4);
  world.activePetCount = count;
  const visibleIds = world.viewport?.visiblePetIds;
  const definitions = ALL_CHARACTERS.slice(0, count).filter((definition) => !Array.isArray(visibleIds) || visibleIds.includes(definition.id));
  const wanted = new Set(definitions.map((definition) => definition.id));

  // Atualiza botões no HUD
  $$('.btn-pet-count').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.count) === count);
  });

  // Fecha chats de pets desativados
  for (const character of ALL_CHARACTERS) {
    if (!wanted.has(character.id)) closePetChat(character.id, true);
  }

  // Remove pets excedentes
  for (let i = pets.length - 1; i >= 0; i--) {
    if (wanted.has(pets[i].id)) continue;
    const [removed] = pets.splice(i, 1);
    if (world.hoveredPet === removed) { world.hoveredPet = null; hideHud(); }
    if (world.dragPet === removed) world.dragPet = null;
    sparkles(removed.x, removed.y - 30, 16, getPetPalette(removed));
  }

  // Adiciona novos pets
  for (const [i, def] of definitions.entries()) {
    if (pets.some((pet) => pet.id === def.id)) continue;
    const targetX = getTargetSlotX(i, definitions.length);
    const newPet = createPet(def.id, def.name, def.theme, def.skin, targetX);
    newPet.y = ground();
    pets.push(newPet);
    if (notify) {
      sparkles(newPet.x, newPet.y - 30, 20, getPetPalette(newPet));
      say(newPet, `Cheguei! Eu sou o ${newPet.name} ${def.emoji}`, 2500);
      SoundSystem.chirp(def.theme === 'gemini');
    }
  }
  pets.sort((left, right) => definitions.findIndex((definition) => definition.id === left.id) - definitions.findIndex((definition) => definition.id === right.id));

  // Reposiciona slots
  pets.forEach((p, idx) => {
    p.target = getTargetSlotX(idx, pets.length);
    if (p.state === 'idle') {
      p.x = getPetX(p.x, 50);
      p.y = ground();
    }
  });

  if (persist) api.setPetCount(count);
}

export function say(p, text, ms = 3200) {
  if (!p) return;
  p.say = text;
  p.sayT = ms;
  SoundSystem.chirp(p.id === 'gemi');
}

export function idleQuip(p) {
  const isGem = p.id === 'gemi';
  if (p.stats.food < 30) return say(p, pick(['Tô com fome… 🍎', 'Me dá um lanchinho? 🍕']));
  if (p.stats.energy < 25) return say(p, 'Que soninho… 😴');
  if (p.stats.fun < 30) return say(p, pick(['Bora brincar? 🎮', 'Tô no tédio…']));

  if (world.appContext.antigravity && world.appContext.spotify) {
    return say(p, pick([
      'Lo-Fi beats + Antigravity = código voando! 🎧💻🚀',
      'Playlist top no Spotify e codando a milhão! 🎶💻',
      'Modo foco ativado: Spotify tocando e IDE aberto! ✨'
    ]));
  }
  if (world.appContext.antigravity) {
    return say(p, pick([
      'Codando no Antigravity! 🚀💻',
      'Olha esse código que tô compilando! ✨',
      'Refatorando funções com o Argon a todo vapor! ☕',
      'Precisa de ajuda com o código? Só chamar! 💻'
    ]));
  }
  if (world.appContext.spotify) {
    return say(p, pick([
      'Essa batida tá boa demais! 🎧🕺',
      'Vibrando no som do Spotify! 💚🎵',
      'Solta o som, DJ! 🎶✨',
      'Trabalhando com trilha sonora de primeira! 🎧'
    ]));
  }

  if (isGem) {
    say(p, pick([
      'Oi! Eu sou o Gemi ✨', 'Clique direito pra conversar!', 'Tô de olho na taskbar 👀',
      'Precisa de ajuda com código? 💻', 'Gemini online! 🚀', 'Bora brincar de algo? 🎮',
    ]));
  } else {
    say(p, pick([
      'E aí! Sou o Codexy 🤖', 'ChatGPT tá on! ⚡', 'Clique direito pra abrir o chat!',
      'Codex a postos! 🛠️', 'Compilando ideias… ☕', 'Bora jogar? 🎮',
    ]));
  }
}

export function triggerAutonomousDialogue() {
  if (pets.length < 2) return;
  if (world.activeGame || world.activeDialogue || pets[0].state === 'sleep' || pets[1].state === 'sleep' || pets[0].state === 'chat' || pets[1].state === 'chat') return;
  const script = pick(DIALOGUES);
  world.activeDialogue = {
    script,
    index: 0,
    nextStepAt: performance.now(),
  };
}

export function updateDialogue(now) {
  if (!world.activeDialogue) {
    if (now > world.nextDialogueAt) {
      triggerAutonomousDialogue();
      world.nextDialogueAt = now + rand(35000, 70000);
    }
    return;
  }

  if (now >= world.activeDialogue.nextStepAt) {
    if (world.activeDialogue.index >= world.activeDialogue.script.length) {
      world.activeDialogue = null;
      return;
    }
    const step = world.activeDialogue.script[world.activeDialogue.index];
    const speaker = pets[step.who];
    if (!speaker) {
      world.activeDialogue = null;
      return;
    }
    say(speaker, step.text, step.ms);
    speaker.happyT = 60;
    speaker.armUp = 0.8;
    world.activeDialogue.index++;
    world.activeDialogue.nextStepAt = now + step.ms * 0.9;
  }
}

export function burstHearts(p, n) {
  for (let i = 0; i < n; i++) {
    particles.push({
      type: 'emoji',
      ch: pick(['💜', '💖', '✨', '⚡', '💚']),
      x: p.x + rand(-16, 16),
      y: p.y - 70,
      vx: rand(-0.6, 0.6),
      vy: -rand(0.8, 1.6),
      life: 70, max: 70, size: 14,
    });
  }
}

export function sparkles(x, y, n, colors = GEM_PALETTE) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(1, 3.5);
    particles.push({
      type: 'spark',
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 40, max: 40,
      color: pick(colors),
      r: rand(3, 6),
    });
  }
}

export function confetti(x, y, n) {
  for (let i = 0; i < n; i++) {
    particles.push({
      type: 'conf',
      x, y,
      vx: rand(-4, 4),
      vy: -rand(3, 8),
      life: 90, max: 90,
      color: pick([...GEM_PALETTE, '#10A37F', '#FBBC04', '#34A853']),
      rot: rand(0, 6),
      vr: rand(-0.3, 0.3),
    });
  }
}

export function notes(x, y, n) {
  for (let i = 0; i < n; i++) {
    particles.push({
      type: 'emoji',
      ch: pick(['🎵', '🎶', '✨', '⭐']),
      x: x + rand(-20, 20),
      y: y - 50,
      vx: rand(-0.8, 0.8),
      vy: -rand(1.2, 2.2),
      life: 60, max: 60, size: 18,
    });
  }
}

export function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt;
    if (pt.type === 'conf') { pt.vy += 0.18 * dt; pt.rot += pt.vr * dt; }
    if (pt.type === 'spark') { pt.vx *= 0.94; pt.vy *= 0.94; }
    if (pt.type === 'code') { pt.vx *= 0.96; pt.vy *= 0.97; }
    if (pt.type === 'z') pt.vx = Math.sin(pt.life * 0.08) * 0.4;
    if (pt.life <= 0) particles.splice(i, 1);
  }
}

export function drawParticles() {
  for (const pt of particles) {
    const a = clamp(pt.life / pt.max, 0, 1);
    ctx.globalAlpha = a;
    if (pt.type === 'dust') {
      ctx.fillStyle = 'rgba(210,214,235,0.7)';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r * (1.6 - a * 0.6), 0, Math.PI * 2); ctx.fill();
    } else if (pt.type === 'emoji') {
      ctx.font = `${pt.size}px ${EMOJI}`;
      ctx.textAlign = 'center';
      ctx.fillText(pt.ch, pt.x, pt.y);
    } else if (pt.type === 'code') {
      ctx.font = `bold ${pt.size || 11}px "Cascadia Code", Consolas, monospace`;
      ctx.fillStyle = pt.color || '#38bdf8';
      ctx.textAlign = 'center';
      ctx.fillText(pt.ch, pt.x, pt.y);
    } else if (pt.type === 'z') {
      ctx.font = `700 ${12 + (1 - a) * 10}px ${FONT}`;
      ctx.fillStyle = '#c9d1ff';
      ctx.textAlign = 'center';
      ctx.fillText('z', pt.x, pt.y);
    } else if (pt.type === 'spark') {
      ctx.fillStyle = pt.color;
      starPath(ctx, pt.x, pt.y, pt.r * a + 1);
      ctx.fill();
    } else if (pt.type === 'conf') {
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.rot);
      ctx.fillStyle = pt.color;
      ctx.fillRect(-3, -1.5, 6, 3);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

export function setState(p, s, timer = 0) {
  p.state = s;
  p.timer = timer;
}

export function moveToward(p, tx, speed, dt, done) {
  const d = tx - p.x;
  if (Math.abs(d) <= speed * dt) {
    p.x = tx;
    done();
    return;
  }
  p.dir = Math.sign(d);
  p.x += p.dir * speed * dt;
  p.phase += (0.1 + speed * 0.06) * dt;
  p.moving = true;
}

export function startRun(p) {
  if (p.state === 'sleep' || p.state === 'chat' || world.activeGame) return;
  p.target = getPetX(p.x < world.W / 2 ? world.W : 0, 50);
  setState(p, 'run');
  say(p, pick(['Lá vou eu correndo! 🏃', 'Vrummm! 💨', 'Sai da frentiii! ⚡']), 1800);
  p.nextRunAt = performance.now() + rand(45000, 110000);
}

export function dropFood() {
  if (!pets.length || world.food || world.activeGame) return;
  for (const p of pets) if (p.state === 'sleep') wake(p);
  world.food = {
    x: getPetX(pets.reduce((sum, pet) => sum + pet.x, 0) / pets.length + rand(-80, 80), 60),
    y: Math.max(20, world.H - 380),
    vy: 0,
    landed: false,
    ch: pick(['🍎', '🍕', '🍙', '🍩', '🍓', '🍔', '🧁', '🍪']),
  };
  SoundSystem.pop();
  say(pick(pets), 'Comida na área! 😋', 1600);
}

export function updateFood(dt) {
  if (!world.food || world.food.landed) return;
  world.food.vy += 0.5 * dt; world.food.y += world.food.vy * dt;
  if (world.food.y >= ground() - 14) {
    world.food.y = ground() - 14;
    world.food.landed = true;
    sparkles(world.food.x, world.food.y + 8, 6);
  }
}

export function drawFood() {
  if (!world.food) return;
  ctx.font = `26px ${EMOJI}`;
  ctx.textAlign = 'center';
  ctx.fillText(world.food.ch, world.food.x, world.food.y + 10);
}

export function wake(p) {
  setState(p, 'idle', 60);
  SoundSystem.wake();
  p.squash = 0.22;
  p.vy = -4;
  sparkles(p.x, p.y - 20, 12);
  say(p, pick(['Acordei! Tô 100% renovado! ⚡✨', 'Bom dia! Pronto pro trampo! 🚀', 'Soneca boa! 😄']));
  updateSleepBtn();
}

export function goSleep(p) {
  if (world.activeGame) return;
  closePetChat(p.id);
  setState(p, 'sleep');
  p.y = ground();
  SoundSystem.snore();
  say(p, 'Zzz… 🥱', 1800);
  updateSleepBtn();
}

export function startPetHide(p) {
  if (p.state === 'chat' || p.state === 'sleep' || world.activeGame || world.dragPet) return;
  p.state = 'hide';
  p.hideType = pick(['box', 'taskbar', 'edge']);
  p.hideTimer = 900; // ~15 segundos
  p.nextHideAt = performance.now() + rand(50000, 100000);
  SoundSystem.hide();
  say(p, pick(['Vou me esconder! Não olha! 🙈', 'Esconde-esconde! 🤫', 'Cadê eu? 📦']), 2500);

  if (p.hideType === 'edge') {
    p.hideTargetX = getPetX(Math.random() < 0.5 ? 0 : world.W, 26);
    p.target = p.hideTargetX;
    p.x = p.hideTargetX;
    p.dir = p.x < world.W / 2 ? 1 : -1;
    p.y = ground();
  } else if (p.hideType === 'taskbar') {
    p.y = ground() + 26;
  } else {
    p.y = ground();
  }
}

export function foundPet(p, byPlayer = true) {
  if (p.state !== 'hide') return;
  p.state = 'fall';
  p.vy = -9.5;
  p.y = ground() - 10;
  SoundSystem.found();
  burstHearts(p, 6);
  sparkles(p.x, p.y - 20, 16);
  if (byPlayer) {
    p.stats.fun = Math.min(100, p.stats.fun + 25);
    say(p, pick(['Achou!! 🙈🎉 Que rápido!', 'Me pegou no flagra! 😂', 'Uau, boa visão! ✨']), 2800);
  } else {
    say(p, 'Buuu! Ninguém me achou! 😜', 2500);
  }
}

export function updatePet(p, dt, now) {
  const g = ground();
  p.blinkT -= dt;
  if (p.blinkT <= 0) { p.blink = 8; p.blinkT = rand(120, 320); }
  if (p.blink > 0) p.blink -= dt;
  if (p.sayT > 0) { p.sayT -= dt * 16.67; if (p.sayT <= 0) p.say = null; }
  if (p.happyT > 0) p.happyT -= dt;
  p.armUp = Math.max(0, p.armUp - dt * 0.06);
  p.squash *= Math.pow(0.85, dt);

  // Se estiver em jogo ativo, a física específica cuida
  if (world.activeGame) return;

  switch (p.state) {
    case 'idle': {
      p.timer -= dt;
      // Auto-dormir quando cansado
      if (p.stats.energy < 35) {
        say(p, 'Nhaww... que soninho 🥱', 2200);
        goSleep(p);
        break;
      }
      // Auto-comer quando com fome
      if (p.stats.food < 45 && !world.food) {
        dropFood();
        say(p, pick(['Hummm, fominha! 🍎', 'Hora do lanche! 🍪', 'Acho que vi um petisco! 🍣']));
        setState(p, 'toFood');
        break;
      }
      // Auto-esconder espontâneo
      if (now > p.nextHideAt && p.stats.energy > 30 && pets.every((o) => o.state !== 'chat' && o.state !== 'sleep')) {
        startPetHide(p);
        break;
      }
      if (world.food) { setState(p, 'toFood'); break; }
      if (now > p.nextRunAt && p.stats.energy > 20) { startRun(p); break; }
      if (p.timer <= 0) {
        const r = Math.random();
        if (r < 0.45) {
          p.target = getPetX(p.x + rand(-240, 240), 40);
          setState(p, 'walk');
        } else if (r < 0.6) {
          p.dir *= -1;
          p.timer = rand(60, 160);
        } else if (r < 0.75) {
          idleQuip(p);
          p.timer = rand(140, 280);
        } else {
          p.timer = rand(90, 240);
        }
      }
      break;
    }
    case 'walk':
      if (world.food) { setState(p, 'toFood'); break; }
      moveToward(p, p.target, 1.4, dt, () => setState(p, 'idle', rand(60, 200)));
      break;
    case 'run':
      moveToward(p, p.target, 8, dt, () => {
        setState(p, 'idle', rand(100, 200));
        say(p, pick(['Ufa! 💨', 'Recorde! 🏆', 'Que corrida boa!']));
      });
      if (Math.random() < 0.6 * dt) {
        particles.push({
          type: 'dust',
          x: p.x - p.dir * 14,
          y: g - 3,
          vx: -p.dir * rand(0.5, 1.5),
          vy: -rand(0.2, 0.8),
          life: 30, max: 30, r: rand(3, 6),
        });
      }
      p.stats.energy = Math.max(0, p.stats.energy - 0.004 * dt);
      break;
    case 'toFood':
      if (!world.food) { setState(p, 'idle', 60); break; }
      if (world.food.landed) {
        moveToward(p, world.food.x + (p.id === 'gemi' ? -15 : 15), 3.2, dt, () => setState(p, 'eat', 100));
      }
      break;
    case 'eat':
      p.timer -= dt;
      p.squash = Math.sin(p.timer * 0.5) * 0.08;
      if (Math.floor(p.timer) % 28 === 0) SoundSystem.eat();
      if (p.timer <= 0) {
        p.stats.food = 100;
        p.stats.fun = Math.min(100, p.stats.fun + 10);
        world.food = null;
        p.happyT = 100;
        burstHearts(p, 5);
        SoundSystem.chirp(true);
        say(p, pick(['Delícia! 😋', 'Nham nham!', 'Barriguinha cheia! 💖']));
        setState(p, 'idle', 120);
      }
      break;
    case 'sleep':
      p.y = g;
      p.stats.energy = Math.min(100, p.stats.energy + 0.035 * dt);
      if (Math.random() < 0.015 * dt) {
        particles.push({ type: 'z', x: p.x + 12, y: p.y - 62, vx: 0, vy: -0.5, life: 90, max: 90 });
        SoundSystem.snore();
      }
      if (p.stats.energy >= 95) wake(p);
      break;
    case 'hide':
      p.hideTimer -= dt;
      if (p.hideType === 'taskbar') p.y = ground() + 26 + Math.sin(world.T * 2.5) * 3;
      if (p.hideTimer <= 0) {
        foundPet(p, false);
      }
      break;
    case 'drag':
      p.x = getPetX(mouse.x - world.dragOffset.ox);
      p.y = clamp(mouse.y - world.dragOffset.oy, Math.min(90, g), g);
      break;
    case 'fall':
      p.vy += 0.6 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(0.99, dt);
      if (p.x < getPetX(0)) { p.x = getPetX(0); p.vx = Math.abs(p.vx) * 0.5; }
      if (p.x > getPetX(world.W)) { p.x = getPetX(world.W); p.vx = -Math.abs(p.vx) * 0.5; }
      if (p.y < Math.min(88, g)) { p.y = Math.min(88, g); p.vy = Math.abs(p.vy) * 0.4; }
      if (p.y >= g) {
        p.y = g;
        if (p.vy > 5) { p.vy = -p.vy * 0.35; p.squash = 0.25; p.vx *= 0.6; }
        else { p.vy = 0; p.vx = 0; p.squash = 0.15; setState(p, 'idle', 80); }
      }
      break;
    case 'chat': {
      const targetX = chatPositions[p.id] || p.x;
      p.x += (targetX - p.x) * 0.14 * dt;
      p.y += (chatPetY() - p.y) * 0.14 * dt;
      if (Math.random() < 0.08 * dt) sparkles(p.x + rand(-20, 20), p.y - rand(0, 10), 1, getPetPalette(p));
      break;
    }
  }
}

export function currentExpr(p) {
  if (p.state === 'sleep') return 'sleep';
  if (p.state === 'drag' || p.state === 'fall') return 'surprised';
  if (p.happyT > 0 || p.state === 'eat' || p.state === 'run' || world.activeGame === 'dance') return 'happy';
  if (p.stats.food < 25 || p.stats.fun < 20 || p.stats.energy < 20) return 'sad';
  return 'normal';
}

export function drawBubble(p) {
  if (!p.say || p.state === 'chat') return;
  ctx.font = `600 12.5px ${FONT}`;
  const maxWidth = Math.max(1, Math.min(320, world.W - 12));
  const lines = wrapBubbleText(p.say, Math.max(1, maxWidth - 20), (text) => ctx.measureText(text).width);
  const w = Math.min(maxWidth, Math.max(...lines.map((line) => ctx.measureText(line).width), 0) + 20), h = lines.length * 18 + 12;
  const box = fitPanel({ width: world.W, height: world.H }, { width: w, height: h }, { x: p.x - w / 2, y: p.y - 74 - h, margin: 6 });
  const bx = box.left, by = box.top;
  ctx.globalAlpha = clamp(p.sayT / 300, 0, 1);
  ctx.fillStyle = '#fffdf7';
  rr(ctx, bx, by, w, h, 12); ctx.fill();
  const inset = Math.min(14, w / 2);
  const tx = clamp(p.x, bx + inset, bx + w - inset);
  ctx.beginPath(); ctx.moveTo(tx - 6, by + h); ctx.lineTo(tx, by + h + 6); ctx.lineTo(tx + 6, by + h); ctx.fill();

  const accents = { gemini: '#8c7bd6', codex: '#4c9d81', claude: '#bd835e', sparky: '#ad7eac' };
  ctx.strokeStyle = accents[p.theme] || accents.gemini; ctx.lineWidth = 1.2;
  rr(ctx, bx, by, w, h, 12); ctx.stroke();

  ctx.fillStyle = '#34313e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((line, index) => ctx.fillText(line, bx + w / 2, by + 15 + index * 18));
  ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
}

export function drawShadow(p) {
  if (p.state === 'chat') return;
  const lift = ground() - p.y;
  const k = Math.max(0.35, 1 - lift / 300);
  ctx.fillStyle = `rgba(0,0,0,${0.28 * k})`;
  ctx.beginPath(); ctx.ellipse(p.x, ground() - 1, 18 * k, 3.5 * k, 0, 0, Math.PI * 2); ctx.fill();
}
