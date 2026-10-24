import { $, CODEX_PALETTE, G, GEM_PALETTE, JOKENPO_OPTS, clamp, danceGame, getPetPalette, ground, hideSeekGame, jokenpoGame, keepupGame, mouse, particles, pets, pick, rand, scoreEl, tagGame, volleyGame, world } from './core.js';
import { SoundSystem } from './sounds.js';
import { applyPetCount, confetti, moveToward, notes, say, setState, sparkles, startPetHide, wake } from './pets.js';
import { closePetChat } from './chat.js';
import { hideHud } from './ui.js';

export function showGameScore(leftLbl, leftVal, rightLbl, rightVal, hint) {
  $('#score-lbl-left').textContent = leftLbl;
  $('#score-left').textContent = leftVal;
  $('#score-lbl-right').textContent = rightLbl;
  $('#score-right').textContent = rightVal;
  $('#score-hint').textContent = hint;
  scoreEl.classList.add('show');
}

export function hideGameScore() {
  scoreEl.classList.remove('show');
}

export function stopCurrentGame() {
  if (!world.activeGame) return;
  world.activeGame = null;
  hideGameScore();
  for (const p of pets) {
    p.vx = 0;
    setState(p, 'fall');
  }
}

export function startVolley() {
  stopCurrentGame();
  closePetChat('gemi', true);
  closePetChat('codex', true);
  for (const p of pets) if (p.state === 'sleep') wake(p);
  world.food = null;

  const cw = Math.min(1040, world.W - 40);
  const c = clamp(world.W / 2, cw / 2 + 20, world.W - cw / 2 - 20);
  Object.assign(volleyGame, { left: c - cw / 2, right: c + cw / 2, netX: c, you: 0, opp: 0 });

  world.activeGame = 'volley';
  for (const p of pets) {
    setState(p, 'game');
    p.vy = 0; p.vx = 0;
  }
  hideHud();
  showGameScore('Você', 0, 'Pets', 0, 'Seu mouse é a mão: encoste na bola pra rebater! Primeiro a 7 vence.');
  say(pets[0], 'Bora pro Vôlei! 🏐', 2000);
  say(pets[1], 'Prepara o saque! ⚡', 2000);
  serveVolley('you');
}

export function serveVolley(who) {
  const b = volleyGame.ball;
  volleyGame.server = who; volleyGame.phase = 'serve';
  b.vx = 0; b.vy = 0;
  volleyGame.baseY = ground() - 210;
  b.y = volleyGame.baseY;
  b.x = who === 'you' ? (volleyGame.left + volleyGame.netX) / 2 : (volleyGame.netX + volleyGame.right) / 2 + 20;
  volleyGame.pause = who === 'you' ? 0 : 70;
  volleyGame.miss = Math.random() < 0.12;
}

export function scoreVolleyPoint(w) {
  const b = volleyGame.ball;
  volleyGame[w]++;
  SoundSystem.score();
  $('#score-left').textContent = volleyGame.you;
  $('#score-right').textContent = volleyGame.opp;
  confetti(b.x, b.y, 28);

  if (w === 'opp') {
    const p = pick(pets);
    p.happyT = 80;
    say(p, pick(['Ponto nosso! 😎', 'Hehe! 🏐', 'Tenta defender! ⚡']), 1800);
  } else {
    say(pick(pets), pick(['Bela jogada! 👏', 'Essa foi na linha!', 'Mandou bem!']), 1800);
  }
  b.y = ground() - b.r; b.vy = 0; b.vx *= 0.3;
  volleyGame.phase = 'point'; volleyGame.pause = 80; volleyGame.server = w;
  if (volleyGame[w] >= 7) {
    volleyGame.phase = 'over'; volleyGame.pause = 220;
    const win = w === 'you';
    $('#score-hint').textContent = win ? '🏆 Você venceu! Parabéns!' : '🏆 Os Pets venceram! Revanche?';
    say(pets[0], win ? 'Você joga muito! 🏆' : 'Ganhamosss! 🏆', 3500);
    confetti(volleyGame.netX, ground() - 200, 60);
  }
}

