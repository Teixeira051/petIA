import { $, $$, api, clamp } from './core.js';

export const SoundSystem = (() => {
  let actx = null;
  let enabled = true;
  let vol = 0.55;

  function ctx() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
    if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  }

  window.addEventListener('pointerdown', () => ctx(), { once: true });
  window.addEventListener('keydown', () => ctx(), { once: true });

  function tone(f, dur, type = 'sine', gainVal = 0.2, destF = null, delay = 0) {
    if (!enabled) return;
    setTimeout(() => {
      try {
        const ac = ctx();
        if (!ac) return;
        const osc = ac.createOscillator();
        const g = ac.createGain();
        const t = ac.currentTime;

        osc.type = type;
        osc.frequency.setValueAtTime(f, t);
        if (destF) osc.frequency.exponentialRampToValueAtTime(destF, t + dur);

        const v = gainVal * vol;
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(v, t + Math.min(0.015, dur * 0.2));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

        osc.connect(g);
        g.connect(ac.destination);

        osc.start(t);
        osc.stop(t + dur);
      } catch {}
    }, delay);
  }

  return {
    isEnabled: () => enabled,
    setEnabled: (b) => { enabled = !!b; syncAudioUI(); },
    toggle: () => {
      enabled = !enabled;
      syncAudioUI();
      api.setSettings({ sound: enabled });
      if (enabled) tone(540, 0.07, 'sine', 0.22, 920);
      return enabled;
    },
    setVolume: (v) => { vol = clamp(v, 0, 1); },

    pop() { tone(540, 0.07, 'sine', 0.22, 920); },
    chirp(high = false) {
      tone(high ? 780 : 620, 0.11, 'sine', 0.24, high ? 1220 : 880);
    },
    eat() {
      tone(260, 0.07, 'triangle', 0.28, 140, 0);
      tone(340, 0.08, 'triangle', 0.26, 180, 75);
      tone(420, 0.09, 'sine', 0.22, 220, 150);
    },
    snore() {
      tone(320, 0.45, 'sine', 0.12, 250);
    },
    wake() {
      tone(523.25, 0.09, 'sine', 0.2, null, 0);
      tone(659.25, 0.09, 'sine', 0.22, null, 80);
      tone(783.99, 0.14, 'sine', 0.25, null, 160);
      tone(1046.5, 0.22, 'sine', 0.26, null, 240);
    },
    hide() {
      tone(580, 0.11, 'triangle', 0.18, 420, 0);
      tone(420, 0.13, 'triangle', 0.16, 290, 110);
    },
    found() {
      tone(587.33, 0.09, 'sine', 0.24, null, 0);
      tone(783.99, 0.11, 'sine', 0.28, null, 90);
      tone(987.77, 0.22, 'sine', 0.32, null, 200);
    },
    bounce() { tone(220, 0.08, 'sine', 0.3, 440); },
    score() {
      tone(659.25, 0.11, 'sine', 0.22, null, 0);
      tone(880, 0.13, 'sine', 0.25, null, 100);
      tone(1318.5, 0.22, 'sine', 0.28, null, 210);
    },
    send() { tone(420, 0.09, 'sine', 0.18, 720); },
    receive() {
      tone(880, 0.11, 'sine', 0.2, null, 0);
      tone(1174.66, 0.17, 'sine', 0.24, null, 80);
    },
    tool() {
      tone(320, 0.08, 'sawtooth', 0.14, 640, 0);
      tone(640, 0.12, 'sine', 0.2, 1280, 75);
    },
  };
})();

export function syncAudioUI() {
  const on = SoundSystem.isEnabled();
  const icon = on ? '🔊' : '🔇';
  const hudIcon = $('#hud-sound-icon');
  if (hudIcon) hudIcon.textContent = icon;
  const actSoundLbl = $('#act-sound-label');
  if (actSoundLbl) actSoundLbl.textContent = on ? 'Som' : 'Mudo';
  $$('.btn-sound').forEach((b) => {
    b.textContent = icon;
    b.title = on ? 'Silenciar sons' : 'Ativar sons';
  });
}
