// Provider transport stays independent of Electron. Only the injected callback
// can execute a tool, after the application's native approval gate.
const path = require('node:path');
const TOOL_NAMES = ['chamar_codex', 'abrir_antigravity'];
const TOOL_DEFINITIONS = TOOL_NAMES.map((name) => ({
  name,
  description: name === 'chamar_codex'
    ? 'Delega uma tarefa ao Codex local, após confirmação do usuário.'
    : 'Envia uma tarefa ao Antigravity IDE, após confirmação do usuário.',
  parameters: {
    type: 'object', properties: {
      tarefa: { type: 'string', description: 'Tarefa completa para o agente.' },
      pasta: { type: 'string', description: 'Pasta absoluta do projeto, se informada.' },
    }, required: ['tarefa'], additionalProperties: false,
  },
}));

const count = (value) => Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
const bounded = (value, fallback, minimum, maximum) => Number.isFinite(value)
  ? Math.max(minimum, Math.min(maximum, Math.floor(value))) : fallback;

function abortIfNeeded(signal) {
  if (signal?.aborted) {
    const error = new Error('Solicitação cancelada.');
    error.name = 'AbortError';
    throw error;
  }
}

function providerError(provider, status, detail) {
  const messages = {
    400: 'A solicitação enviada ao provedor foi recusada.',
    401: 'A chave da API não foi aceita. Verifique sua configuração.',
    403: 'A chave da API não tem permissão para esta solicitação.',
    404: 'O modelo solicitado não está disponível.',
    429: 'O provedor atingiu um limite de uso. Aguarde antes de tentar novamente.',
  };
  // Never echo a remote error body: it can contain API keys or request content.
  const error = new Error(messages[status] || (status >= 500 ? 'O provedor está indisponível no momento.' : 'Falha na comunicação com o provedor.'));
  error.status = status;
  error.provider = provider;
  const code = detail?.code || detail?.status;
  const message = String(detail?.message || '');
  error.modelNotFound = status === 404 && (code === 'model_not_found' || (/model/i.test(message) && /not found|not supported|does not exist|unknown|unavailable/i.test(message)));
  return error;
}

async function checkedFetch(fetchImpl, url, options, provider) {
  abortIfNeeded(options.signal);
  let response;
  try { response = await fetchImpl(url, options); }
  catch (error) {
    abortIfNeeded(options.signal);
    if (error.name === 'AbortError') throw error;
    throw providerError(provider, 0);
  }
  abortIfNeeded(options.signal);
  if (!response.ok) {
    let detail;
    try { detail = (await response.json()).error; } catch {}
    throw providerError(provider, response.status, detail);
  }
  if (!response.body?.getReader) throw new Error('O provedor não retornou um fluxo de resposta.');
  return response;
}

async function* sseEvents(body, signal) {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '', data = [], received = 0;
  const cancel = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      abortIfNeeded(signal);
      const { value, done } = await reader.read();
      abortIfNeeded(signal);
      if (value) received += value.byteLength;
      if (received > 4 * 1024 * 1024) throw new Error('O fluxo do provedor excedeu o tamanho permitido.');
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end;
      while ((end = buffer.search(/[\r\n]/u)) >= 0) {
        // A CRLF may straddle two network chunks.
        if (!done && buffer[end] === '\r' && end === buffer.length - 1) break;
        const line = buffer.slice(0, end);
        const length = buffer[end] === '\r' && buffer[end + 1] === '\n' ? 2 : 1;
        buffer = buffer.slice(end + length);
        if (!line) {
          if (data.length) { yield data.join('\n'); data = []; }
        } else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /u, ''));
      }
      if (done) break;
    }
    if (buffer.startsWith('data:')) data.push(buffer.slice(5).replace(/^ /u, ''));
    if (data.length) yield data.join('\n');
  } finally {
    signal?.removeEventListener('abort', cancel);
    try { await reader.cancel(); } catch {}
    reader.releaseLock();
  }
}

function parseEvent(event, provider) {
  let parsed;
  try { parsed = JSON.parse(event); } catch {}
  if (!parsed || typeof parsed !== 'object') throw new Error('O provedor retornou dados de streaming inválidos.');
  if (parsed.error) throw providerError(provider, Number(parsed.error.code) || 0, parsed.error);
  return parsed;
}

