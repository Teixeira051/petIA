const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function resolveToolRequest(name, args, defaultFolder = '') {
  if (!['chamar_codex', 'abrir_antigravity'].includes(name)) throw new Error('Ferramenta desconhecida.');
  if (!args || typeof args.tarefa !== 'string' || !args.tarefa.trim() || args.tarefa.length > 20000 || args.tarefa.includes('\0')) {
    throw new Error('A tarefa deve conter entre 1 e 20000 caracteres.');
  }
  const folder = args.pasta ?? defaultFolder;
  if (typeof folder !== 'string' || folder.includes('\0') || folder.length > 4096) throw new Error('Pasta inválida.');
  if (folder && (!path.isAbsolute(folder) || !fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory())) {
    throw new Error('Escolha uma pasta absoluta existente.');
  }
  const pasta = folder ? fs.realpathSync(folder) : fs.realpathSync(os.homedir());
  return { tarefa: args.tarefa.trim(), pasta, writable: !!folder, name };
}

function createToolExecutor({ confirm, runCodex, runAntigravity, resolveRequest = resolveToolRequest }) {
  let busy = false;
  return async (name, args, { defaultFolder = '', signal, onStatus = () => {}, callId, owner } = {}) => {
    if (busy) return { ok: false, text: 'Já há uma tarefa pendente. Aguarde ou cancele antes de iniciar outra.' };
    busy = true;
    try {
      const request = resolveRequest(name, args, defaultFolder);
      if (signal?.aborted) return { ok: false, canceled: true, text: 'Cancelado.' };
      onStatus('Aguardando sua confirmação na janela do Windows…');
      const approved = await confirm(request, { owner });
      if (!approved || signal?.aborted) return { ok: false, canceled: true, text: 'Cancelado.' };
      // A pasta pode ter sido removida/trocada enquanto o usuário lia a confirmação.
      const checked = resolveRequest(name, { ...args, pasta: request.pasta }, defaultFolder);
      if (checked.pasta !== request.pasta) throw new Error('A pasta mudou. Envie a tarefa novamente.');
      onStatus(name === 'chamar_codex' ? 'Codex trabalhando…' : 'Abrindo o Antigravity…');
      return await (name === 'chamar_codex' ? runCodex(request, onStatus, callId, owner) : runAntigravity(request));
    } catch (error) {
      return { ok: false, text: error.message };
    } finally { busy = false; }
  };
}

module.exports = { resolveToolRequest, createToolExecutor };
