import { FONT, GEM_PALETTE, ground, world } from './core.js';

export function starPath(c, cx, cy, r) {
  c.beginPath();
  c.moveTo(cx, cy - r);
  c.quadraticCurveTo(cx, cy, cx + r, cy);
  c.quadraticCurveTo(cx, cy, cx, cy + r);
  c.quadraticCurveTo(cx, cy, cx - r, cy);
  c.quadraticCurveTo(cx, cy, cx, cy - r);
  c.closePath();
}

export function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

export function drawRobotSkin(c, p, o) {
  const isGem = p.theme === 'gemini';
  const colors = isGem ? GEM_PALETTE : ['#10A37F', '#00C29A', '#1E293B'];

  const swing = o.moving ? Math.sin(o.phase) * 7 : 0;
  c.fillStyle = '#262b55';
  rr(c, -13 + swing, -12, 9, 12, 4); c.fill();
  rr(c, 4 - swing, -12, 9, 12, 4); c.fill();

  const arm = o.armUp || 0;
  const aw = o.moving ? Math.sin(o.phase) * 0.6 : 0;
  c.fillStyle = isGem ? '#5a68d8' : '#0d8364';
  c.save(); c.translate(-24, -34); c.rotate(0.35 + arm * 2.4 + aw); rr(c, -4, 0, 8, 16, 4); c.fill(); c.restore();
  c.save(); c.translate(24, -34); c.rotate(-0.35 - arm * 2.4 - aw); rr(c, -4, 0, 8, 16, 4); c.fill(); c.restore();

  const grd = c.createLinearGradient(-26, -60, 26, -10);
  grd.addColorStop(0, colors[0]);
  grd.addColorStop(0.55, colors[1]);
  grd.addColorStop(1, colors[2] || colors[0]);
  c.fillStyle = grd;
  rr(c, -26, -60, 52, 50, 18); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.2)';
  rr(c, -20, -56, 20, 6, 3); c.fill();

  c.fillStyle = '#0b0f24';
  rr(c, -19, -51, 38, 27, 10); c.fill();

  const eyeColor = isGem ? '#7CF4FF' : '#55FFD2';
  c.fillStyle = eyeColor; c.strokeStyle = eyeColor;
  c.lineWidth = 2.5; c.lineCap = 'round';
  c.shadowColor = eyeColor; c.shadowBlur = 6;
  const line = (x1, y1, x2, y2) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };

  if (o.expr === 'sleep' || (o.blink && o.expr !== 'happy' && o.expr !== 'surprised')) {
    line(-10, -37, -4, -37); line(4, -37, 10, -37);
  } else if (o.expr === 'happy') {
    c.beginPath(); c.arc(-7, -35, 4, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    c.beginPath(); c.arc(7, -35, 4, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  } else if (o.expr === 'surprised') {
    c.beginPath(); c.arc(-7, -38, 4, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(7, -38, 4, 0, Math.PI * 2); c.stroke();
  } else {
    rr(c, -10, -43, 6, 10, 3); c.fill();
    rr(c, 4, -43, 6, 10, 3); c.fill();
  }

  c.lineWidth = 2;
  if (o.talking) {
    const m = 1.5 + Math.abs(Math.sin(o.time * 16)) * 3;
    c.beginPath(); c.ellipse(0, -28, 3.5, m / 1.5, 0, 0, Math.PI * 2); c.fill();
  } else if (o.expr === 'happy' || o.expr === 'surprised') {
    c.beginPath(); c.arc(0, -30, o.expr === 'surprised' ? 2.5 : 4, 0, Math.PI, false);
    o.expr === 'surprised' ? c.stroke() : c.fill();
  } else if (o.expr !== 'sleep') {
    c.beginPath(); c.arc(0, -31, 3, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
  }
  c.shadowBlur = 0;

  c.fillStyle = isGem ? 'rgba(255,130,180,0.55)' : 'rgba(0,255,180,0.45)';
  c.beginPath(); c.ellipse(-13, -29, 3, 2, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(13, -29, 3, 2, 0, 0, Math.PI * 2); c.fill();

  c.strokeStyle = '#262b55'; c.lineWidth = 3;
  line(0, -60, 0, -67);
  const pulse = 1 + Math.sin(o.time * 3) * 0.12;
  c.save();
  c.translate(0, -73);
  c.rotate(Math.sin(o.time * 1.5) * 0.25);
  c.scale(pulse, pulse);

  if (isGem) {
    const sg = c.createLinearGradient(-8, -8, 8, 8);
    sg.addColorStop(0, colors[0]); sg.addColorStop(0.5, colors[1]); sg.addColorStop(1, colors[2]);
    c.fillStyle = sg; c.shadowColor = colors[1]; c.shadowBlur = 10;
    starPath(c, 0, 0, 8); c.fill();
  } else {
    c.fillStyle = '#00C29A'; c.shadowColor = '#00C29A'; c.shadowBlur = 10;
    c.beginPath(); c.arc(0, 0, 6, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 2.5, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

export function drawCatSkin(c, p, o) {
  const isGem = p.theme === 'gemini';
  const coatColor = isGem ? '#6D7CFF' : '#14B88D';
  const innerEar = '#FFADC8';

  const tailAngle = Math.sin(o.time * 3.5) * 0.35 + (o.moving ? Math.sin(o.phase) * 0.4 : 0);
  c.save();
  c.translate(-16, -18);
  c.rotate(-0.8 + tailAngle);
  c.strokeStyle = coatColor; c.lineWidth = 7; c.lineCap = 'round';
  c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-14, -12, -18, -26); c.stroke();
  c.restore();

  const swing = o.moving ? Math.sin(o.phase) * 7 : 0;
  c.fillStyle = coatColor;
  rr(c, -14 + swing, -12, 10, 12, 5); c.fill();
  rr(c, 4 - swing, -12, 10, 12, 5); c.fill();
  c.fillStyle = '#ffffff';
  rr(c, -13 + swing, -4, 8, 4, 2); c.fill();
  rr(c, 5 - swing, -4, 8, 4, 2); c.fill();

  const arm = o.armUp || 0;
  c.fillStyle = coatColor;
  c.save(); c.translate(-22, -28); c.rotate(0.3 + arm * 2.2); rr(c, -4, 0, 8, 14, 4); c.fill(); c.restore();
  c.save(); c.translate(22, -28); c.rotate(-0.3 - arm * 2.2); rr(c, -4, 0, 8, 14, 4); c.fill(); c.restore();

  c.fillStyle = coatColor;
  rr(c, -26, -56, 52, 46, 22); c.fill();

  c.fillStyle = 'rgba(255, 255, 255, 0.75)';
  c.beginPath(); c.ellipse(0, -22, 14, 10, 0, 0, Math.PI * 2); c.fill();

  c.fillStyle = coatColor;
  c.beginPath(); c.moveTo(-24, -48); c.lineTo(-14, -68); c.lineTo(-4, -53); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(24, -48); c.lineTo(14, -68); c.lineTo(4, -53); c.closePath(); c.fill();
  c.fillStyle = innerEar;
  c.beginPath(); c.moveTo(-21, -50); c.lineTo(-14, -63); c.lineTo(-7, -53); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(21, -50); c.lineTo(14, -63); c.lineTo(7, -53); c.closePath(); c.fill();

  c.fillStyle = '#0f172a';
  if (o.expr === 'sleep' || o.blink) {
    c.strokeStyle = '#0f172a'; c.lineWidth = 2.5; c.lineCap = 'round';
    c.beginPath(); c.arc(-9, -38, 4, 0, Math.PI); c.stroke();
    c.beginPath(); c.arc(9, -38, 4, 0, Math.PI); c.stroke();
  } else if (o.expr === 'happy') {
    c.strokeStyle = '#0f172a'; c.lineWidth = 2.5;
    c.beginPath(); c.arc(-9, -35, 5, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    c.beginPath(); c.arc(9, -35, 5, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  } else {
    c.beginPath(); c.arc(-9, -38, o.expr === 'surprised' ? 6 : 5, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(9, -38, o.expr === 'surprised' ? 6 : 5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(-7, -40, 2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(11, -40, 2, 0, Math.PI * 2); c.fill();
  }

  c.fillStyle = '#FF8DAA';
  c.beginPath(); c.moveTo(-2, -32); c.lineTo(2, -32); c.lineTo(0, -30); c.closePath(); c.fill();
  c.strokeStyle = '#0f172a'; c.lineWidth = 1.8;
  c.beginPath(); c.arc(-3, -27, 3, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  c.beginPath(); c.arc(3, -27, 3, Math.PI * 1.1, Math.PI * 1.9); c.stroke();

  c.strokeStyle = 'rgba(15, 23, 42, 0.5)'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(-16, -31); c.lineTo(-28, -34); c.stroke();
  c.beginPath(); c.moveTo(-16, -28); c.lineTo(-27, -27); c.stroke();
  c.beginPath(); c.moveTo(16, -31); c.lineTo(28, -34); c.stroke();
  c.beginPath(); c.moveTo(16, -28); c.lineTo(27, -27); c.stroke();
}

export function drawGhostSkin(c, p, o) {
  const isGem = p.theme === 'gemini';
  const floatY = Math.sin(o.time * 3.5) * 5;
  c.translate(0, floatY);

  c.shadowColor = isGem ? 'rgba(155, 114, 203, 0.7)' : 'rgba(0, 194, 154, 0.7)';
  c.shadowBlur = 16;
  c.fillStyle = 'rgba(240, 246, 255, 0.92)';

  const w = 26, topY = -56, baseH = 46;
  c.beginPath();
  c.moveTo(-w, topY + 22);
  c.bezierCurveTo(-w, topY - 8, w, topY - 8, w, topY + 22);
  c.lineTo(w, topY + baseH);

  const wave = Math.sin(o.time * 6) * 3;
  c.quadraticCurveTo(w * 0.66, topY + baseH - 6 + wave, w * 0.33, topY + baseH);
  c.quadraticCurveTo(0, topY + baseH - 8 - wave, -w * 0.33, topY + baseH);
  c.quadraticCurveTo(-w * 0.66, topY + baseH - 6 + wave, -w, topY + baseH);
  c.closePath();
  c.fill();
  c.shadowBlur = 0;

  const arm = o.armUp || 0;
  c.fillStyle = 'rgba(240, 246, 255, 0.95)';
  c.save(); c.translate(-24, -28); c.rotate(0.4 + arm * 2 + Math.sin(o.time * 4) * 0.2);
  rr(c, -4, 0, 8, 12, 4); c.fill(); c.restore();
  c.save(); c.translate(24, -28); c.rotate(-0.4 - arm * 2 - Math.sin(o.time * 4) * 0.2);
  rr(c, -4, 0, 8, 12, 4); c.fill(); c.restore();

  c.fillStyle = '#1e1b4b';
  if (o.expr === 'sleep' || o.blink) {
    c.strokeStyle = '#1e1b4b'; c.lineWidth = 2.5; c.lineCap = 'round';
    c.beginPath(); c.arc(-9, -36, 4, 0, Math.PI); c.stroke();
    c.beginPath(); c.arc(9, -36, 4, 0, Math.PI); c.stroke();
  } else {
    c.beginPath(); c.arc(-9, -36, o.expr === 'surprised' ? 6 : 4.5, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(9, -36, o.expr === 'surprised' ? 6 : 4.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(-7.5, -37.5, 1.8, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(10.5, -37.5, 1.8, 0, Math.PI * 2); c.fill();
  }

  c.fillStyle = isGem ? 'rgba(217, 101, 112, 0.5)' : 'rgba(0, 194, 154, 0.5)';
  c.beginPath(); c.arc(-14, -28, 4, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(14, -28, 4, 0, Math.PI * 2); c.fill();

  c.fillStyle = '#1e1b4b';
  c.beginPath(); c.arc(0, -29, o.expr === 'surprised' ? 3 : 2.2, 0, Math.PI * 2); c.fill();
}

export function drawSlimeSkin(c, p, o) {
  const isGem = p.theme === 'gemini';
  const color1 = isGem ? '#8B5CF6' : '#10B981';
  const color2 = isGem ? '#EC4899' : '#059669';

  const jiggle = o.moving ? Math.sin(o.phase * 2) * 0.15 : Math.sin(o.time * 4) * 0.05;
  c.scale(1 + jiggle, 1 - jiggle);

  const grd = c.createLinearGradient(0, -56, 0, 0);
  grd.addColorStop(0, color1);
  grd.addColorStop(1, color2);
  c.fillStyle = grd;
  c.shadowColor = color1;
  c.shadowBlur = 12;

  c.beginPath();
  c.moveTo(0, -54);
  c.bezierCurveTo(24, -48, 28, -8, 26, 0);
  c.lineTo(-26, 0);
  c.bezierCurveTo(-28, -8, -24, -48, 0, -54);
  c.closePath();
  c.fill();
  c.shadowBlur = 0;

  c.fillStyle = 'rgba(255, 255, 255, 0.4)';
  c.beginPath();
  c.ellipse(-10, -42, 6, 3, -0.4, 0, Math.PI * 2);
  c.fill();

  c.fillStyle = '#0f172a';
  if (o.expr === 'sleep' || o.blink) {
    c.strokeStyle = '#0f172a'; c.lineWidth = 2.5; c.lineCap = 'round';
    c.beginPath(); c.arc(-8, -24, 4, 0, Math.PI); c.stroke();
    c.beginPath(); c.arc(8, -24, 4, 0, Math.PI); c.stroke();
  } else if (o.expr === 'happy') {
    c.strokeStyle = '#0f172a'; c.lineWidth = 2.5;
    c.beginPath(); c.arc(-8, -22, 4.5, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    c.beginPath(); c.arc(8, -22, 4.5, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  } else {
    c.beginPath(); c.arc(-8, -24, 4.5, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(8, -24, 4.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(-6.5, -25.5, 1.8, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(9.5, -25.5, 1.8, 0, Math.PI * 2); c.fill();
  }

  c.fillStyle = 'rgba(255, 100, 160, 0.6)';
  c.beginPath(); c.arc(-13, -17, 3, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(13, -17, 3, 0, Math.PI * 2); c.fill();

  c.strokeStyle = '#0f172a'; c.lineWidth = 1.8;
  c.beginPath(); c.arc(0, -18, 3, 0.2, Math.PI - 0.2); c.stroke();
}

export function drawFoxSkin(c, p, o) {
  const foxColor = '#EA580C';
  const whiteFur = '#FFFFFF';
  const blackPaw = '#1C1917';

  const tailAngle = Math.sin(o.time * 3) * 0.25 + (o.moving ? Math.sin(o.phase) * 0.35 : 0);
  c.save();
  c.translate(-16, -18);
  c.rotate(-0.6 + tailAngle);
  c.fillStyle = foxColor;
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(-22, -10, -26, -34);
  c.quadraticCurveTo(-14, -36, 0, -18);
  c.closePath();
  c.fill();
  c.fillStyle = whiteFur;
  c.beginPath();
  c.moveTo(-20, -25);
  c.quadraticCurveTo(-24, -28, -26, -34);
  c.quadraticCurveTo(-16, -35, -12, -26);
  c.closePath();
  c.fill();
  c.restore();

  const swing = o.moving ? Math.sin(o.phase) * 7 : 0;
  c.fillStyle = foxColor;
  rr(c, -14 + swing, -12, 10, 12, 4); c.fill();
  rr(c, 4 - swing, -12, 10, 12, 4); c.fill();
  c.fillStyle = blackPaw;
  rr(c, -14 + swing, -4, 10, 4, 2); c.fill();
  rr(c, 4 - swing, -4, 10, 4, 2); c.fill();

  const arm = o.armUp || 0;
  c.fillStyle = foxColor;
  c.save(); c.translate(-22, -28); c.rotate(0.3 + arm * 2.2); rr(c, -4, 0, 8, 14, 4); c.fill(); c.restore();
  c.save(); c.translate(22, -28); c.rotate(-0.3 - arm * 2.2); rr(c, -4, 0, 8, 14, 4); c.fill(); c.restore();

  c.fillStyle = foxColor;
  rr(c, -26, -56, 52, 46, 20); c.fill();

  c.fillStyle = whiteFur;
  c.beginPath(); c.moveTo(-26, -26); c.quadraticCurveTo(-14, -22, -2, -32); c.lineTo(-2, -18); c.lineTo(-26, -18); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(26, -26); c.quadraticCurveTo(14, -22, 2, -32); c.lineTo(2, -18); c.lineTo(26, -18); c.closePath(); c.fill();

  c.fillStyle = foxColor;
  c.beginPath(); c.moveTo(-24, -48); c.lineTo(-14, -70); c.lineTo(-4, -53); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(24, -48); c.lineTo(14, -70); c.lineTo(4, -53); c.closePath(); c.fill();
  c.fillStyle = blackPaw;
  c.beginPath(); c.moveTo(-18, -60); c.lineTo(-14, -70); c.lineTo(-9, -62); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(18, -60); c.lineTo(14, -70); c.lineTo(9, -62); c.closePath(); c.fill();
  c.fillStyle = whiteFur;
  c.beginPath(); c.moveTo(-19, -52); c.lineTo(-14, -60); c.lineTo(-9, -54); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(19, -52); c.lineTo(14, -60); c.lineTo(9, -54); c.closePath(); c.fill();

  c.fillStyle = '#1c1917';
  if (o.expr === 'sleep' || o.blink) {
    c.strokeStyle = '#1c1917'; c.lineWidth = 2.5; c.lineCap = 'round';
    c.beginPath(); c.arc(-9, -38, 4, 0, Math.PI); c.stroke();
    c.beginPath(); c.arc(9, -38, 4, 0, Math.PI); c.stroke();
  } else {
    c.beginPath(); c.arc(-9, -38, 4.5, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(9, -38, 4.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(-7.5, -39.5, 1.8, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(10.5, -39.5, 1.8, 0, Math.PI * 2); c.fill();
  }

  c.fillStyle = blackPaw;
  c.beginPath(); c.arc(0, -31, 3, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#1c1917'; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(0, -28); c.lineTo(0, -25); c.stroke();
}

export function drawDuckSkin(c, p, o) {
  const duckYellow = '#FBBF24';
  const beakOrange = '#F97316';

  c.fillStyle = duckYellow;
  c.beginPath();
  c.moveTo(-3, -56);
  c.quadraticCurveTo(-6, -66, 0, -68);
  c.quadraticCurveTo(6, -64, 3, -56);
  c.closePath();
  c.fill();

  const swing = o.moving ? Math.sin(o.phase) * 7 : 0;
  c.fillStyle = beakOrange;
  rr(c, -16 + swing, -6, 13, 6, 3); c.fill();
  rr(c, 3 - swing, -6, 13, 6, 3); c.fill();

  const flap = o.moving ? Math.sin(o.phase * 2) * 0.8 : (o.armUp ? 1.4 : 0);
  c.fillStyle = '#F59E0B';
  c.save(); c.translate(-22, -30); c.rotate(0.3 + flap); rr(c, -5, 0, 9, 16, 5); c.fill(); c.restore();
  c.save(); c.translate(22, -30); c.rotate(-0.3 - flap); rr(c, -4, 0, 9, 16, 5); c.fill(); c.restore();

  c.fillStyle = duckYellow;
  rr(c, -26, -56, 52, 50, 22); c.fill();

  c.fillStyle = '#0f172a';
  if (o.expr === 'sleep' || o.blink) {
    c.strokeStyle = '#0f172a'; c.lineWidth = 2.5; c.lineCap = 'round';
    c.beginPath(); c.arc(-9, -38, 4, 0, Math.PI); c.stroke();
    c.beginPath(); c.arc(9, -38, 4, 0, Math.PI); c.stroke();
  } else {
    c.beginPath(); c.arc(-9, -38, 4.5, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(9, -38, 4.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(-7.5, -39.5, 1.8, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(10.5, -39.5, 1.8, 0, Math.PI * 2); c.fill();
  }

  c.fillStyle = beakOrange;
  const talkMouth = o.talking ? Math.sin(o.time * 16) * 3 : 0;
  rr(c, -11, -32 - talkMouth, 22, 11 + talkMouth, 5); c.fill();
  c.fillStyle = 'rgba(0,0,0,0.15)';
  c.beginPath(); c.arc(-4, -28, 1.2, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(4, -28, 1.2, 0, Math.PI * 2); c.fill();

  c.fillStyle = 'rgba(239, 68, 68, 0.4)';
  c.beginPath(); c.arc(-15, -28, 3.5, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(15, -28, 3.5, 0, Math.PI * 2); c.fill();
}

export function drawHeadphones(c, pet, o) {
  c.save();
  const bob = Math.sin((o.time || 0) * 6) * 1.5;
  c.translate(0, bob);

  const neonGreen = '#1DB954';
  const darkPad = '#121212';
  const bandGray = '#2b2d42';

  // Arco superior por cima da cabeça
  c.strokeStyle = bandGray;
  c.lineWidth = 4;
  c.lineCap = 'round';
  c.beginPath();
  c.arc(0, -42, 28, Math.PI * 1.08, Math.PI * 1.92);
  c.stroke();

  // Estofamento acolchoado do topo
  c.strokeStyle = '#3d405b';
  c.lineWidth = 6;
  c.beginPath();
  c.arc(0, -42, 28, Math.PI * 1.25, Math.PI * 1.75);
  c.stroke();

  // Conchas laterais nos ouvidos
  for (const side of [-1, 1]) {
    c.save();
    c.translate(side * 26, -40);
    // Haste metálica
    c.fillStyle = '#4a4e69';
    c.fillRect(-2, -6, 4, 8);
    // Concha preta estilo DJ
    c.fillStyle = darkPad;
    rr(c, -5, -12, 10, 24, 5); c.fill();
    // Borda neon Spotify com glow
    c.strokeStyle = neonGreen;
    c.lineWidth = 1.8;
    c.shadowColor = neonGreen;
    c.shadowBlur = 8;
    rr(c, -5, -12, 10, 24, 5); c.stroke();
    // Led central
    c.fillStyle = neonGreen;
    c.beginPath(); c.arc(0, 0, 2.6, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
    c.restore();
  }
  c.restore();
}

export function drawLaptop(c, pet, o) {
  c.save();
  // Posicionado em frente ao pet (graças a c.scale(s * pet.dir), +x é a frente)
  const lx = 14, ly = 0;
  const typing = Math.sin((o.time || 0) * 20);

  // Sombra do laptop
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.beginPath(); c.ellipse(lx + 8, ly - 1, 14, 3, 0, 0, Math.PI * 2); c.fill();

  // Base do laptop
  c.fillStyle = '#1e293b';
  c.beginPath();
  c.moveTo(lx, ly - 1);
  c.lineTo(lx + 20, ly - 1);
  c.lineTo(lx + 18, ly - 6);
  c.lineTo(lx + 2, ly - 6);
  c.closePath();
  c.fill();
  c.strokeStyle = '#334155';
  c.lineWidth = 1;
  c.stroke();

  // Teclado iluminado
  c.strokeStyle = pet.theme === 'gemini' ? 'rgba(124, 244, 255, 0.7)' : 'rgba(85, 255, 210, 0.7)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(lx + 4, ly - 3); c.lineTo(lx + 16, ly - 3);
  c.moveTo(lx + 5, ly - 5); c.lineTo(lx + 15, ly - 5);
  c.stroke();

  // Tela aberta e inclinada
  c.save();
  c.translate(lx + 18, ly - 6);
  c.rotate(-0.25);

  // Carcaça traseira
  c.fillStyle = '#0f172a';
  rr(c, 0, -20, 3, 20, 1.5); c.fill();

  // Display brilhante
  c.fillStyle = '#050814';
  rr(c, -16, -20, 16, 20, 2); c.fill();
  c.strokeStyle = '#475569';
  c.lineWidth = 0.8;
  c.stroke();

  // Linhas de código animadas rodando na tela
  const codeColor = pet.theme === 'gemini' ? '#38bdf8' : '#34d399';
  c.shadowColor = codeColor;
  c.shadowBlur = 6;
  c.fillStyle = codeColor;

  const tOffset = ((o.time || 0) * 8) % 4;
  for (let row = 0; row < 4; row++) {
    const rowY = -17 + row * 4;
    const rowW = 6 + Math.abs(Math.sin(row * 2.5 + tOffset)) * 8;
    rr(c, -14, rowY, rowW, 2, 0.8); c.fill();
  }
  c.shadowBlur = 0;
  c.restore();

  // Mãozinhas/patinhas animadas digitando rapidamente no teclado
  c.fillStyle = pet.theme === 'gemini' ? '#5a68d8' : '#0d8364';
  c.save();
  c.translate(8, -10 + typing * 2);
  c.rotate(0.5);
  rr(c, -3, 0, 6, 10, 3); c.fill();
  c.restore();

  c.save();
  c.translate(14, -10 - typing * 2);
  c.rotate(0.65);
  rr(c, -3, 0, 6, 10, 3); c.fill();
  c.restore();

  c.restore();
}

export function drawPet(c, pet, o) {
  if (pet.state === 'hide' && pet.hideType === 'box') {
    c.save();
    c.translate(pet.x, ground());
    const wiggle = Math.sin((o.time || 0) * 5) * 1.8;
    c.rotate((wiggle * Math.PI) / 180);
    // Box shadow
    c.fillStyle = 'rgba(0,0,0,0.2)';
    c.beginPath(); c.ellipse(0, -1, 26, 4.5, 0, 0, Math.PI * 2); c.fill();
    // Cardboard box body
    c.fillStyle = '#b48a58';
    rr(c, -24, -44, 48, 42, 7); c.fill();
    c.strokeStyle = '#8d6335'; c.lineWidth = 1.6; c.stroke();
    // Tape strip
    c.fillStyle = 'rgba(235, 206, 155, 0.7)';
    rr(c, -6, -44, 12, 42, 2); c.fill();
    // Cutout eye slit
    c.fillStyle = '#1a1410';
    rr(c, -14, -30, 28, 10, 5); c.fill();
    // Glowing blinking eyes
    const eyeColor = pet.theme === 'gemini' ? '#7cf4ff' : '#55ffd2';
    c.fillStyle = eyeColor;
    c.shadowColor = eyeColor; c.shadowBlur = 6;
    const eyeShift = Math.sin((o.time || 0) * 2.5) * 4;
    c.beginPath(); c.arc(-6 + eyeShift, -25, 3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(6 + eyeShift, -25, 3, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
    // Box label
    c.font = `bold 9px ${FONT}`;
    c.fillStyle = '#5c3d18';
    c.textAlign = 'center';
    c.fillText(pet.name, 0, -10);
    c.restore();
    return;
  }

  // Escala reduzida para tamanho menor e mais delicado na taskbar (~82%)
  const BASE_SCALE = 0.82;
  const s = (o.scale || 1) * BASE_SCALE;
  const sq = o.squash || 0;
  const bob = o.moving ? -Math.abs(Math.sin(o.phase)) * 4 : Math.sin(o.time * 2.2) * 1.2;

  c.save();
  if (pet.state === 'hide' && pet.hideType === 'taskbar') {
    c.beginPath();
    c.rect(0, 0, world.W, ground() + 4);
    c.clip();
  }

  c.translate(pet.x, pet.y);
  c.scale(s * (pet.dir || 1) * (1 + sq), s * (1 - sq));
  c.translate(0, bob);

  const skin = pet.skin || 'robot';
  switch (skin) {
    case 'cat': drawCatSkin(c, pet, o); break;
    case 'ghost': drawGhostSkin(c, pet, o); break;
    case 'slime': drawSlimeSkin(c, pet, o); break;
    case 'fox': drawFoxSkin(c, pet, o); break;
    case 'duck': drawDuckSkin(c, pet, o); break;
    case 'robot':
    default:
      drawRobotSkin(c, pet, o);
      break;
  }

  // Se o usuário está ouvindo Spotify: coloca fones de ouvido estilo DJ! 🎧
  if (world.appContext.spotify && pet.state !== 'sleep') {
    drawHeadphones(c, pet, o);
  }

  // Se o usuário está com o Antigravity IDE aberto: coloca notebook e fica codando! 💻
  if (world.appContext.antigravity && pet.state !== 'sleep' && pet.state !== 'drag') {
    drawLaptop(c, pet, o);
  }

  c.restore();
}
