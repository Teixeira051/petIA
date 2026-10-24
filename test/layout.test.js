const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The renderer module is intentionally browser-native ESM. Import its pure
// geometry without introducing a second implementation or DOM test doubles.
const source = fs.readFileSync(path.join(__dirname, '../renderer/layout.js'), 'utf8');
const layout = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function assertInside(box, viewport) {
  for (const value of Object.values(box)) assert.ok(Number.isFinite(value));
  assert.ok(box.width > 0 && box.height > 0);
  assert.ok(box.left >= 0 && box.top >= 0);
  assert.ok(box.left + box.width <= viewport.width + 0.001);
  assert.ok(box.top + box.height <= viewport.height + 0.001);
}

test('chats ficam dentro de cada monitor ao mudar resolução e posição do pet', async () => {
  const { getChatLayout } = await layout;
  for (const [width, height] of [[2560, 700], [1920, 700], [1280, 600], [768, 480], [480, 360], [320, 240], [100, 80], [1, 1]]) {
    for (const anchor of [-1920, 0, width / 2, width, 99999]) {
      const viewport = { width, height };
      const box = getChatLayout(viewport, anchor);
      assertInside(box, viewport);
      assert.equal(box.centerX, box.left + box.width / 2);
      assert.ok(box.petY >= 0 && box.petY < height);
    }
  }
  const desktop = getChatLayout({ width: 1920, height: 700 }, 1840);
  assert.equal(desktop.width, 408);
  assert.equal(desktop.height, 520);
  assert.ok(desktop.top - 10 >= 72, 'O pet inteiro deve caber acima do chat no desktop');
  const short = getChatLayout({ width: 800, height: 480 }, 790);
  assert.ok(short.height < desktop.height, 'A altura reduzida deve diminuir o painel em vez de esconder seu cabeçalho');
  assert.ok(short.petY >= 72);
});

test('DPI altera a nitidez do canvas sem alterar coordenadas ou tamanho do chat', async () => {
  const { getCanvasMetrics, getChatLayout } = await layout;
  const viewport = { width: 1280, height: 600 };
  const expected = getChatLayout(viewport, 1100);
  for (const ratio of [1, 1.25, 1.5, 2]) {
    const metrics = getCanvasMetrics(viewport, ratio);
    assert.equal(metrics.pixelWidth, 1280 * ratio);
    assert.equal(metrics.pixelHeight, 600 * ratio);
    assert.equal(metrics.width, 1280);
    assert.equal(metrics.height, 600);
    assert.deepEqual(getChatLayout({ ...viewport, scaleFactor: ratio, x: -2560 }, 1100), expected);
  }
});

test('HUD e menus grandes são limitados mesmo em monitores menores que o conteúdo', async () => {
  const { fitPanel } = await layout;
  for (const viewport of [{ width: 320, height: 240 }, { width: 1920, height: 700 }, { width: 1, height: 1 }]) {
    for (const location of [{ x: -1000, y: -800 }, { x: 5000, y: 4000 }]) {
      assertInside(fitPanel(viewport, { width: 480, height: 900 }, location), viewport);
    }
  }
});

test('clamp de pets não cria posições fora da tela quando o intervalo não cabe', async () => {
  const { clampCenter, getCanvasMetrics } = await layout;
  for (const width of [1, 20, 40, 320, 1920]) {
    for (const value of [-100, NaN, 0, 10000]) {
      const position = clampCenter(value, width, 50);
      assert.ok(position >= 0 && position <= width);
      if (width <= 100) assert.equal(position, width / 2);
    }
  }
  assert.deepEqual(getCanvasMetrics({ width: 0, height: NaN }, -1), { width: 1, height: 1, pixelRatio: 1, pixelWidth: 1, pixelHeight: 1 });
});

test('até quatro pets repartem o espaço disponível sem se empilhar nas bordas', async () => {
  const { getPetSlot } = await layout;
  for (const width of [320, 768, 1920]) {
    for (const count of [1, 2, 3, 4]) {
      const positions = Array.from({ length: count }, (_unused, index) => getPetSlot(width, index, count));
      assert.equal(new Set(positions).size, count);
      for (const position of positions) assert.ok(position >= 50 && position <= width - 50);
      for (let i = 1; i < positions.length; i++) assert.ok(positions[i - 1] - positions[i] >= 60);
    }
  }
  assert.equal(getPetSlot(20, 0, 4), 10);
});

test('balões quebram palavras longas e limitam texto sem perder caracteres Unicode', async () => {
  const { wrapBubbleText } = await layout;
  const measure = (text) => Array.from(text).length * 7;
  for (const text of ['Uma frase que passa muito da borda do monitor', 'supercalifragilisticexpialidocious', 'Olá 🦊✨ vamos brincar com você na outra tela']) {
    const lines = wrapBubbleText(text, 70, measure);
    assert.ok(lines.length > 0 && lines.length <= 3);
    for (const line of lines) assert.ok(measure(line) <= 70);
    assert.ok(lines.at(-1).endsWith('…'));
    assert.ok(!lines.join('').includes('\uFFFD'));
  }
  assert.deepEqual(wrapBubbleText('Oi 🦊!', 100, measure), ['Oi 🦊!']);
});
