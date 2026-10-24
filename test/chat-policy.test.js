const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LIMITS, compactHistory, shouldOfferTools, shouldIncludePetState, conciseSystemPrompt } = require('../lib/chat-policy');

const user = (text) => ({ role: 'user', parts: [{ text }] });
const model = (text) => ({ role: 'model', parts: [{ text }] });
const call = (name, id, thoughtSignature = 'assinatura-completa') => ({ role: 'model', parts: [{ functionCall: { name, id, args: { tarefa: 'Corrigir o teste' } }, thoughtSignature }] });
const response = (name, id) => ({ role: 'user', parts: [{ functionResponse: { name, id, response: { ok: true, text: 'Concluído' } } }] });

test('limites padrão reduzem saída e rodadas de ferramentas', () => {
  assert.deepEqual(LIMITS, { maxOutputTokens: 512, toolOutputChars: 1800, maxToolRounds: 2 });
  assert.equal(Object.isFrozen(LIMITS), true);
});

test('compactação preserva o último pedido integral e remove trocas antigas completas', () => {
  const request = user('Ajuste o segundo monitor sem modificar meu objetivo 🦊.');
  const history = [user('contexto antigo '.repeat(100)), model('resposta antiga'), user('contexto recente'), model('resposta recente'), request];
  const snapshot = structuredClone(history);
  const result = compactHistory(history, { maxChars: 400, maxMessages: 3 });
  assert.deepEqual(result, history.slice(-3));
  assert.equal(result.at(-1), request);
  assert.ok(JSON.stringify(result).length <= 400);
  assert.deepEqual(history, snapshot, 'O histórico de origem não deve ser alterado');
});

test('orçamento conta todo o JSON e aceita exatamente o pedido que cabe', () => {
  const request = [user('Olá 🐱! café, ação e resolução em duas telas.')];
  const exact = JSON.stringify(request).length;
  assert.deepEqual(compactHistory(request, { maxChars: exact }), request);
  assert.throws(() => compactHistory(request, { maxChars: exact - 1 }), (error) => error.code === 'HISTORY_LIMIT' && /não foi truncado/u.test(error.message));
});

test('pedido individual maior que o orçamento produz erro claro em vez de truncar', () => {
  const history = [user('x'.repeat(12001))];
  assert.throws(() => compactHistory(history), (error) => error.code === 'HISTORY_LIMIT' && /12000 caracteres/u.test(error.message));
  assert.equal(history[0].parts[0].text.length, 12001);
});

test('chamada, resposta e thoughtSignature são mantidas juntas e sem alterações', () => {
  const signature = 'opaque-signature-🦊'.repeat(15);
  const exchange = [user('Chame o Codex para corrigir o teste'), call('chamar_codex', 'call-1', signature), response('chamar_codex', 'call-1'), model('Teste corrigido')];
  const next = user('Agora explique a correção.');
  const full = compactHistory([...exchange, next]);
  assert.deepEqual(full, [...exchange, next]);
  assert.equal(full[1].parts[0].thoughtSignature, signature);
  assert.equal(full[1], exchange[1], 'Partes opacas devem ser preservadas integralmente');
  assert.deepEqual(compactHistory([...exchange, next], { maxChars: 12000, maxMessages: 4 }), [next]);
  assert.deepEqual(compactHistory([...exchange, next], { maxChars: 160, maxMessages: 12 }), [next]);
});

test('várias chamadas e rodadas permanecem um único bloco de conversa', () => {
  const parallel = { role: 'model', parts: [call('chamar_codex', 'a').parts[0], call('chamar_codex', 'b').parts[0]] };
  const results = { role: 'user', parts: [response('chamar_codex', 'b').parts[0], response('chamar_codex', 'a').parts[0]] };
  const history = [user('Execute os testes e revise o resultado'), parallel, results, call('abrir_antigravity', 'c'), response('abrir_antigravity', 'c'), model('Tudo concluído')];
  assert.deepEqual(compactHistory(history), history);
  assert.throws(() => compactHistory(history, { maxMessages: 5 }), (error) => error.code === 'HISTORY_LIMIT');
});

test('prefixos e blocos antigos órfãos não vazam chamadas sem resposta', () => {
  const request = user('Oi!');
  assert.deepEqual(compactHistory([response('chamar_codex', 'missing'), model('resto antigo'), request]), [request]);
  assert.deepEqual(compactHistory([user('Pedido antigo'), call('chamar_codex', 'lost'), request]), [request]);
  assert.deepEqual(compactHistory([model('resto sem pedido'), response('chamar_codex', 'missing')]), []);
});

