// All geometry uses CSS pixels inside one monitor's window. Display origins and
// physical pixel density belong to the main process and canvas backing store.
const positive = (value, fallback = 1) => Number.isFinite(value) && value > 0 ? value : fallback;
const within = (value, low, high) => Math.max(low, Math.min(high, value));

export function normalizeViewport(viewport = {}) {
  return { width: positive(viewport.width), height: positive(viewport.height) };
}

export function clampCenter(value, width, padding = 30) {
  width = positive(width);
  const inset = Math.min(Math.max(0, padding), width / 2);
  return within(Number.isFinite(value) ? value : width / 2, inset, width - inset);
}

export function getPetSlot(width, index, total) {
  width = positive(width);
  const count = Math.max(1, Math.floor(positive(total)));
  const left = Math.min(50, width / 2);
  const right = Math.max(left, width - Math.min(80, width / 2));
  const spacing = count > 1 ? Math.min(130, (right - left) / (count - 1)) : 0;
  return right - within(Number.isFinite(index) ? index : 0, 0, count - 1) * spacing;
}

export function fitPanel(viewport, panel, { x = 0, y = 0, margin = 12 } = {}) {
  const view = normalizeViewport(viewport);
  const inset = Math.min(Math.max(0, margin), Math.max(0, (Math.min(view.width, view.height) - 1) / 2));
  const width = Math.min(positive(panel.width), view.width - inset * 2);
  const height = Math.min(positive(panel.height), view.height - inset * 2);
  return {
    width, height,
    left: within(Number.isFinite(x) ? x : inset, inset, view.width - width - inset),
    top: within(Number.isFinite(y) ? y : inset, inset, view.height - height - inset),
  };
}

export function getChatLayout(viewport, anchorX) {
  const view = normalizeViewport(viewport);
  const margin = Math.min(12, Math.max(0, (Math.min(view.width, view.height) - 1) / 2));
  // Keep the pet above its panel on ordinary screens; very short windows give
  // priority to a usable, scrollable conversation instead of a negative top.
  const petSpace = Math.min(90, Math.max(margin, view.height - 240 - margin));
  const width = Math.min(408, view.width - margin * 2);
  const height = Math.min(520, Math.max(1, view.height - petSpace - margin));
  const centerX = clampCenter(anchorX, view.width, width / 2 + margin);
  const panel = fitPanel(view, { width, height }, { x: centerX - width / 2, y: view.height - height - margin, margin });
  return { ...panel, centerX: panel.left + panel.width / 2, petY: within(panel.top - 10, Math.min(72, view.height - 1), Math.max(0, view.height - 1)) };
}

export function getCanvasMetrics(viewport, pixelRatio = 1) {
  const view = normalizeViewport(viewport);
  const ratio = positive(pixelRatio);
  return { ...view, pixelRatio: ratio, pixelWidth: Math.max(1, Math.round(view.width * ratio)), pixelHeight: Math.max(1, Math.round(view.height * ratio)) };
}

export function wrapBubbleText(text, maxWidth, measure, maxLines = 3) {
  const lines = [];
  let line = '';
  for (const word of String(text).trim().split(/\s+/u)) {
    if (!word) continue;
    const joined = line ? `${line} ${word}` : word;
    if (measure(joined) <= maxWidth) { line = joined; continue; }
    if (line) { lines.push(line); line = ''; }
    for (const character of word) {
      if (line && measure(line + character) > maxWidth) { lines.push(line); line = ''; }
      line += character;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  let tail = visible.at(-1);
  while (tail && measure(`${tail}…`) > maxWidth) tail = Array.from(tail).slice(0, -1).join('');
  visible[visible.length - 1] = `${tail}…`;
  return visible;
}