function normalizeUsage(raw, provider, request, parts) {
  if (!raw || !Object.keys(raw).length) {
    const promptTokens = Math.max(1, Math.ceil(JSON.stringify(request).length / 3.8));
    const completionTokens = Math.max(1, Math.ceil(JSON.stringify(parts).length / 3.8));
    return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, cachedTokens: 0, thoughtsTokens: 0, reasoningTokens: 0, estimated: true };
  }
  const gemini = provider === 'gemini';
  const promptTokens = count(gemini ? raw.promptTokenCount : raw.prompt_tokens);
  const completionTokens = count(gemini ? raw.candidatesTokenCount : raw.completion_tokens);
  const thoughtsTokens = count(raw.thoughtsTokenCount);
  const reasoningTokens = count(raw.completion_tokens_details?.reasoning_tokens);
  const total = gemini ? raw.totalTokenCount : raw.total_tokens;
  return {
    promptTokens, completionTokens,
    totalTokens: Number.isFinite(total) ? count(total) : promptTokens + completionTokens + (gemini ? thoughtsTokens : 0),
    cachedTokens: count(gemini ? raw.cachedContentTokenCount : raw.prompt_tokens_details?.cached_tokens),
    thoughtsTokens, reasoningTokens, estimated: false,
  };
}

function sumUsage(total, usage) {
  for (const field of ['promptTokens', 'completionTokens', 'totalTokens', 'cachedTokens', 'thoughtsTokens', 'reasoningTokens']) total[field] += usage[field];
  total.estimated ||= usage.estimated;
  total.requests++;
}

function toOpenAIMessages(history, systemPrompt = '') {
  const messages = systemPrompt ? [{ role: 'system', content: systemPrompt }] : [];
  const pending = [];
  let sequence = 0;
  for (const turn of history || []) {
    const parts = Array.isArray(turn.parts) ? turn.parts : [];
    const text = parts.filter((part) => typeof part.text === 'string' && !part.thought).map((part) => part.text).join('');
    if (turn.role === 'model') {
      const calls = parts.filter((part) => part.functionCall).map(({ functionCall: call }) => {
        const id = call.id || `history-call-${sequence++}`;
        pending.push({ id, name: call.name });
        return { id, type: 'function', function: { name: call.name, arguments: typeof call.args === 'string' ? call.args : JSON.stringify(call.args || {}) } };
      });
      if (text || calls.length) messages.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      for (const { functionResponse: response } of parts.filter((part) => part.functionResponse)) {
        const index = pending.findIndex((call) => response.id ? call.id === response.id : call.name === response.name);
        if (index < 0) continue;
        const [call] = pending.splice(index, 1);
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(response.response ?? {}) });
      }
      if (text) messages.push({ role: 'user', content: text });
    }
  }
  return messages;
}

async function streamOpenAI(response, signal, onText, onUsage) {
  let text = '', usage, finishReason = null;
  const calls = new Map();
  for await (const event of sseEvents(response.body, signal)) {
    if (event.trim() === '[DONE]') break;
    const parsed = parseEvent(event, 'openai');
    if (parsed.usage) { usage = parsed.usage; onUsage(usage); }
    const choice = parsed.choices?.[0];
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    const delta = choice?.delta || {};
    if (typeof delta.content === 'string') { text += delta.content; onText(delta.content); }
    for (const fragment of delta.tool_calls || []) {
      if (!Number.isInteger(fragment.index) || fragment.index < 0 || fragment.index > 31) throw new Error('O provedor retornou uma chamada de ferramenta inválida.');
      const call = calls.get(fragment.index) || { id: '', name: '', args: '' };
      if (fragment.id) call.id = fragment.id;
      if (fragment.function?.name) call.name += fragment.function.name;
      if (typeof fragment.function?.arguments === 'string') call.args += fragment.function.arguments;
      calls.set(fragment.index, call);
    }
  }
  if (!finishReason) throw new Error('O fluxo do provedor terminou antes de concluir a resposta.');
  const parts = text ? [{ text }] : [];
  for (const [, call] of [...calls].sort(([a], [b]) => a - b)) {
    let args;
    try { args = JSON.parse(call.args); } catch { args = null; }
    parts.push({ functionCall: { name: call.name, id: call.id, args } });
  }
  return { parts, usage, finishReason };
}