test('bloco recente incompleto ou IDs de resposta incompatíveis são recusados', () => {
  for (const history of [
    [user('Edite o arquivo'), call('chamar_codex', 'a')],
    [user('Edite o arquivo'), call('chamar_codex', 'a'), response('chamar_codex', 'b')],
    [user('Edite o arquivo'), response('chamar_codex', 'a')],
  ]) assert.throws(() => compactHistory(history), (error) => error.code === 'HISTORY_INCOMPLETE_TOOL_BLOCK');
});

test('histórico e opções inválidos falham de forma previsível', () => {
  assert.deepEqual(compactHistory([]), []);
  for (const history of [null, {}, [null], [{ role: 'system', parts: [] }], [{ role: 'user', parts: [null] }]]) assert.throws(() => compactHistory(history), TypeError);
  for (const options of [{ maxChars: -1 }, { maxMessages: 0 }, { maxChars: 1.5 }, { maxMessages: Infinity }]) assert.throws(() => compactHistory([], options), TypeError);
});

test('ferramentas são oferecidas para pedidos explícitos de tarefas locais', () => {
  for (const text of [
    '/codex corrigir o projeto', '/argon abrir o projeto', 'Chame o Codex para ajudar', 'Use o Argon nesta tarefa',
    'Delegue essa tarefa', 'Pode executar este comando?', 'Edite o arquivo de configuração',
    'Crie um teste para este projeto', 'Corrija o código do aplicativo', 'Refatore a função', 'Liste os arquivos da pasta',
    'Faça o commit no projeto', 'Pode fazer os reparos no projeto?', 'Faça uma revisão do código',
    'Ajuste o suporte a dois monitores', 'Faça melhorias no design da interface', 'Pesquise os arquivos da pasta',
    'Procure o bug no projeto', 'Verifique as dependências do aplicativo', 'Revise o diff', 'Faça o commit',
  ]) assert.equal(shouldOfferTools([user(text)]), true, text);
});

test('papo comum, explicações e recusa explícita não carregam ferramentas', () => {
  for (const text of [
    'Oi, tudo bem?', 'Me conta uma piada', 'Crie uma história sobre uma raposa', 'O que é Codex?',
    'Como executar um script no terminal?', 'Explique o código deste projeto', 'Não chame o Codex',
    'Explique sem executar o comando', 'Qual a capital de Portugal?',
    'Faça um poema', 'Pode fazer uma piada?', 'Como faço o commit no projeto?',
    'Pode explicar como fazer reparos no projeto?', 'Qual o suporte a monitores desse aplicativo?',
  ]) assert.equal(shouldOfferTools([user(text)]), false, text);
});

test('a intenção usa somente o último pedido textual e ignora functionResponse', () => {
  const oldTools = [user('Use o Codex'), call('chamar_codex', 'a'), response('chamar_codex', 'a'), model('Concluído')];
  assert.equal(shouldOfferTools([...oldTools, user('Obrigado, me conte uma piada')]), false);
  assert.equal(shouldOfferTools([response('chamar_codex', 'a')]), false);
  assert.equal(shouldOfferTools(oldTools), true, 'Respostas de ferramenta não substituem a intenção textual durante uma continuação');
});

test('prompt comum é estável entre alterações de stats e preserva personas', () => {
  const first = conciseSystemPrompt('gemi', { food: 10, fun: 20, energy: 30 }, false, [user('Oi!')]);
  const second = conciseSystemPrompt('gemi', { food: 99, fun: 85, energy: 70 }, false, [user('Me conte uma piada')]);
  assert.equal(first, second);
  assert.ok(first.length < 500);
  assert.doesNotMatch(first, /alimentação|energia|chamar_codex/u);
  assert.match(conciseSystemPrompt('codex', null, true), /Codexy.*\n.*\n.*\n.*chamar_codex/u);
  assert.match(conciseSystemPrompt('claude', null, false), /Raposo/u);
  assert.match(conciseSystemPrompt('sparky', null, false), /Sparky/u);
});

test('stats entram somente quando a última pergunta trata do estado do pet', () => {
  for (const text of ['Como você está?', 'Qual sua energia?', 'Como estão os pets?', 'O Gemi está com fome?']) assert.equal(shouldIncludePetState([user(text)]), true, text);
  for (const text of ['Como funciona energia solar?', 'Estou com fome', 'Me explique os estados brasileiros']) assert.equal(shouldIncludePetState([user(text)]), false, text);
  const history = [user('Qual sua energia?'), model('Estou bem!'), user('Agora conte uma piada')];
  assert.equal(shouldIncludePetState(history), false);
  assert.doesNotMatch(conciseSystemPrompt('gemi', { energy: 80 }, false, history), /80\/100/u);
  assert.match(conciseSystemPrompt('gemi', { food: -10, fun: NaN, energy: 120 }, false, [user('Como você está?')]), /alimentação: 0\/100; energia: 100\/100/u);
  assert.doesNotMatch(conciseSystemPrompt('gemi', { energy: 80 }, false), /80\/100/u);
});
