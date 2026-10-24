const { test } = require('node:test');
const assert = require('node:assert/strict');
const { overlayBounds, describeDisplays, petAssignments, viewportFor } = require('../lib/displays');

const primary = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 };
const secondary = { id: 2, bounds: { x: -2560, y: -200, width: 2560, height: 1440 }, workArea: { x: -2520, y: -200, width: 2520, height: 1440 }, scaleFactor: 1.5 };

test('cada overlay fica dentro da área útil, inclusive monitores à esquerda e taskbar lateral', () => {
  assert.deepEqual(overlayBounds(primary), { x: 0, y: 260, width: 1920, height: 780 });
  assert.deepEqual(overlayBounds(secondary), { x: -2520, y: 460, width: 2520, height: 780 });
  assert.equal(overlayBounds({ workArea: { x: 0, y: 24, width: 800, height: 456 } }).height, 456);
});

test('resolução física e coordenadas lógicas respeitam escalas diferentes', () => {
  const displays = describeDisplays([secondary, primary], 1);
  assert.equal(displays[0].id, '1');
  assert.deepEqual(displays[1].resolution, { width: 3840, height: 2160 });
  assert.equal(displays[1].windowBounds.x, -2520);
});

test('pets são distribuídos sem duplicação e preferências sobrevivem à reconexão', () => {
  const displays = describeDisplays([primary, secondary], 1);
  assert.deepEqual(petAssignments(displays, 4), { gemi: '1', codex: '2', claude: '1', sparky: '2' });
  const preferences = { gemi: '2', codex: '1' };
  assert.deepEqual(petAssignments(displays.slice(0, 1), 2, preferences), { gemi: '1', codex: '1' });
  assert.deepEqual(petAssignments(displays, 2, preferences), { gemi: '2', codex: '1' });
  assert.deepEqual(viewportFor(displays[1], displays, 4).visiblePetIds, ['codex', 'sparky']);
});