async function streamGemini(response, signal, onText, onUsage) {
  const parts = [];
  let usage, finishReason = null;
  for await (const event of sseEvents(response.body, signal)) {
    if (event.trim() === '[DONE]') break;
    const parsed = parseEvent(event, 'gemini');
    if (parsed.usageMetadata) { usage = parsed.usageMetadata; onUsage(usage); }
    const candidate = parsed.candidates?.[0];
    if (candidate?.finishReason) finishReason = candidate.finishReason;
    for (const part of candidate?.content?.parts || []) {
      if (part.thought) {
        // Preserve opaque signed parts verbatim for the next model call, without
        // displaying thought text to the user.
        parts.push(part);
      } else if (part.functionCall) {
        const previous = part.functionCall.id && parts.find((p) => p.functionCall?.id === part.functionCall.id);
        if (previous) {
          const before = previous.functionCall.args, after = part.functionCall.args;
          const args = typeof before === 'string' && typeof after === 'string' ? before + after
            : before && after && typeof before === 'object' && typeof after === 'object' ? { ...before, ...after } : after ?? before;
          previous.functionCall = { ...previous.functionCall, ...part.functionCall, args };
          if (part.thoughtSignature) previous.thoughtSignature = part.thoughtSignature;
        } else parts.push(part);
      } else if (typeof part.text === 'string') {
        if (part.text) onText(part.text);
        // Signed parts must keep their original boundaries.
        const previous = parts.at(-1);
        if (previous && typeof previous.text === 'string' && !previous.thought && !previous.thoughtSignature && !part.thoughtSignature) previous.text += part.text;
        else parts.push(part);
      } else if (part.thoughtSignature) {
        // A final streaming chunk can carry just the preceding part's signature.
        const previous = parts.at(-1);
        if (previous && !previous.thoughtSignature) previous.thoughtSignature = part.thoughtSignature;
        else parts.push(part);
      }
    }
    if (parts.filter((part) => part.functionCall).length > 32) throw new Error('O provedor retornou chamadas de ferramenta em excesso.');
  }
  if (!finishReason) throw new Error('O fluxo do provedor terminou antes de concluir a resposta.');
  for (const { functionCall: call } of parts.filter((part) => part.functionCall)) {
    if (typeof call.args === 'string') {
      try { call.args = JSON.parse(call.args); } catch { call.args = null; }
    }
  }
  return { parts, usage, finishReason };
}

function validArguments(name, args) {
  return TOOL_NAMES.includes(name) && args && !Array.isArray(args) && typeof args === 'object'
    && Object.keys(args).every((key) => ['tarefa', 'pasta'].includes(key))
    && typeof args.tarefa === 'string' && args.tarefa.trim().length > 0 && args.tarefa.length <= 20000 && !args.tarefa.includes('\0')
    && (args.pasta === undefined || typeof args.pasta === 'string' && args.pasta.length <= 4096 && !args.pasta.includes('\0')
      && (!args.pasta || path.win32.isAbsolute(args.pasta) || path.posix.isAbsolute(args.pasta)));
}

function validCallId(id, provider) {
  if (id === undefined && provider === 'gemini') return true;
  return typeof id === 'string' && id.length > 0 && id.length <= 256 && [...id].every((character) => character.charCodeAt(0) >= 32);
}

function toolResponse(result, limit) {
  let encoded;
  try { encoded = JSON.stringify(result ?? {}); } catch { return { erro: 'Resultado da ferramenta inválido.' }; }
  if (encoded.length <= limit) return JSON.parse(encoded);
  const text = result?.text ?? result?.resultado ?? result?.erro ?? encoded;
  return { text: String(text).slice(0, Math.max(0, limit - 60)) + '…', truncated: true };
}

