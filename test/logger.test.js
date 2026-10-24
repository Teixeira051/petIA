const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLogger } = require('../lib/logger');

test('log faz rotação limitada e remove chaves conhecidas', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gemi-log-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'boot.log');
  const log = createLogger(file, { maxBytes: 256, secrets: () => ['test-secret'] });
  for (let i = 0; i < 100; i++) log('test-secret', 'mensagem ' + i);
  assert.equal(fs.readdirSync(directory).length, 2);
  for (const name of [file, file + '.1']) {
    assert.ok(fs.statSync(name).size <= 256);
    assert.ok(!fs.readFileSync(name, 'utf8').includes('test-secret'));
  }
});
