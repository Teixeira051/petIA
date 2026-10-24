const LIMITS = Object.freeze({ maxOutputTokens: 512, toolOutputChars: 1800, maxToolRounds: 2 });

function isUserRequest(message) {
  return message?.role === 'user' && Array.isArray(message.parts) &&
    !message.parts.some((part) => part.functionResponse) &&
    message.parts.some((part) => typeof part.text === 'string' && part.text.trim());
}

function latestUserText(history) {
  if (!Array.isArray(history)) return '';
  const request = history.findLast(isUserRequest);
  return request ? request.parts.map((part) => typeof part.text === 'string' ? part.text : '').join('\n') : '';
}

function normalized(text) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function completeToolBlock(messages) {
  const pending = [];
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.functionCall) {
        if (message.role !== 'model' || !part.functionCall.name) return false;
        pending.push(part.functionCall);
      }
      if (part.functionResponse) {
        if (message.role !== 'user') return false;
        const response = part.functionResponse;
        const index = pending.findIndex((call) => call.name === response.name &&
          (call.id === undefined && response.id === undefined || call.id !== undefined && call.id === response.id));
        if (index < 0) return false;
        pending.splice(index, 1);
      }
    }
  }
  return pending.length === 0;
}

function policyError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Retain a suffix of complete request/response exchanges. maxChars measures the
 * full JSON payload in JavaScript UTF-16 code units, including signatures and
 * structural overhead: this is a deterministic budget, not a token estimate.
 * No message, function result, or thoughtSignature is partially truncated.
 */
function compactHistory(history, { maxChars = 12000, maxMessages = 12 } = {}) {
  if (!Number.isSafeInteger(maxChars) || maxChars < 2 || !Number.isSafeInteger(maxMessages) || maxMessages < 1) {
    throw new TypeError('O orçamento do histórico precisa usar limites inteiros positivos.');
  }
  if (!Array.isArray(history)) throw new TypeError('Histórico de conversa inválido.');
  const groups = [];
  for (const message of history) {
    if (!message || !['user', 'model'].includes(message.role) || !Array.isArray(message.parts) ||
      message.parts.some((part) => !part || typeof part !== 'object')) throw new TypeError('Mensagem de conversa inválida.');
    if (isUserRequest(message)) groups.push([]);
    // A history previously sliced by message count may start inside a tool
    // exchange. Ignore that prefix until the first independent user request.
    if (groups.length) groups.at(-1).push(message);
  }
  if (!groups.length) return [];
  if (!completeToolBlock(groups.at(-1))) {
    throw policyError('A chamada de ferramenta mais recente está incompleta. Tente enviar seu pedido novamente.', 'HISTORY_INCOMPLETE_TOOL_BLOCK');
  }
  let retained = [];
  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index];
    if (!completeToolBlock(group)) continue;
    const candidate = [...group, ...retained];
    let size;
    try { size = JSON.stringify(candidate).length; } catch { throw new TypeError('O histórico precisa conter somente dados serializáveis.'); }
    if (candidate.length > maxMessages || size > maxChars) {
      if (!retained.length) {
        throw policyError(`Seu pedido mais recente e suas respostas excedem o limite de ${maxChars} caracteres ou ${maxMessages} mensagens. O pedido não foi truncado; reduza o texto ou envie um pedido menor.`, 'HISTORY_LIMIT');
      }
      break;
    }
    retained = candidate;
  }
  return retained;
}