export function updateVolley(dt) {
  const b = volleyGame.ball, g = ground();
  const netTop = g - volleyGame.netH;

  for (let i = 0; i < pets.length; i++) {
    const p = pets[i];
    p.vy += 0.6 * dt; p.y += p.vy * dt;
    if (p.y >= g) { p.y = g; p.vy = 0; }

    const defSlot = i === 0 ? (volleyGame.netX + volleyGame.right) / 2 - 40 : (volleyGame.netX + volleyGame.right) / 2 + 60;
    let tx = defSlot;
    if (volleyGame.phase === 'serve' && volleyGame.server === 'opp') tx = b.x + 10;
    else if (volleyGame.phase === 'play' && (b.vx > 0 || b.x > volleyGame.netX)) {
      const dist1 = Math.abs(pets[0].x - b.x);
      const dist2 = Math.abs(pets[1].x - b.x);
      if ((i === 0 && dist1 <= dist2) || (i === 1 && dist2 < dist1)) {
        tx = b.x + 12 + (volleyGame.miss ? 65 : 0);
      }
    }
    tx = clamp(tx, volleyGame.netX + 34, volleyGame.right - 28);
    const d = tx - p.x;
    if (Math.abs(d) > 3) {
      p.x += Math.sign(d) * Math.min(Math.abs(d), 5.6 * dt);
      p.dir = Math.sign(d); p.moving = true; p.phase += 0.45 * dt;
    } else p.dir = -1;

    if (volleyGame.phase === 'play' && b.x > volleyGame.netX && b.vy > 0 && Math.abs(b.x - p.x) < 45 && b.y < p.y - 90 && b.y > p.y - 170 && p.y >= g) {
      p.vy = -9.2;
    }

    const hx = p.x, hy = p.y - 52;
    if (b.x > volleyGame.netX && volleyGame.petCd <= 0 && b.vy > -3 && (b.x - hx) ** 2 + (b.y - hy) ** 2 < (b.r + 38) ** 2) {
      b.vx = -rand(7, 13);
      b.vy = -rand(9, 14);
      SoundSystem.bounce();
      volleyGame.petCd = 20;
      volleyGame.phase = 'play';
      p.armUp = 1;
      sparkles(b.x, b.y, 8, p.theme === 'gemini' ? GEM_PALETTE : CODEX_PALETTE);
      volleyGame.miss = Math.random() < 0.12;
    }
  }

  if (volleyGame.petCd > 0) volleyGame.petCd -= dt;
  if (volleyGame.cd > 0) volleyGame.cd -= dt;

  if (volleyGame.phase === 'serve') {
    b.y = volleyGame.baseY + Math.sin(world.T * 4) * 5;
    if (volleyGame.server === 'opp') {
      volleyGame.pause -= dt;
      if (volleyGame.pause <= 0) {
        b.vx = -9; b.vy = -12;
        volleyGame.phase = 'play';
      }
    }
  } else if (volleyGame.phase === 'play') {
    b.vy += G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vx * 0.04 * dt;
    if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.7; }
    if (b.x < volleyGame.left + b.r) { b.x = volleyGame.left + b.r; b.vx = Math.abs(b.vx) * 0.85; }
    if (b.x > volleyGame.right - b.r) { b.x = volleyGame.right - b.r; b.vx = -Math.abs(b.vx) * 0.85; }

    const x1 = volleyGame.netX - 4, x2 = volleyGame.netX + 4;
    const cx = clamp(b.x, x1, x2), cy = clamp(b.y, netTop, g);
    const dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy;
    if (d2 < b.r * b.r) {
      let dd = Math.sqrt(d2), nx, ny;
      if (dd < 0.01) { nx = b.vx > 0 ? -1 : 1; ny = 0; } else { nx = dx / dd; ny = dy / dd; }
      b.x = cx + nx * b.r; b.y = cy + ny * b.r;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { b.vx -= 1.7 * vn * nx; b.vy -= 1.7 * vn * ny; }
    }
    if (b.y >= g - b.r) scoreVolleyPoint(b.x < volleyGame.netX ? 'opp' : 'you');
  } else if (volleyGame.phase === 'point' || volleyGame.phase === 'over') {
    b.x += b.vx * dt; b.vx *= Math.pow(0.95, dt); b.rot += b.vx * 0.04 * dt;
    volleyGame.pause -= dt;
    if (volleyGame.pause <= 0) {
      if (volleyGame.phase === 'over') { stopCurrentGame(); return; }
      serveVolley(volleyGame.server);
    }
  }

  const canHit = (volleyGame.phase === 'play' || (volleyGame.phase === 'serve' && volleyGame.server === 'you'));
  if (canHit && mouse.x < volleyGame.netX && mouse.x > volleyGame.left - 60 && volleyGame.cd <= 0) {
    const hr = 26;
    const dx = b.x - mouse.x, dy = b.y - mouse.y, dd = Math.hypot(dx, dy);
    if (dd < b.r + hr) {
      let nx = dx / (dd || 1), ny = dy / (dd || 1);
      if (ny > -0.35) { ny = -0.55; nx = (Math.sign(nx) || 1) * Math.sqrt(1 - ny * ny); }
      const hs = Math.min(Math.hypot(mouse.vx, mouse.vy), 30);
      const pow = 8.5 + hs * 0.3;
      b.vx = nx * pow + mouse.vx * 0.25;
      b.vy = ny * pow + Math.min(0, mouse.vy * 0.25);
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 17) { b.vx *= 17 / sp; b.vy *= 17 / sp; }
      b.x = mouse.x + nx * (b.r + hr + 1); b.y = mouse.y + ny * (b.r + hr + 1);
      SoundSystem.bounce();
      volleyGame.cd = 12; volleyGame.phase = 'play';
      sparkles(b.x, b.y, 10);
    }
  }
}

