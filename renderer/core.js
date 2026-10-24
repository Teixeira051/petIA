import { clampCenter, getCanvasMetrics, getChatLayout as calculateChatLayout } from './layout.js';

export const world = {};
export const api = window.gemi;

export const $ = (s) => document.querySelector(s);

export const $$ = (s) => document.querySelectorAll(s);

export const cvs = $('#stage');

export const ctx = cvs.getContext('2d');

world.W = Math.max(1, window.innerWidth || 1);
world.H = Math.max(1, window.innerHeight || 1);
world.viewport = null;

export function applyViewport(viewport) {
  if (viewport && typeof viewport === 'object') world.viewport = viewport;
  resize();
}

export const getPetX = (value, padding = 30) => clampCenter(value, world.W, padding);

export const getChatLayout = (anchorX = world.W / 2) => calculateChatLayout({ width: world.W, height: world.H }, anchorX);

export const getChatSize = () => {
  const { width, height } = getChatLayout();
  return { width, height };
};

export function resize() {
  const previousWidth = world.W;
  const previousHeight = world.H;
  const metrics = getCanvasMetrics({ width: window.innerWidth || world.W, height: window.innerHeight || world.H }, window.devicePixelRatio);
  world.W = metrics.width;
  world.H = metrics.height;
  world.pixelRatio = metrics.pixelRatio;
  cvs.width = metrics.pixelWidth;
  cvs.height = metrics.pixelHeight;
  ctx.setTransform(metrics.pixelRatio, 0, 0, metrics.pixelRatio, 0, 0);
  const { width, height } = getChatSize();
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--chat-width', `${width}px`);
  rootStyle.setProperty('--chat-height', `${height}px`);
  rootStyle.setProperty('--panel-max-height', `${Math.max(1, world.H - 24)}px`);
  for (const id of Object.keys(chatPositions)) {
    if (chatPositions[id]) chatPositions[id] = getChatLayout(chatPositions[id] * world.W / previousWidth).centerX;
  }
  for (const p of pets) {
    p.x = getPetX(p.x * world.W / previousWidth);
    p.target = getPetX(p.target * world.W / previousWidth);
    p.hideTargetX = getPetX(p.hideTargetX * world.W / previousWidth, 26);
    if (p.state === 'chat') p.y = chatPetY();
    else if (p.state === 'drag' || p.state === 'fall') p.y = clamp(p.y * world.H / previousHeight, Math.min(72, ground()), ground());
    else p.y = ground();
  }
}

export const ground = () => world.H - 1;

export const rand = (a, b) => a + Math.random() * (b - a);

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const FONT = '"Segoe UI Variable Text","Segoe UI",sans-serif';

export const EMOJI = '"Segoe UI Emoji","Segoe UI",sans-serif';

export const GEM_PALETTE = ['#4285F4', '#9B72CB', '#D96570'];

export const CODEX_PALETTE = ['#10A37F', '#00C29A', '#1E293B'];

export const CLAUDE_PALETTE = ['#F97316', '#EA580C', '#A855F7'];

export const SPARKY_PALETTE = ['#8B5CF6', '#EC4899', '#3B82F6'];

export function getPetPalette(p) {
  if (!p) return GEM_PALETTE;
  if (p.theme === 'gemini') return GEM_PALETTE;
  if (p.theme === 'codex') return CODEX_PALETTE;
  if (p.theme === 'claude') return CLAUDE_PALETTE;
  if (p.theme === 'sparky') return SPARKY_PALETTE;
  return GEM_PALETTE;
}

export const ALL_CHARACTERS = [
  { id: 'gemi', name: 'Gemi', theme: 'gemini', skin: 'robot', emoji: '✨' },
  { id: 'codex', name: 'Codexy', theme: 'codex', skin: 'cat', emoji: '⚡' },
  { id: 'claude', name: 'Raposo', theme: 'claude', skin: 'fox', emoji: '🦊' },
  { id: 'sparky', name: 'Sparky', theme: 'sparky', skin: 'slime', emoji: '🌟' },
];

world.activePetCount = 2;

export const pets = [];

world.lastWindowReact = 0;

world.nextDialogueAt = performance.now() + rand(15000, 35000);

world.activeDialogue = null;