function createAIProviders({ fetchImpl = globalThis.fetch, handleToolCall } = {}) {
  async function chat(provider, options) {
    const { key, history = [], systemPrompt = '', signal, onText = () => {}, onContinue = () => {}, onTool = () => {} } = options;
    if (typeof key !== 'string' || !key.trim()) throw new Error('NO_KEY');
    const maxOutputTokens = bounded(options.maxOutputTokens, 512, 1, 4096);
    const maxToolRounds = bounded(options.maxToolRounds, 2, 0, 2);
    const maxToolCalls = bounded(options.maxToolCalls, 3, 0, 3);
    const resultLimit = bounded(options.toolOutputChars, 1800, 100, 6000);
    const models = [...new Set([options.model, ...(options.models || [])].filter((model) => typeof model === 'string' && /^[a-zA-Z0-9._:-]+$/u.test(model)))];
    if (!models.length) throw new Error('Configure um modelo válido.');
    const result = { turns: [], text: '', model: models[0], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedTokens: 0, thoughtsTokens: 0, reasoningTokens: 0, estimated: false, requests: 0 }, finishReason: null };
    let toolCalls = 0, toolRounds = 0, modelIndex = 0;
    try {
      for (;;) {
        abortIfNeeded(signal);
        const enabled = options.toolsEnabled === true && toolRounds < maxToolRounds && toolCalls < maxToolCalls;
        const turns = [...history, ...result.turns];
        let body, url, headers;
        if (provider === 'gemini') {
          body = { contents: turns, generationConfig: { maxOutputTokens } };
          if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
          if (enabled) body.tools = [{ functionDeclarations: TOOL_DEFINITIONS.map(({ parameters, ...tool }) => ({ ...tool, parameters: {
            type: 'OBJECT', required: parameters.required,
            properties: Object.fromEntries(Object.entries(parameters.properties).map(([name, schema]) => [name, { ...schema, type: 'STRING' }])),
          } })) }];
          url = `https://generativelanguage.googleapis.com/v1beta/models/${result.model}:streamGenerateContent?alt=sse`;
          headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
        } else {
          body = { model: result.model, stream: true, stream_options: { include_usage: true }, messages: toOpenAIMessages(turns, systemPrompt), max_completion_tokens: maxOutputTokens };
          if (enabled) { body.tools = TOOL_DEFINITIONS.map((tool) => ({ type: 'function', function: tool })); body.parallel_tool_calls = false; }
          url = 'https://api.openai.com/v1/chat/completions';
          headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
        }
        let response;
        try { response = await checkedFetch(fetchImpl, url, { method: 'POST', signal, headers, body: JSON.stringify(body) }, provider); }
        catch (error) {
          // A 404 for a nonexistent model is the only safe automatic fallback:
          // never repeat a quota error, server failure, or partially billed stream.
          if (provider === 'gemini' && error.modelNotFound && result.usage.requests === 0 && modelIndex < models.length - 1) { result.model = models[++modelIndex]; continue; }
          throw error;
        }
        const initialTextLength = result.text.length;
        const write = (text) => { result.text += text; onText(text); };
        let streamed, currentUsage;
        try {
          streamed = await (provider === 'gemini' ? streamGemini : streamOpenAI)(response, signal, write, (usage) => { currentUsage = usage; });
        } catch (error) {
          const partialParts = [{ text: result.text.slice(initialTextLength) }];
          if (partialParts[0].text) result.turns.push({ role: 'model', parts: partialParts });
          sumUsage(result.usage, normalizeUsage(currentUsage, provider, body, partialParts));
          throw error;
        }
        abortIfNeeded(signal);
        result.turns.push({ role: 'model', parts: streamed.parts.length ? streamed.parts : [{ text: '' }] });
        sumUsage(result.usage, normalizeUsage(streamed.usage, provider, body, streamed.parts));
        result.finishReason = streamed.finishReason;
        const calls = streamed.parts.filter((part) => part.functionCall).map((part) => part.functionCall);
        if (!calls.length) return result;
        const completeCalls = provider === 'gemini' ? streamed.finishReason === 'STOP' : streamed.finishReason === 'tool_calls';
        const responses = [];
        for (const [index, call] of calls.entries()) {
          abortIfNeeded(signal);
          let value;
          const callId = `${options.id || 'chat'}-${toolRounds}-${index}`;
          if (!completeCalls) value = { erro: 'A geração da chamada de ferramenta não foi concluída.' };
          else if (!enabled || toolCalls >= maxToolCalls) value = { erro: 'Limite de ferramentas atingido ou ferramentas desativadas.' };
          else if (!validCallId(call.id, provider) || !validArguments(call.name, call.args)) { toolCalls++; value = { erro: 'Ferramenta ou argumentos inválidos.' }; }
          else {
            toolCalls++;
            const context = { petId: options.petId, id: options.id, callId, signal, round: toolRounds };
            onTool({ name: call.name, args: call.args, ...context });
            abortIfNeeded(signal);
            value = typeof handleToolCall === 'function' ? await handleToolCall(call.name, call.args, context) : { erro: 'Execução de ferramentas indisponível.' };
            abortIfNeeded(signal);
          }
          // Do not add a synthetic API id to a signed Gemini part. Older Gemini
          // models omit it; matching by name remains their documented contract.
          responses.push({ functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response: toolResponse(value, resultLimit) } });
        }
        result.turns.push({ role: 'user', parts: responses });
        if (!completeCalls) return result;
        if (!enabled) { result.finishReason = 'tool_limit'; return result; }
        toolRounds++;
        onContinue();
      }
    } catch (error) {
      // Preserve streamed text without converting a failed or canceled tool delta
      // into an executable call or repeating the network request.
      const failure = signal?.aborted ? Object.assign(new Error('Solicitação cancelada.'), { name: 'AbortError' }) : error;
      // An HTTP/connect failure has no generation usage to measure. Initial
      // accumulator zeros must not look like an actual zero-token response.
      if (result.usage.requests === 0) result.usage = null;
      failure.partial = result;
      throw failure;
    }
  }
  return { geminiChat: (options) => chat('gemini', options), openaiChat: (options) => chat('openai', options) };
}

module.exports = { createAIProviders, toOpenAIMessages, sseEvents };
