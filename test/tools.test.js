const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createToolExecutor, resolveToolRequest } = require('../lib/tool-executor');

for (const name of ['chamar_codex', 'abrir_antigravity']) {
  test(name + ': nenhuma execução antes de aprovação explícita', async () => {
    let approve;
    let calls = 0;
    const run = createToolExecutor({ confirm: () => new Promise((resolve) => { approve = resolve; }), runCodex: () => { calls++; return { ok: true }; }, runAntigravity: () => { calls++; return { ok: true }; } });
    const pending = run(name, { tarefa: 'listar arquivos' });
    assert.equal(calls, 0);
    approve(false);
    assert.equal((await pending).canceled, true);
    assert.equal(calls, 0);
    const approved = run(name, { tarefa: 'listar arquivos' });
    assert.equal(calls, 0);
    approve(true);
    assert.equal((await approved).ok, true);
    assert.equal(calls, 1);
  });
}

test('pasta padrão e acesso exatos são apresentados antes da execução', async (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'gemi-tool-test-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const events = [];
  const run = createToolExecutor({ confirm: async (request) => { events.push(['confirm', request]); return true; }, runCodex: async (request) => { events.push(['run', request]); return { ok: true }; } });
  await run('chamar_codex', { tarefa: 'teste' }, { defaultFolder: folder });
  assert.equal(events[0][0], 'confirm');
  assert.equal(events[0][1].pasta, fs.realpathSync(folder));
  assert.equal(events[0][1].writable, true);
  assert.deepEqual(events[1][1], events[0][1]);
  assert.equal(resolveToolRequest('chamar_codex', { tarefa: 'teste' }).writable, false);
});

test('cancelamento durante aprovação impede execução; chamadas concorrentes são recusadas', async () => {
  let approve;
  let called = false;
  const ac = new AbortController();
  const run = createToolExecutor({ confirm: () => new Promise((resolve) => { approve = resolve; }), runCodex: () => { called = true; } });
  const pending = run('chamar_codex', { tarefa: 'teste' }, { signal: ac.signal });
  assert.match((await run('chamar_codex', { tarefa: 'outra' })).text, /pendente/);
  ac.abort();
  approve(true);
  assert.equal((await pending).canceled, true);
  assert.equal(called, false);
});

test('ferramenta, tarefa e pasta inválidas nunca chegam à confirmação', async () => {
  let confirmations = 0;
  const run = createToolExecutor({ confirm: () => { confirmations++; } });
  for (const [name, args] of [['unknown', { tarefa: 'x' }], ['chamar_codex', { tarefa: '' }], ['chamar_codex', { tarefa: 'x', pasta: './relative' }], ['chamar_codex', { tarefa: 'x'.repeat(20001) }], ['chamar_codex', { tarefa: 'x', pasta: 'C:/missing-gemi-folder-abc' }]]) assert.equal((await run(name, args)).ok, false);
  assert.equal(confirmations, 0);
});

test('pasta removida enquanto confirmação estava aberta impede execução', async (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'gemi-removed-test-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  let called = false;
  const run = createToolExecutor({ confirm: async () => { fs.rmdirSync(folder); return true; }, runCodex: () => { called = true; } });
  assert.equal((await run('chamar_codex', { tarefa: 'x', pasta: folder })).ok, false);
  assert.equal(called, false);
});