export function startTag() {
  stopCurrentGame();
  closePetChat('gemi', true);
  closePetChat('codex', true);
  for (const p of pets) if (p.state === 'sleep') wake(p);
  world.food = null;
  world.activeGame = 'tag';

  tagGame.taggerIndex = Math.random() < 0.5 ? 0 : 1;
  tagGame.tags = 0;
  tagGame.timeEnd = performance.now() + 38000;

  pets[0].x = world.W / 2 - 160; pets[0].y = ground();
  pets[1].x = world.W / 2 + 160; pets[1].y = ground();

  hideHud();
  showGameScore('Pegador', pets[tagGame.taggerIndex].name, 'Pegas', '0', 'Pega-pega frenético na taskbar! Eles se perseguem.');
  say(pets[tagGame.taggerIndex], 'Eu sou o pegador! Lá vou eu! 🏃💨', 2400);
  say(pets[1 - tagGame.taggerIndex], 'Não pega não! 😜', 2400);
}

export function updateTag(dt, now) {
  if (now > tagGame.timeEnd) {
    say(pets[0], 'Ufa! Cansei! Que corridona! 🏁', 2600);
    say(pets[1], 'Hahaha bom demais! 👏', 2600);
    stopCurrentGame();
    return;
  }

  const tagger = pets[tagGame.taggerIndex];
  const runner = pets[1 - tagGame.taggerIndex];

  // O pegador persegue com velocidade
  const dx = runner.x - tagger.x;
  tagger.dir = Math.sign(dx) || 1;
  tagger.x += tagger.dir * 6.5 * dt;
  tagger.phase += 0.55 * dt;
  tagger.moving = true;

  // O fugitivo foge para o lado oposto
  let runDir = Math.sign(runner.x - tagger.x);
  if (runner.x < 70) runDir = 1;
  if (runner.x > world.W - 70) runDir = -1;

  runner.dir = runDir;
  runner.x += runner.dir * 5.6 * dt;
  runner.phase += 0.5 * dt;
  runner.moving = true;

  // Se o fugitivo for encurralado, pula por cima do pegador
  if (Math.abs(tagger.x - runner.x) < 70 && runner.y >= ground() && (runner.x < 100 || runner.x > world.W - 100)) {
    runner.vy = -10.5;
    runner.squash = -0.2;
    say(runner, 'Puleii! 🪂', 1400);
  }

  // Física de pulo
  for (const p of pets) {
    p.vy += 0.6 * dt; p.y += p.vy * dt;
    if (p.y >= ground()) { p.y = ground(); p.vy = 0; }
  }

  // Poeira de corrida
  if (Math.random() < 0.4 * dt) {
    particles.push({
      type: 'dust',
      x: tagger.x - tagger.dir * 14,
      y: ground() - 3,
      vx: -tagger.dir * rand(1, 2.5),
      vy: -rand(0.2, 1),
      life: 25, max: 25, r: rand(3, 6),
    });
  }

  // Colisão de pega!
  if (Math.abs(tagger.x - runner.x) < 36 && Math.abs(tagger.y - runner.y) < 40) {
    tagGame.tags++;
    tagGame.taggerIndex = 1 - tagGame.taggerIndex;
    $('#score-lbl-left').textContent = 'Pegador';
    $('#score-left').textContent = pets[tagGame.taggerIndex].name;
    $('#score-right').textContent = tagGame.tags;

    sparkles((tagger.x + runner.x) / 2, ground() - 30, 16, ['#FBBC04', '#FF5F6D', '#7CF4FF']);
    confetti((tagger.x + runner.x) / 2, ground() - 40, 20);

    say(tagger, 'Te pegueiii! Agora você pega! 🔄', 1800);
    say(runner, 'Aaaa! Lá vou eu! 🏃💨', 1800);
    tagger.happyT = 80;
    runner.happyT = 80;
  }
}

