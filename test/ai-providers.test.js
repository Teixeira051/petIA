const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAIProviders, toOpenAIMessages, sseEvents } = require('../lib/ai-providers');

const base = { key: 'fake-test-key', model: 'unit-model', history: [{ role: 'user', parts: [{ text: 'Uma pergunta.' }] }] };
const bytes = (text, width = 7) => {
  const encoded = new TextEncoder().encode(text);
  return new ReadableStream({ start(controller) {
    for (let index = 0; index < encoded.length; index += width) controller.enqueue(encoded.slice(index, index + width));
    controller.close();
  } });
};
const response = (events, { width = 7, tail = false } = {}) => new Response(bytes(events.map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}`).join('\r\n\r\n') + (tail ? '' : '\r\n\r\n'), width));
const openaiText = (text, usage) => response([
  { choices: [{ delta: { content: text } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] },
  ...(usage ? [{ choices: [], usage }] : []), '[DONE]',
]);
const geminiText = (text, usageMetadata) => response([{ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }], ...(usageMetadata ? { usageMetadata } : {}) }]);
const geminiCalls = (calls, usageMetadata) => response([{ candidates: [{ content: { parts: calls.map((call) => ({ functionCall: call, thoughtSignature: 'opaque-signature-' + call.id })) }, finishReason: 'STOP' }], ...(usageMetadata ? { usageMetadata } : {}) }]);
const openaiCalls = (calls, usage) => response([
  { choices: [{ delta: { tool_calls: calls.map((call, index) => ({ index, id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } })) } }] },
  { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }, ...(usage ? [{ choices: [], usage }] : []), '[DONE]',
]);
function fixture(replies, execute) {
  const requests = [];
  const provider = createAIProviders({ fetchImpl: async (url, options) => {
    requests.push({ url, ...options, body: JSON.parse(options.body) });
    assert.ok(replies.length, 'Nenhuma resposta mock restante; ocorreu uma chamada extra.');
    const next = replies.shift();
    return typeof next === 'function' ? next(url, options) : next;
  }, handleToolCall: execute });
  return { ...provider, requests };
}

test('SSE preserva UTF-8 fracionado, CRLF, campos ignorados, múltiplas data e tail sem newline', async () => {
  const events = [];
  for await (const event of sseEvents(bytes(': keepalive\r\nevent: message\r\ndata: {"texto":\r\ndata: "ação 🦊"}\r\n\r\ndata: tail', 1))) events.push(event);
  assert.deepEqual(events, ['{"texto":\n"ação 🦊"}', 'tail']);
});

for (const provider of ['gemini', 'openai']) {
  const method = provider + 'Chat';
  test(provider + ': conversa sem ferramentas, limite explícito e uso real de tokens', async () => {
    let streamed = '';
    const usage = provider === 'gemini'
      ? { promptTokenCount: 10, candidatesTokenCount: 4, totalTokenCount: 17, cachedContentTokenCount: 3, thoughtsTokenCount: 3 }
      : { prompt_tokens: 10, completion_tokens: 7, total_tokens: 17, prompt_tokens_details: { cached_tokens: 3 }, completion_tokens_details: { reasoning_tokens: 3 } };
    const f = fixture([provider === 'gemini' ? geminiText('Olá, ação 🦊!', usage) : openaiText('Olá, ação 🦊!', usage)]);
    const result = await f[method]({ ...base, systemPrompt: 'Seja breve.', maxOutputTokens: 123, onText: (part) => { streamed += part; } });
    assert.equal(result.text, 'Olá, ação 🦊!'); assert.equal(streamed, result.text);
    assert.equal(result.model, 'unit-model'); assert.equal(result.usage.totalTokens, 17);
    assert.equal(result.usage.cachedTokens, 3); assert.equal(result.usage.estimated, false);
    assert.equal(result.usage[provider === 'gemini' ? 'thoughtsTokens' : 'reasoningTokens'], 3);
    assert.equal(f.requests[0].body.tools, undefined);
    assert.equal(provider === 'gemini' ? f.requests[0].body.generationConfig.maxOutputTokens : f.requests[0].body.max_completion_tokens, 123);
    assert.ok(!f.requests[0].url.includes(base.key)); assert.ok(!JSON.stringify(f.requests[0].body).includes(base.key));
  });

  test(provider + ': uso estimado fica explícito quando o provedor não envia contagem', async () => {
    const f = fixture([provider === 'gemini' ? geminiText('Oi!') : openaiText('Oi!')]);
    const { usage } = await f[method](base);
    assert.equal(usage.estimated, true); assert.equal(usage.requests, 1);
    assert.ok(usage.promptTokens > 0); assert.ok(usage.completionTokens > 0);
    assert.equal(usage.totalTokens, usage.promptTokens + usage.completionTokens);
  });

  test(provider + ': chamada inesperada com ferramentas desativadas nunca executa', async () => {
    let executions = 0;
    const call = { id: 'unexpected', name: 'chamar_codex', args: { tarefa: 'listar arquivos' } };
    for (const toolsEnabled of [undefined, false, 'true', 1]) {
      const f = fixture([provider === 'gemini' ? geminiCalls([call]) : openaiCalls([call])], () => { executions++; });
      const result = await f[method]({ ...base, toolsEnabled });
      assert.equal(result.finishReason, 'tool_limit'); assert.equal(f.requests.length, 1);
      assert.equal(f.requests[0].body.tools, undefined);
    }
    assert.equal(executions, 0);
  });

  test(provider + ': ferramentas desconhecidas e argumentos inválidos são recusados antes do callback', async () => {
    let executions = 0;
    for (const call of [
      { name: 'shell', args: { tarefa: 'x' } },
      { name: 'chamar_codex', args: { tarefa: '' } },
      { name: 'chamar_codex', args: { tarefa: 12 } },
      { name: 'chamar_codex', args: { tarefa: 'x', pasta: null } },
      { name: 'chamar_codex', args: { tarefa: 'x', pasta: './relativa' } },
      { name: 'chamar_codex', args: { tarefa: 'x', comando: 'extra' } },
    ]) {
      const first = { ...call, id: 'invalid' };
      const f = fixture([provider === 'gemini' ? geminiCalls([first]) : openaiCalls([first]), provider === 'gemini' ? geminiText('Não executado.') : openaiText('Não executado.')], () => { executions++; });
      const result = await f[method]({ ...base, toolsEnabled: true });
      assert.match(result.turns[1].parts[0].functionResponse.response.erro, /inválidos/);
    }
    assert.equal(executions, 0);
  });

  test(provider + ': abortar antes da requisição ou durante texto impede execução nativa', async () => {
    const ac = new AbortController(); ac.abort();
    const before = fixture([]);
    await assert.rejects(before[method]({ ...base, signal: ac.signal }), (error) => {
      assert.equal(error.name, 'AbortError'); assert.equal(error.partial.usage, null); return true;
    });
    assert.equal(before.requests.length, 0);
    let executions = 0;
    const during = new AbortController();
    const first = provider === 'gemini'
      ? response([{ candidates: [{ content: { parts: [{ text: 'Um momento…' }, { functionCall: { id: 'never', name: 'chamar_codex', args: { tarefa: 'x' } } }] }, finishReason: 'STOP' }] }])
      : response([{ choices: [{ delta: { content: 'Um momento…', tool_calls: [{ index: 0, id: 'never', function: { name: 'chamar_codex', arguments: '{"tarefa":"x"}' } }] } }] }, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }]);
    const f = fixture([first], () => { executions++; });
    await assert.rejects(f[method]({ ...base, toolsEnabled: true, signal: during.signal, onText: () => during.abort() }), (error) => {
      assert.equal(error.name, 'AbortError'); assert.equal(error.partial.text, 'Um momento…');
      assert.equal(error.partial.usage.estimated, true); return true;
    });
    assert.equal(executions, 0); assert.equal(f.requests.length, 1);
  });

  test(provider + ': cancelamento durante aprovação interrompe a continuação', async () => {
    const ac = new AbortController(); let executions = 0;
    const call = { id: 'cancel-me', name: 'chamar_codex', args: { tarefa: 'x' } };
    const f = fixture([provider === 'gemini' ? geminiCalls([call]) : openaiCalls([call])], async () => { executions++; ac.abort(); return { canceled: true }; });
    await assert.rejects(f[method]({ ...base, toolsEnabled: true, signal: ac.signal }), { name: 'AbortError' });
    assert.equal(executions, 1); assert.equal(f.requests.length, 1);
  });
}

test('OpenAI acumula chamadas fragmentadas e envia assistant/tool reais; soma uso de todas as rodadas', async () => {
  const invoked = [], notices = []; let continuations = 0;
  const first = response([
    { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-a', type: 'function', function: { name: 'chamar_', arguments: '{"tare' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'codex', arguments: 'fa":"revise ação 🦊","pasta":"C:\\\\demo"}' } }] } }] },
    { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    { choices: [], usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14, prompt_tokens_details: { cached_tokens: 2 }, completion_tokens_details: { reasoning_tokens: 1 } } }, '[DONE]',
  ], { width: 1, tail: true });
  const f = fixture([first, openaiText('Pronto!', { prompt_tokens: 20, completion_tokens: 6, total_tokens: 26, prompt_tokens_details: { cached_tokens: 3 }, completion_tokens_details: { reasoning_tokens: 2 } })], async (name, args, context) => { invoked.push({ name, args, context }); return { resultado: 'x'.repeat(6000) }; });
  const result = await f.openaiChat({ ...base, id: 'chat-1', petId: 'codex', toolsEnabled: true, onContinue: () => { continuations++; }, onTool: (event) => notices.push(event) });
  assert.equal(invoked.length, 1); assert.equal(invoked[0].name, 'chamar_codex');
  assert.equal(invoked[0].args.tarefa, 'revise ação 🦊'); assert.equal(invoked[0].context.callId, 'chat-1-0-0');
  assert.equal(notices.length, 1); assert.equal(continuations, 1);
  const next = f.requests[1].body.messages;
  assert.equal(next.at(-2).role, 'assistant'); assert.equal(next.at(-2).tool_calls[0].id, 'call-a');
  assert.equal(next.at(-1).role, 'tool'); assert.equal(next.at(-1).tool_call_id, 'call-a');
  assert.ok(next.at(-1).content.length <= 1800); assert.equal(JSON.parse(next.at(-1).content).truncated, true);
  assert.equal(result.usage.totalTokens, 40); assert.equal(result.usage.promptTokens, 30);
  assert.equal(result.usage.completionTokens, 10); assert.equal(result.usage.cachedTokens, 5);
  assert.equal(result.usage.reasoningTokens, 3); assert.equal(result.usage.requests, 2); assert.equal(result.text, 'Pronto!');
  assert.equal(result.turns[1].parts[0].functionResponse.id, 'call-a');
});

test('Gemini preserva partes assinadas e IDs e soma tokens incluindo pensamentos e cache', async () => {
  const signed = { functionCall: { name: 'abrir_antigravity', id: 'gem-call', args: { tarefa: 'revisar' } }, thoughtSignature: 'do-not-change-this-signature' };
  const first = response([
    { candidates: [{ content: { parts: [{ text: 'Vou delegar.', thoughtSignature: 'signed-text' }, signed] } }] },
    { candidates: [{ content: { parts: [] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, thoughtsTokenCount: 5, cachedContentTokenCount: 4, totalTokenCount: 17 } },
  ]);
  const f = fixture([first, geminiText('Concluído.', { promptTokenCount: 20, candidatesTokenCount: 3, thoughtsTokenCount: 2, cachedContentTokenCount: 6, totalTokenCount: 25 })], async () => ({ resultado: 'ok' }));
  const result = await f.geminiChat({ ...base, toolsEnabled: true });
  assert.deepEqual(f.requests[1].body.contents[1].parts, [{ text: 'Vou delegar.', thoughtSignature: 'signed-text' }, signed]);
  assert.equal(f.requests[1].body.contents[2].parts[0].functionResponse.id, 'gem-call');
  assert.equal(result.text, 'Vou delegar.Concluído.'); assert.equal(result.usage.totalTokens, 42);
  assert.equal(result.usage.thoughtsTokens, 7); assert.equal(result.usage.cachedTokens, 10); assert.equal(result.usage.requests, 2);
});

test('Gemini aceita assinatura em chunk final sem texto sem perder assinatura anterior', async () => {
  const f = fixture([response([
    { candidates: [{ content: { parts: [{ text: 'Olá ' }] } }] },
    { candidates: [{ content: { parts: [{ thoughtSignature: 'signature-a' }] } }] },
    { candidates: [{ content: { parts: [{ text: 'mundo', thoughtSignature: 'signature-b' }] }, finishReason: 'STOP' }] },
  ], { tail: true, width: 1 })]);
  const result = await f.geminiChat(base);
  assert.deepEqual(result.turns[0].parts, [{ text: 'Olá ', thoughtSignature: 'signature-a' }, { text: 'mundo', thoughtSignature: 'signature-b' }]);
});

test('Gemini não injeta ID em uma chamada assinada que originalmente não o possui', async () => {
  const signed = { functionCall: { name: 'chamar_codex', args: { tarefa: 'revisar' } }, thoughtSignature: 'exact-signature' };
  let context;
  const f = fixture([response([{ candidates: [{ content: { parts: [signed] }, finishReason: 'STOP' }] }]), geminiText('ok')], async (_name, _args, value) => { context = value; return { resultado: 'ok' }; });
  await f.geminiChat({ ...base, toolsEnabled: true, id: 'turn' });
  assert.deepEqual(f.requests[1].body.contents[1].parts, [signed]);
  assert.equal(f.requests[1].body.contents[2].parts[0].functionResponse.id, undefined);
  assert.equal(context.callId, 'turn-0-0');
});

test('limite de saída não executa ferramenta, mesmo com argumentos JSON completos', async () => {
  let executed = 0;
  for (const provider of ['gemini', 'openai']) {
    const first = provider === 'gemini'
      ? response([{ candidates: [{ content: { parts: [{ functionCall: { id: 'truncated', name: 'chamar_codex', args: { tarefa: 'x' } } }] }, finishReason: 'MAX_TOKENS' }] }])
      : response([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'truncated', function: { name: 'chamar_codex', arguments: '{"tarefa":"x"}' } }] }, finish_reason: 'length' }] }, '[DONE]']);
    const f = fixture([first], () => { executed++; });
    const result = await f[provider + 'Chat']({ ...base, toolsEnabled: true });
    assert.equal(result.finishReason, provider === 'gemini' ? 'MAX_TOKENS' : 'length');
    assert.equal(f.requests.length, 1);
  }
  assert.equal(executed, 0);
});

test('histórico comum converte chamadas e respostas pareadas sem perder texto nem IDs', () => {
  const messages = toOpenAIMessages([
    { role: 'user', parts: [{ text: 'oi' }] },
    { role: 'model', parts: [{ text: 'vou fazer' }, { functionCall: { name: 'chamar_codex', args: { tarefa: 'a' } } }, { functionCall: { name: 'chamar_codex', id: 'with-id', args: { tarefa: 'b' } } }] },
    { role: 'user', parts: [{ functionResponse: { name: 'chamar_codex', response: { resultado: 'A' } } }, { functionResponse: { name: 'chamar_codex', id: 'with-id', response: { resultado: 'B' } } }] },
  ], 'system');
  assert.equal(messages[0].role, 'system'); assert.equal(messages[2].content, 'vou fazer');
  assert.equal(messages[2].tool_calls[0].id, messages[3].tool_call_id);
  assert.equal(messages[4].tool_call_id, 'with-id');
});

for (const provider of ['gemini', 'openai']) test(provider + ': limites de rodadas e chamadas impedem loop de execução', async () => {
  let executed = 0;
  const calls = [0, 1, 2, 3].map((index) => ({ id: 'call-' + index, name: 'chamar_codex', args: { tarefa: String(index) } }));
  const first = provider === 'gemini' ? geminiCalls(calls) : openaiCalls(calls);
  const second = provider === 'gemini' ? geminiText('Resumo.') : openaiText('Resumo.');
  const f = fixture([first, second], async () => { executed++; return { resultado: 'ok' }; });
  const result = await f[provider + 'Chat']({ ...base, toolsEnabled: true, maxToolCalls: 999, maxToolRounds: 999 });
  assert.equal(executed, 3); assert.equal(f.requests.length, 2); assert.equal(f.requests[1].body.tools, undefined);
  assert.equal(result.turns[1].parts.length, 4); assert.match(result.turns[1].parts[3].functionResponse.response.erro, /Limite/);
});

test('máximo de duas rodadas de ferramentas termina com uma única chamada de resumo sem tools', async () => {
  let executed = 0;
  const call = { id: 'one', name: 'chamar_codex', args: { tarefa: 'a' } };
  const f = fixture([openaiCalls([call]), openaiCalls([{ ...call, id: 'two' }]), openaiCalls([{ ...call, id: 'three' }])], async () => { executed++; return { resultado: 'ok' }; });
  const result = await f.openaiChat({ ...base, toolsEnabled: true });
  assert.equal(executed, 2); assert.equal(f.requests.length, 3); assert.equal(f.requests[2].body.tools, undefined); assert.equal(result.finishReason, 'tool_limit');
});

test('Gemini troca modelo apenas em 404 explicitamente relacionado ao modelo', async () => {
  const f = fixture([new Response(JSON.stringify({ error: { status: 'NOT_FOUND', message: 'models/missing is not found' } }), { status: 404 }), geminiText('ok')]);
  const result = await f.geminiChat({ ...base, model: 'missing', models: ['missing', 'fallback'] });
  assert.equal(f.requests.length, 2); assert.equal(result.model, 'fallback'); assert.equal(result.usage.requests, 1);
});

test('falhas HTTP ficam sanitizadas e não repetem 429, 500, 403 nem 404 de outro recurso', async () => {
  for (const status of [429, 500, 403, 404]) {
    const f = fixture([new Response(JSON.stringify({ error: { message: 'secret fake-test-key request content', status: 'NOT_FOUND' } }), { status })]);
    await assert.rejects(f.geminiChat({ ...base, models: ['fallback'] }), (error) => {
      assert.equal(error.status, status); assert.equal(error.partial.usage, null);
      assert.ok(!error.message.includes(base.key)); assert.ok(!error.message.includes('request content')); return true;
    });
    assert.equal(f.requests.length, 1);
  }
});

for (const provider of ['gemini', 'openai']) {
  test(provider + ': reset de conexão e quota antes do streaming deixam uso desconhecido, sem zeros medidos', async () => {
    for (const reply of [
      () => { throw new Error('ECONNRESET fake-test-key'); },
      new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), { status: 429 }),
    ]) {
      const f = fixture([reply]);
      await assert.rejects(f[provider + 'Chat'](base), (error) => {
        assert.equal(error.partial.usage, null); assert.equal(error.partial.text, '');
        assert.ok(!error.message.includes(base.key)); return true;
      });
      assert.equal(f.requests.length, 1);
    }
  });

  test(provider + ': quota na continuação preserva contagem real da rodada já concluída', async () => {
    const call = { id: 'first-call', name: 'chamar_codex', args: { tarefa: 'x' } };
    const first = provider === 'gemini'
      ? geminiCalls([call], { promptTokenCount: 10, candidatesTokenCount: 3, totalTokenCount: 15, thoughtsTokenCount: 2 })
      : openaiCalls([call], { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
    const f = fixture([first, new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), { status: 429 })], async () => ({ resultado: 'ok' }));
    await assert.rejects(f[provider + 'Chat']({ ...base, toolsEnabled: true }), (error) => {
      assert.equal(error.status, 429); assert.equal(error.partial.usage.totalTokens, 15);
      assert.equal(error.partial.usage.requests, 1); assert.equal(error.partial.usage.estimated, false); return true;
    });
    assert.equal(f.requests.length, 2);
  });
}

test('falha parcial não faz retry: mantém texto e estima uso da requisição interrompida', async () => {
  const f = fixture([response([{ candidates: [{ content: { parts: [{ text: 'texto parcial' }] } }] }])]);
  await assert.rejects(f.geminiChat({ ...base, models: ['fallback'] }), (error) => {
    assert.equal(error.partial.text, 'texto parcial'); assert.equal(error.partial.usage.estimated, true);
    assert.equal(error.partial.usage.requests, 1); return true;
  });
  assert.equal(f.requests.length, 1);
});

test('JSON de argumentos truncado nunca executa mesmo com marcador de fim do OpenAI', async () => {
  let executed = 0;
  const f = fixture([response([
    { choices: [{ delta: { tool_calls: [{ index: 0, id: 'bad', function: { name: 'chamar_codex', arguments: '{"tarefa":' } }] } }] },
    { choices: [{ finish_reason: 'tool_calls', delta: {} }] }, '[DONE]',
  ]), openaiText('Não executado.')], () => { executed++; });
  await f.openaiChat({ ...base, toolsEnabled: true }); assert.equal(executed, 0);
});

test('perda do stream após delta de ferramenta impede execução de argumentos aparentemente completos', async () => {
  let executed = 0;
  const f = fixture([response([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'bad', function: { name: 'chamar_codex', arguments: '{"tarefa":"x"}' } }] } }] }])], () => { executed++; });
  await assert.rejects(f.openaiChat({ ...base, toolsEnabled: true }), /terminou antes/);
  assert.equal(executed, 0); assert.equal(f.requests.length, 1);
});
