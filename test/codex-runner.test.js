const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { createCodexRunner } = require('../lib/codex-runner');

function fixture(t, driver = () => {}, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gemi-runner-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const spawned = [];
  const started = [];
  const finished = [];
  const run = createCodexRunner({
    findExecutable: () => 'mock-codex.exe',
    osImpl: { tmpdir: () => directory },
    spawnImpl: (executable, args, spawnOptions) => {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kills = 0;
      child.kill = () => { child.kills++; return true; };
      const invocation = { executable, args, options: spawnOptions, child, outputFile: args[args.indexOf('-o') + 1] };
      spawned.push(invocation);
      queueMicrotask(() => driver(invocation));
      return child;
    },
    onChildStarted: (callId, child, owner) => started.push({ callId, child, owner }),
    onChildFinished: (callId) => finished.push(callId),
    ...options,
  });
  return { directory, spawned, started, finished, run };
}

const request = (tarefa = 'Apenas tarefa de teste.', writable = false) => ({ tarefa, pasta: os.tmpdir(), writable });
const messageEvent = (text) => JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text } });
const usageEvent = JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 120, cached_input_tokens: 80, output_tokens: 30, reasoning_output_tokens: 12 } });
const expectedUsage = { promptTokens: 120, completionTokens: 30, cachedTokens: 80, thoughtsTokens: 0, reasoningTokens: 12, totalTokens: 150, estimated: false };

test('execuções concorrentes mantêm tarefa literal, sandbox e arquivos temporários separados', async (t) => {
  const subject = fixture(t, ({ child, outputFile }) => {
    fs.writeFileSync(outputFile, 'Resposta de teste.');
    child.emit('close', 0);
  });
  const owner = {};
  const task = 'Texto literal: $(não-executar) "aspas" --flag';
  const results = await Promise.all([
    subject.run(request(task), () => {}, 'read', owner),
    subject.run(request('Edição autorizada.', true), () => {}, 'write', owner),
  ]);
  assert.ok(results.every((result) => result.ok && result.text === 'Resposta de teste.'));
  const [read, write] = subject.spawned;
  assert.equal(read.args[read.args.indexOf('-s') + 1], 'read-only');
  assert.equal(write.args[write.args.indexOf('-s') + 1], 'workspace-write');
  assert.equal(read.args.at(-1), task);
  assert.equal(read.args.at(-2), '--');
  assert.equal(read.args[read.args.indexOf('-c') + 1], 'model_reasoning_effort="low"');
  for (const invocation of subject.spawned) {
    for (const flag of ['exec', '--json', '--skip-git-repo-check', '--ephemeral']) assert.ok(invocation.args.includes(flag));
    assert.equal(invocation.args.includes('--ignore-user-config'), false);
    assert.equal(invocation.args.includes('--disable'), false);
    assert.equal(invocation.options.shell, undefined);
    assert.equal(invocation.options.windowsHide, true);
    assert.equal(invocation.options.cwd, os.tmpdir());
  }
  assert.notEqual(read.outputFile, write.outputFile);
  assert.equal(subject.started.length, 2);
  assert.ok(subject.started.every((item) => item.owner === owner));
  assert.deepEqual(subject.finished.sort(), ['read', 'write']);
  assert.deepEqual(fs.readdirSync(subject.directory), []);
});

test('JSONL fragmentado em bytes UTF-8 e última linha sem newline preservam resposta e tokens reais', async (t) => {
  const statuses = [];
  const subject = fixture(t, ({ child }) => {
    child.stdout.write(JSON.stringify({ type: 'item.started', item: { type: 'command_execution', command: 'comando de teste' } }) + '\n');
    const bytes = Buffer.from(messageEvent('Olá, raposa 🦊!') + '\n' + usageEvent);
    for (let offset = 0; offset < bytes.length; offset += 3) child.stdout.write(bytes.subarray(offset, offset + 3));
    child.emit('close', 0);
  });
  const result = await subject.run(request(), (text) => statuses.push(text), 'utf8');
  assert.equal(result.ok, true);
  assert.equal(result.text, 'Olá, raposa 🦊!');
  assert.deepEqual(result.usage, expectedUsage);
  assert.ok(statuses.some((text) => text.includes('comando de teste')));
  assert.deepEqual(subject.finished, ['utf8']);
  assert.deepEqual(fs.readdirSync(subject.directory), []);
});