export function startKeepUp() {
  stopCurrentGame();
  closePetChat('gemi', true);
  closePetChat('codex', true);
  for (const p of pets) if (p.state === 'sleep') wake(p);
  world.food = null;
  world.activeGame = 'keepup';

  if (pets.length === 1) {
    pets[0].x = world.W / 2; pets[0].y = ground();
  } else {
    pets.forEach((p, idx) => {
      p.x = world.W / 2 - 140 + (idx * (280 / Math.max(1, pets.length - 1)));
      p.y = ground();
    });
  }

  keepupGame.count = 0;
  keepupGame.ball.x = pets[0].x;
  keepupGame.ball.y = ground() - 140;
  keepupGame.ball.vx = pets.length === 1 ? rand(2, 4) : 4;
  keepupGame.ball.vy = -8;
  keepupGame.lastHitter = 0;
  keepupGame.pause = 0;

  hideHud();
  showGameScore('Embaixadinhas', '0', 'Recorde', keepupGame.record, 'Eles tocam a bola; você também pode encostar o mouse pra ajudar!');
  say(pets[0], 'Bora embaixadinhas! ⚽', 2000);
  if (pets[1]) say(pets[1], 'Não deixa cair! 👏', 2000);
}

export function updateKeepUp(dt) {
  const b = keepupGame.ball, g = ground();

  if (keepupGame.pause > 0) {
    keepupGame.pause -= dt;
    if (keepupGame.pause <= 0) {
      b.x = pets[0].x;
      b.y = ground() - 120;
      b.vx = rand(3, 5);
      b.vy = -9;
      keepupGame.count = 0;
      $('#score-left').textContent = '0';
    }
    return;
  }

  b.vy += 0.3 * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.rot += b.vx * 0.05 * dt;

  // Paredes
  if (b.x < 30 + b.r) { b.x = 30 + b.r; b.vx = Math.abs(b.vx) * 0.9; }
  if (b.x > world.W - 30 - b.r) { b.x = world.W - 30 - b.r; b.vx = -Math.abs(b.vx) * 0.9; }

  // Pets se posicionam sob a bola
  for (let i = 0; i < pets.length; i++) {
    const p = pets[i];
    p.vy += 0.6 * dt; p.y += p.vy * dt;
    if (p.y >= g) { p.y = g; p.vy = 0; }

    const isTowardsMe = (b.vx < 0 && p.x < b.x + 80) || (b.vx >= 0 && p.x > b.x - 80) || pets.length === 1;
    let targetX = clamp(b.x + (i % 2 === 0 ? 10 : -10), 60, world.W - 60);

    const d = targetX - p.x;
    if (Math.abs(d) > 3) {
      p.x += Math.sign(d) * Math.min(Math.abs(d), 5.2 * dt);
      p.dir = Math.sign(d);
      p.moving = true;
      p.phase += 0.45 * dt;
    } else {
      p.dir = i === 0 ? 1 : -1;
    }

    // Pulo para cabecear/tocar a bola
    if (isTowardsMe && Math.abs(b.x - p.x) < 40 && b.y < p.y - 70 && b.y > p.y - 150 && p.y >= g) {
      p.vy = -8.5;
    }

    // Colisão do pet com a bola
    const hx = p.x, hy = p.y - 48;
    if (b.vy > -2 && (b.x - hx) ** 2 + (b.y - hy) ** 2 < (b.r + 34) ** 2) {
      const other = pets.length > 1 ? (pets[(i + 1) % pets.length] || pets[0]) : null;
      const targetVx = other ? (other.x - p.x) * 0.055 : rand(-4, 4);
      b.vx = clamp(targetVx, -9, 9);
      b.vy = -rand(9, 13);
      SoundSystem.bounce();
      p.armUp = 1;
      keepupGame.count++;
      if (keepupGame.count > keepupGame.record) keepupGame.record = keepupGame.count;
      $('#score-left').textContent = keepupGame.count;
      $('#score-right').textContent = keepupGame.record;
      sparkles(b.x, b.y, 8, getPetPalette(p));
      say(p, `${keepupGame.count}! ⚡`, 1200);
    }
  }

  // O jogador com o mouse pode salvar a bola!
  const dMouse = Math.hypot(b.x - mouse.x, b.y - mouse.y);
  if (dMouse < b.r + 28 && mouse.y > 0) {
    b.vy = -rand(9, 13);
    b.vx = clamp(mouse.vx * 0.4 + rand(-3, 3), -8, 8);
    SoundSystem.bounce();
    keepupGame.count++;
    if (keepupGame.count > keepupGame.record) keepupGame.record = keepupGame.count;
    $('#score-left').textContent = keepupGame.count;
    $('#score-right').textContent = keepupGame.record;
    sparkles(b.x, b.y, 10, ['#FFFFFF', '#7CF4FF']);
    say(pick(pets), 'Boa defesa! ✋', 1400);
  }

  // Bola no chão: fim da sequência
  if (b.y >= g - b.r) {
    b.y = g - b.r;
    b.vy = 0; b.vx = 0;
    say(pick(pets), pick(['Quaseee! 😅', 'Ops! Caiu!', 'Tentando de novo!']), 1600);
    keepupGame.pause = 70;
  }
}