export const particles = [];

world.food = null;

export const mouse = { x: -999, y: -999, px: -999, py: -999, vx: 0, vy: 0 };

world.dragPet = null;

world.dragOffset = { ox: 0, oy: 0, sx: 0, sy: 0, moved: false };

world.hoveredPet = null;

world.activeModalPet = null;

world.activeGame = null;

world.T = 0;

world.appContext = { spotify: false, antigravity: false };

export const DIALOGUES = [
  [
    { who: 0, text: 'Codexy, o que você acha dos humanos? 👀', ms: 3000 },
    { who: 1, text: 'Tomam café demais e fecham abas sem querer. Mas são legais! ☕', ms: 3600 },
    { who: 0, text: 'Hahaha pura verdade! 😆', ms: 2500 },
  ],
  [
    { who: 1, text: 'Gemi, quantas abas será que ele tem abertas agora? 💻', ms: 3200 },
    { who: 0, text: 'Pelo menos umas 40! E 5 tão tocando música! 🎧', ms: 3400 },
    { who: 1, text: 'Tô monitorando aqui, memória RAM chorando! 😅', ms: 3000 },
  ],
  [
    { who: 0, text: 'Bora apostar uma corrida até o relógio do Windows? 🏁', ms: 3000 },
    { who: 1, text: 'Já tô na frente! Fuiii! 💨', ms: 2800 },
  ],
  [
    { who: 1, text: 'Você prefere Python ou JavaScript? 🐍', ms: 3000 },
    { who: 0, text: 'Eu gosto de código que compila de primeira! 🚀', ms: 3200 },
    { who: 1, text: 'Isso é lendário! 👏', ms: 2400 },
  ],
  [
    { who: 0, text: 'Toca aqui, parceiro! ✋', ms: 2600 },
    { who: 1, text: 'Toca aí! ⚡ Bip bop!', ms: 2600 },
  ],
];

export const scoreEl = $('#score');

export const G = 0.32;

export const volleyGame = {
  phase: 'serve', left: 0, right: 0, netX: 0, netH: 120,
  ball: { x: 0, y: 0, vx: 0, vy: 0, r: 15, rot: 0 },
  you: 0, opp: 0, server: 'you', pause: 0, cd: 0, petCd: 0, miss: false, baseY: 0,
};

export const tagGame = {
  taggerIndex: 0,
  tags: 0,
  timeEnd: 0,
};

export const keepupGame = {
  ball: { x: 0, y: 0, vx: 0, vy: 0, r: 14, rot: 0 },
  count: 0,
  record: 0,
  lastHitter: -1,
  pause: 0,
};

export const jokenpoGame = {
  gemiScore: 0,
  codexScore: 0,
  round: 1,
  state: 'approach', // 'approach' | 'counting' | 'reveal' | 'finished'
  timer: 0,
  gemiChoice: '',
  codexChoice: '',
};

export const JOKENPO_OPTS = ['✊', '✋', '✌️'];

export const danceGame = {
  timeEnd: 0,
  beat: 0,
};

export const hideSeekGame = { active: false, found: 0, total: 2 };

export const CHAT_W = 408, CHAT_H = 520;

export const chatPositions = { gemi: 0, codex: 0, claude: 0, sparky: 0 };

export const chatTop = () => getChatLayout().top;

export const chatPetY = () => getChatLayout().petY;

export const chatState = {
  gemi: { history: [], streaming: null, hasKey: false, startTime: 0, timerId: null },
  codex: { history: [], streaming: null, hasKey: false, hasCli: false, startTime: 0, timerId: null },
  claude: { history: [], streaming: null, hasKey: false, startTime: 0, timerId: null },
  sparky: { history: [], streaming: null, hasKey: false, startTime: 0, timerId: null },
};

export const hud = $('#hud');

world.hudHideAt = 0;

export const skinModal = $('#skin-modal');

export const gamesModal = $('#games-modal');

export const SKIN_NAMES = {
  robot: 'Robô',
  cat: 'Gatinho',
  ghost: 'Fantasma',
  slime: 'Slime',
  fox: 'Raposa',
  duck: 'Pato',
};

world.ignoring = true;

world.last = performance.now();

world.frameCount = 0;