function shouldOfferTools(history) {
  const text = normalized(latestUserText(history));
  if (!text.trim()) return false;
  if (/^\s*\/(?:codex|code|argon|antigravity)\b/u.test(text)) return true;
  if (/\b(?:nao|sem)\s+(?:quero\s+)?(?:chamar|chame|usar|use|executar|execute|rodar|rode|delegar|delegue|editar|edite|alterar|altere)\b/u.test(text)) return false;
  // Explanations about commands do not need function declarations or local
  // capabilities. A later explicit action can be requested in its own turn.
  if (/^\s*(?:o que (?:e|significa)|como\b|explique\b|me explique\b|quem\b|por que\b|qual\b|quais\b|quando\b|onde\b)/u.test(text) ||
    /\b(?:pode|poderia|consegue)\s+(?:me\s+)?(?:explicar|ensinar)\b/u.test(text)) return false;
  if (/\b(?:delegar|delegue|delega|encaminhe|encaminhar)\b/u.test(text)) return true;
  const tool = /\b(?:codex|argon|antigravity|chamar_codex|abrir_antigravity)\b/u;
  const requestTool = /\b(?:chamar|chame|chama|usar|use|usa|acione|acionar|abrir|abra|abre|mande|mandar|manda|envie|enviar|peca|pedir|pede)\b/u;
  if (tool.test(text) && requestTool.test(text)) return true;
  if (/\b(?:executar|execute|executa|rodar|rode|edite|editar|altere|alterar|refatore|refatorar|compile|compilar|instale|instalar)\b/u.test(text)) return true;
  const action = /\b(?:faca|fazer|crie|criar|corrija|corrigir|implemente|implementar|teste|testar|apague|apagar|remova|remover|salve|salvar|liste|listar|otimize|otimizar|conserte|consertar|revise|revisar|repare|reparar|ajuste|ajustar|melhore|melhorar|adapte|adaptar|analise|analisar|verifique|verificar|pesquise|pesquisar|procure|procurar|busque|buscar|commite|commitar)\b/u;
  const target = /\b(?:codigo|arquivo|arquivos|pasta|pastas|repositorio|projeto|script|terminal|comando|comandos|teste|testes|eslint|aplicativo|app|site|pagina|computador|pc|build|bug|funcao|componente|git|commit|commits|branch|diff|dependencia|dependencias|monitor|monitores|tela|telas|resolucao|layout|design|interface|suporte)\b/u;
  return action.test(text) && target.test(text);
}

function shouldIncludePetState(history) {
  const text = normalized(latestUserText(history));
  if (/\bcomo\s+(?:(?:voce|voces|os?\s+pets?)\s+(?:esta|estao)|(?:esta|estao)\s+(?:voce|voces|os?\s+pets?))\b/u.test(text)) return true;
  return /\b(?:energia|fome|sono|alimentacao|diversao|felicidade|estado|estatisticas|status)\b/u.test(text) &&
    /\b(?:voce|voces|seu|sua|seus|suas|pet|pets|gemi|codexy|raposo|sparky)\b/u.test(text);
}

function conciseSystemPrompt(petId, state, toolsEnabled, history = []) {
  const personas = {
    gemi: 'Você é Gemi, um pet virtual curioso e acolhedor.',
    codex: 'Você é Codexy, um pet virtual prático e bem-humorado.',
    claude: 'Você é Raposo, um pet virtual observador e gentil.',
    sparky: 'Você é Sparky, um pet virtual criativo e animado.',
  };
  const instructions = [
    personas[petId] || personas.gemi,
    'Converse em português do Brasil, com clareza e brevidade; detalhe quando solicitado. Você acompanha o usuário na área de trabalho.',
    'Não invente acesso ao computador nem afirme ter executado uma tarefa sem resultado.',
  ];
  if (toolsEnabled) instructions.push('Para tarefas locais, use chamar_codex (código, arquivos e comandos) ou abrir_antigravity (IDE Argon). Repasses exigem confirmação do usuário. Preserve o objetivo solicitado e aguarde o resultado.');
  if (shouldIncludePetState(history) && state && typeof state === 'object') {
    const labels = { food: 'alimentação', fun: 'diversão', energy: 'energia' };
    const stats = Object.entries(labels).filter(([key]) => Number.isFinite(state[key])).map(([key, label]) => `${label}: ${Math.round(Math.max(0, Math.min(100, state[key])))}/100`);
    if (stats.length) instructions.push(`Estado atual do pet: ${stats.join('; ')}.`);
  }
  return instructions.join('\n');
}

module.exports = { LIMITS, compactHistory, shouldOfferTools, shouldIncludePetState, conciseSystemPrompt };