export function startJokenpo() {
  stopCurrentGame();
  closePetChat('gemi', true);
  closePetChat('codex', true);
  if (pets.length < 2) {
    applyPetCount(2, false);
  }
  for (const p of pets) if (p.state === 'sleep') wake(p);
  world.food = null;
  world.activeGame = 'jokenpo';

  jokenpoGame.gemiScore = 0;
  jokenpoGame.codexScore = 0;
  jokenpoGame.round = 1;
  jokenpoGame.state = 'approach';
  jokenpoGame.timer = 120;

  pets[0].dir = 1;
  if (pets[1]) pets[1].dir = -1;

  hideHud();
  showGameScore(pets[0].name, '0', pets[1] ? pets[1].name : 'Rival', '0', 'Disputa de Pedra, Papel e Tesoura! Melhor de 3.');
  say(pets[0], 'Desafio no Jokenpô! ✊✋✌️', 2000);
  if (pets[1]) say(pets[1], 'Desafio aceito! ⚡', 2000);
}

export function updateJokenpo(dt) {
  const g = ground();
  for (const p of pets) {
    p.vy += 0.6 * dt; p.y += p.vy * dt;
    if (p.y >= g) { p.y = g; p.vy = 0; }
  }

  const cx = world.W / 2;
  const targetGemi = cx - 55;
  const targetCodex = cx + 55;

  if (jokenpoGame.state === 'approach') {
    moveToward(pets[0], targetGemi, 3.2, dt, () => {});
    if (pets[1]) moveToward(pets[1], targetCodex, 3.2, dt, () => {});
    if (Math.abs(pets[0].x - targetGemi) <= 5 && (!pets[1] || Math.abs(pets[1].x - targetCodex) <= 5)) {
      pets[0].dir = 1; if (pets[1]) pets[1].dir = -1;
      jokenpoGame.state = 'counting';
      jokenpoGame.timer = 0;
    }
  } else if (jokenpoGame.state === 'counting') {
    jokenpoGame.timer += dt;
    pets[0].armUp = Math.abs(Math.sin(jokenpoGame.timer * 0.15));
    if (pets[1]) pets[1].armUp = Math.abs(Math.sin(jokenpoGame.timer * 0.15));

    if (jokenpoGame.timer < 35) {
      say(pets[0], 'Pedra... ✊', 900);
      if (pets[1]) say(pets[1], 'Pedra... ✊', 900);
    } else if (jokenpoGame.timer < 70) {
      say(pets[0], 'Papel... ✋', 900);
      if (pets[1]) say(pets[1], 'Papel... ✋', 900);
    } else if (jokenpoGame.timer < 105) {
      say(pets[0], 'Tesouuura... ✌️', 900);
      if (pets[1]) say(pets[1], 'Tesouuura... ✌️', 900);
    } else {
      // Revela escolha
      jokenpoGame.gemiChoice = pick(JOKENPO_OPTS);
      jokenpoGame.codexChoice = pick(JOKENPO_OPTS);
      say(pets[0], `${jokenpoGame.gemiChoice}!`, 3000);
      if (pets[1]) say(pets[1], `${jokenpoGame.codexChoice}!`, 3000);

      // Avaliação das regras
      let winner;
      const gChoice = jokenpoGame.gemiChoice, cChoice = jokenpoGame.codexChoice;
      if (gChoice === cChoice) winner = 'draw';
      else if ((gChoice === '✊' && cChoice === '✌️') || (gChoice === '✋' && cChoice === '✊') || (gChoice === '✌️' && cChoice === '✋')) winner = 'gemi';
      else winner = 'codex';

      if (winner === 'gemi') {
        jokenpoGame.gemiScore++;
        pets[0].vy = -7;
        pets[0].happyT = 90;
        confetti(pets[0].x, ground() - 60, 25);
      } else if (winner === 'codex' && pets[1]) {
        jokenpoGame.codexScore++;
        pets[1].vy = -7;
        pets[1].happyT = 90;
        confetti(pets[1].x, ground() - 60, 25);
      } else {
        sparkles(cx, ground() - 60, 15, ['#FFFFFF', '#FFDD55']);
      }

      $('#score-left').textContent = jokenpoGame.gemiScore;
      $('#score-right').textContent = jokenpoGame.codexScore;
      jokenpoGame.state = 'reveal';
      jokenpoGame.timer = 110;
    }
  } else if (jokenpoGame.state === 'reveal') {
    jokenpoGame.timer -= dt;
    if (jokenpoGame.timer <= 0) {
      if (jokenpoGame.gemiScore >= 2 || jokenpoGame.codexScore >= 2) {
        const win = jokenpoGame.gemiScore >= 2 ? pets[0] : (pets[1] || pets[0]);
        say(win, `Campeão do Jokenpô! 🏆`, 3500);
        confetti(win.x, ground() - 80, 45);
        jokenpoGame.state = 'finished';
        setTimeout(stopCurrentGame, 3800);
      } else {
        jokenpoGame.round++;
        jokenpoGame.state = 'counting';
        jokenpoGame.timer = 0;
      }
    }
  }
}

