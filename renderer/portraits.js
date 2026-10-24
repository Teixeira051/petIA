import { ALL_CHARACTERS, pets, world } from './core.js';
import { drawRobotSkin, drawCatSkin, drawGhostSkin, drawSlimeSkin, drawFoxSkin, drawDuckSkin } from './skins.js';

const painters = { robot: drawRobotSkin, cat: drawCatSkin, ghost: drawGhostSkin, slime: drawSlimeSkin, fox: drawFoxSkin, duck: drawDuckSkin };
const bounds = { robot: [78, 96], cat: [86, 90], ghost: [78, 82], slime: [90, 76], fox: [112, 88], duck: [88, 82] };
const painted = new WeakMap();

// Reuse the desktop pet artwork. Portraits are static and redraw only when the
// selected skin, theme, CSS size, or display density changes.
export function paintPortrait(canvas, petOrID, { skin } = {}) {
  if (!canvas?.getContext) return;
  const id = typeof petOrID === 'string' ? petOrID : petOrID?.id;
  const definition = ALL_CHARACTERS.find((pet) => pet.id === id) || ALL_CHARACTERS[0];
  const pet = typeof petOrID === 'object' && petOrID ? petOrID : pets.find((item) => item.id === id) || definition;
  const selectedSkin = skin || pet.skin || definition.skin;
  const selected = painters[selectedSkin] ? selectedSkin : 'robot';
  const width = Math.max(1, Math.round(canvas.clientWidth || 72));
  const height = Math.max(1, Math.round(canvas.clientHeight || 72));
  const density = Math.max(1, window.devicePixelRatio || 1);
  const key = [selected, pet.theme, width, height, density].join(':');
  if (painted.get(canvas) === key) return;
  canvas.width = Math.round(width * density);
  canvas.height = Math.round(height * density);
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(density, 0, 0, density, 0, 0);
  context.clearRect(0, 0, width, height);
  const [artWidth, artHeight] = bounds[selected];
  const scale = Math.min(width / artWidth, height / artHeight) * .93;
  context.save();
  context.translate(width * (selected === 'fox' ? .43 : .5), height * .89);
  context.scale(scale, scale);
  painters[selected](context, { ...pet, state: 'idle', dir: 1, skin: selected }, { expr: 'happy', time: 0, phase: 0, moving: false, blink: false });
  context.restore();
  painted.set(canvas, key);
}

export function refreshPortraits() {
  document.querySelectorAll('canvas[data-pet-portrait]').forEach((canvas) => paintPortrait(canvas, canvas.dataset.petPortrait));
  const selectedPet = world.activeModalPet || world.hoveredPet || pets[0] || ALL_CHARACTERS[0];
  document.querySelectorAll('canvas[data-skin-portrait]').forEach((canvas) => paintPortrait(canvas, selectedPet, { skin: canvas.dataset.skinPortrait }));
}
