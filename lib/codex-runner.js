const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');

const DEFAULT_TIMEOUT = 10 * 60 * 1000;
const MAX_LINE_CHARS = 1024 * 1024;
const MAX_MESSAGE_BYTES = 1024 * 1024;
const MAX_ERROR_CHARS = 4000;

function friendlyCodexError(message) {
  if (/usage limit/i.test(message)) {
    const at = message.match(/try again at ([^.]+?)\.?$/i) || message.match(/try again at ([\d:]+ ?[AP]M)/i);
    return `O Codex atingiu o limite de uso do seu plano do ChatGPT${at ? ` (libera às ${at[1]})` : ''}.`;
  }
  if (/not logged in|unauthorized|401/i.test(message)) return 'O Codex não está logado. Abra o app do Codex e entre com sua conta.';
  return message;
}

function normalizeUsage(value) {
  if (!value || !Number.isFinite(value.input_tokens) || !Number.isFinite(value.output_tokens) || value.input_tokens < 0 || value.output_tokens < 0) return null;
  const count = (number) => Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
  const promptTokens = count(value.input_tokens);
  const completionTokens = count(value.output_tokens);
  return {
    promptTokens, completionTokens,
    cachedTokens: count(value.cached_input_tokens),
    thoughtsTokens: 0,
    reasoningTokens: count(value.reasoning_output_tokens),
    totalTokens: promptTokens + completionTokens,
    estimated: false,
  };
}

function createCodexRunner({
  findExecutable, spawnImpl = spawn, fsImpl = fs, osImpl = os, pathImpl = path,
  onChildStarted = () => {}, onChildFinished = () => {}, timeoutMs = DEFAULT_TIMEOUT,
}) {
  return ({ tarefa, pasta, writable }, onStatus = () => {}, callId, owner) => new Promise((resolve) => {
    const startTime = Date.now();
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    let temporaryDirectory;
    let outputFile;
    let child;
    let timer;
    let registered = false;
    let settled = false;
    let line = '';
    let skippingLine = false;
    let lastMessage = '';
    let errorMessage = '';
    let stderr = '';
    let usage = null;

    function status(text) {
      try { onStatus(text); } catch {}
    }

    function consumeLine(value) {
      let event;
      try { event = JSON.parse(value); } catch { return; }
      if (!event || typeof event !== 'object') return;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (event.type === 'turn.completed') usage = normalizeUsage(event.usage) || usage;
      else if (event.type === 'error') errorMessage = typeof event.message === 'string' ? event.message.slice(0, MAX_ERROR_CHARS) : errorMessage;
      else if (event.type === 'turn.failed') errorMessage = typeof event.error?.message === 'string' ? event.error.message.slice(0, MAX_ERROR_CHARS) : errorMessage;
      else if (event.item) {
        const item = event.item;
        if (item.type === 'command_execution' && event.type === 'item.started') status(`⚙️ [${elapsed}s] ${String(item.command || '').slice(0, 90)}`);
        else if (item.type === 'file_change') status(`✏️ [${elapsed}s] editando arquivos…`);
        else if (item.type === 'reasoning') status(`🧠 [${elapsed}s] pensando…`);
        else if (item.type === 'agent_message' && typeof item.text === 'string' && item.text) lastMessage = item.text.slice(0, MAX_LINE_CHARS);
      }
    }

    function appendLine(value) {
      if (skippingLine) return;
      if (line.length + value.length > MAX_LINE_CHARS) {
        line = '';
        skippingLine = true;
      } else line += value;
    }

    function consumeStdout(value) {
      let offset = 0;
      let newline;
      while ((newline = value.indexOf('\n', offset)) !== -1) {
        appendLine(value.slice(offset, newline));
        if (!skippingLine) consumeLine(line);
        line = '';
        skippingLine = false;
        offset = newline + 1;
      }
      appendLine(value.slice(offset));
    }

    function readFinalMessage() {
      if (!outputFile || !fsImpl.existsSync(outputFile)) return;
      const descriptor = fsImpl.openSync(outputFile, 'r');
      try {
        const bytes = Buffer.alloc(MAX_MESSAGE_BYTES + 1);
        const length = fsImpl.readSync(descriptor, bytes, 0, bytes.length, 0);
        const decoder = new StringDecoder('utf8');
        const truncated = length > MAX_MESSAGE_BYTES;
        const text = (decoder.write(bytes.subarray(0, Math.min(length, MAX_MESSAGE_BYTES))) + (truncated ? '' : decoder.end())).trim();
        if (text) lastMessage = text + (truncated ? '\n[Resposta truncada por tamanho.]' : '');
      } finally { fsImpl.closeSync(descriptor); }
    }

    function finish(code) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      consumeStdout(stdoutDecoder.end());
      if (line && !skippingLine) consumeLine(line);
      line = '';
      stderr = (stderr + stderrDecoder.end()).slice(-MAX_ERROR_CHARS);
      if (registered) {
        try { onChildFinished(callId); } catch (error) { errorMessage ||= error.message; }
      }
      try { readFinalMessage(); } catch {}
      if (temporaryDirectory) {
        try { fsImpl.rmSync(temporaryDirectory, { recursive: true, force: true }); }
        catch (error) { errorMessage ||= 'Não foi possível remover os arquivos temporários: ' + error.message; }
      }
      const durationMs = Date.now() - startTime;
      if (code === 0 && lastMessage && !errorMessage) return resolve({ ok: true, text: lastMessage, durationMs, usage });
      const message = errorMessage || stderr.trim().split(/\r?\n/).filter((value) => !/Reading additional input/.test(value)).pop() || `O Codex saiu com código ${code}.`;
      resolve({ ok: false, text: friendlyCodexError(message), durationMs, usage });
    }

    try {
      const executable = findExecutable();
      if (!executable) {
        errorMessage = 'Não achei o Codex instalado neste PC.';
        finish(null);
        return;
      }
      temporaryDirectory = fsImpl.mkdtempSync(pathImpl.join(osImpl.tmpdir(), 'gemi-codex-'));
      outputFile = pathImpl.join(temporaryDirectory, 'response.txt');
      const args = [
        'exec', '--json', '--skip-git-repo-check', '--ephemeral',
        '-s', writable ? 'workspace-write' : 'read-only', '-C', pasta,
        '-c', 'model_reasoning_effort="low"', '-o', outputFile, '--', String(tarefa || ''),
      ];
      child = spawnImpl(executable, args, { cwd: pasta, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      child.stdout.on('data', (data) => { if (!settled) consumeStdout(stdoutDecoder.write(data)); });
      child.stderr.on('data', (data) => { if (!settled) stderr = (stderr + stderrDecoder.write(data)).slice(-MAX_ERROR_CHARS); });
      child.on('error', (error) => { if (!settled) { errorMessage = error.message; finish(null); } });
      child.on('close', (code) => finish(code));
      timer = setTimeout(() => {
        if (settled) return;
        errorMessage = timeoutMs === DEFAULT_TIMEOUT ? 'Tempo esgotado (10 min).' : 'Tempo esgotado.';
        try { child.kill(); } catch {}
        finish(null);
      }, timeoutMs);
      registered = true;
      onChildStarted(callId, child, owner);
    } catch (error) {
      errorMessage = error.message;
      if (child) { try { child.kill(); } catch {} }
      finish(null);
    }
  });
}

module.exports = { createCodexRunner };