export function startDance() {
  stopCurrentGame();
  closePetChat('gemi', true);
  closePetChat('codex', true);
  for (const p of pets) if (p.state === 'sleep') wake(p);
  world.food = null;
  world.activeGame = 'dance';

  danceGame.timeEnd = performance.now() + 25000;
  danceGame.beat = 0;

  const total = pets.length;
  const spacing = 75;
  const startX = world.W / 2 - ((total - 1) * spacing) / 2;
  pets.forEach((p, i) => {
    p.x = startX + i * spacing;
    p.y = ground();
    p.dir = i % 2 === 0 ? 1 : -1;
    say(p, i === 0 ? 'Solta o som! 🎵🕺' : 'Bora dançar! 🎶💃', 2000);
  });

  hideHud();
  showGameScore('🎵 Ritmo', '100%', 'Vibe', 'MAX', 'Dança sincronizada dos pets! Clique neles pra jogar confete.');
}

export function updateDance(dt, now) {
  if (now > danceGame.timeEnd) {
    pets.forEach((p, i) => {
      say(p, i % 2 === 0 ? 'Mandamos bem demais! 👏' : 'Arrasamos na pista! ✨', 2400);
    });
    stopCurrentGame();
    return;
  }

  danceGame.beat += dt * 0.12;
  const bob = Math.sin(danceGame.beat * Math.PI * 2);

  pets.forEach((p, i) => {
    p.armUp = Math.abs(bob);
    p.squash = (i % 2 === 0 ? 1 : -1) * bob * 0.12;
    if (Math.sin(danceGame.beat * Math.PI) > 0.95 && p.y >= ground()) {
      p.vy = -6.5;
      p.dir *= -1;
    }
  });

  if (Math.sin(danceGame.beat * Math.PI) > 0.95) {
    notes(world.W / 2, ground() - 30, 2);
  }

  for (const p of pets) {
    p.vy += 0.6 * dt; p.y += p.vy * dt;
    if (p.y >= ground()) { p.y = ground(); p.vy = 0; }
  }
}

export function startHideSeek() {
  stopCurrentGame();
  closePetChat('gemi', true);
  closePetChat('codex', true);
  for (const p of pets) if (p.state === 'sleep') wake(p);
  world.food = null;
  world.activeGame = 'hideseek';
  hideSeekGame.found = 0;
  hideSeekGame.total = pets.length;

  hideHud();
  showGameScore('Achados', 0, 'Restam', pets.length, 'Passe o cursor sobre os pets escondidos na taskbar para achá-los!');
  say(pets[0], 'Esconde-esconde! 🙈 Não vale espiar!', 2200);
  say(pets[1], 'Lá vou eu me esconder! 📦', 2200);

  setTimeout(() => {
    if (world.activeGame === 'hideseek') {
      for (const p of pets) startPetHide(p);
    }
  }, 400);
}