test('falha conserva uso informado e apresenta autenticação em linguagem legível', async (t) => {
  const subject = fixture(t, ({ child }) => {
    child.stdout.write(usageEvent + '\n');
    child.stdout.write(JSON.stringify({ type: 'turn.failed', error: { message: '401 unauthorized' } }));
    child.emit('close', 1);
  });
  const result = await subject.run(request(), () => {}, 'unauthorized');
  assert.equal(result.ok, false);
  assert.match(result.text, /não está logado/);
  assert.deepEqual(result.usage, expectedUsage);
  assert.deepEqual(fs.readdirSync(subject.directory), []);
});

test('erro de spawn e close posterior finalizam e limpam uma única vez', async (t) => {
  const subject = fixture(t, ({ child }) => {
    child.emit('error', new Error('ENOENT: executável ausente'));
    child.emit('close', -1);
    child.emit('close', -1);
  });
  const result = await subject.run(request(), () => {}, 'spawn-error');
  assert.equal(result.ok, false);
  assert.match(result.text, /ENOENT/);
  assert.equal(result.usage, null);
  assert.deepEqual(subject.finished, ['spawn-error']);
  assert.deepEqual(fs.readdirSync(subject.directory), []);
});

test('exceção síncrona ao iniciar processo também remove sua pasta temporária', async (t) => {
  const subject = fixture(t, undefined, { spawnImpl: () => { throw new Error('spawn recusado'); } });
  const result = await subject.run(request(), () => {}, 'throw');
  assert.equal(result.ok, false);
  assert.match(result.text, /spawn recusado/);
  assert.equal(subject.started.length, 0);
  assert.equal(subject.finished.length, 0);
  assert.deepEqual(fs.readdirSync(subject.directory), []);
});

test('timeout encerra execução sem depender de close e ignora término atrasado', async (t) => {
  const subject = fixture(t, undefined, { timeoutMs: 10 });
  const result = await subject.run(request(), () => {}, 'timeout');
  assert.equal(result.ok, false);
  assert.match(result.text, /Tempo esgotado/);
  assert.equal(subject.spawned[0].child.kills, 1);
  subject.spawned[0].child.emit('close', 0);
  assert.deepEqual(subject.finished, ['timeout']);
  assert.deepEqual(fs.readdirSync(subject.directory), []);
});

test('linhas e stderr excessivos ficam limitados sem impedir eventos seguintes', async (t) => {
  const subject = fixture(t, ({ child }) => {
    child.stdout.write('{"type":"error","message":"' + 'x'.repeat(2 * 1024 * 1024) + '"}\n');
    child.stdout.write(messageEvent('Resposta curta.') + '\n' + usageEvent);
    child.stderr.write('x'.repeat(2 * 1024 * 1024) + '\nnot logged in\n');
    child.emit('close', 1);
  });
  const result = await subject.run(request(), () => {}, 'bounded');
  assert.equal(result.ok, false);
  assert.match(result.text, /não está logado/);
  assert.ok(result.text.length < 200);
  assert.deepEqual(result.usage, expectedUsage);
});

test('ausência do executável retorna erro antes de criar diretórios ou processos', async (t) => {
  const subject = fixture(t, undefined, { findExecutable: () => null });
  const result = await subject.run(request());
  assert.equal(result.ok, false);
  assert.match(result.text, /Não achei o Codex/);
  assert.equal(subject.spawned.length, 0);
  assert.deepEqual(fs.readdirSync(subject.directory), []);
});
