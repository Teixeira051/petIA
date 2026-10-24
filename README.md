# Gemi Pets ✨🤖🦊🌟

Pets com IA para Windows que passeiam pela tela, conversam e jogam seis minijogos.

## Iniciar pelo código

Requisitos: Windows, Node.js 22.13 ou superior e .NET Framework 4.x com o compilador C# (normalmente incluído no Windows). Node.js 24 é usado na verificação automática.

1. Abra um terminal nesta pasta.
2. Execute `npm ci` para instalar as versões fixadas no arquivo de dependências.
3. Execute `npm start`.

Também é possível usar `Iniciar Gemi.bat`, `Iniciar Gemi.vbs`, `launch.js` ou `launch.ps1` depois da instalação. Os caminhos são relativos ao projeto. Para criar um atalho na sua Área de Trabalho, execute `node make-shortcut.js`.

O monitor de janelas é compilado do fonte antes da inicialização. Se o compilador não for encontrado, instale o .NET Framework ou defina `CSC_PATH` com o caminho do `csc.exe`.

## Telas, resolução e escala

O app lê todos os monitores conectados e cria uma janela transparente por tela. Cada janela usa a área útil do seu próprio monitor, descontando a barra de tarefas, e calcula o canvas pela escala do Windows. Resolução, rotação, monitores à esquerda e escalas diferentes (por exemplo 100% e 150%) são tratados separadamente.

Com duas telas e dois pets, cada tela recebe um pet por padrão. Eles não são duplicados. No HUD do pet, use **Outra tela**, ou escolha um destino em **Telas dos pets** no menu perto do relógio. A informação de tela mostra resolução física e escala detectadas. As preferências são salvas; desconectar um monitor traz seus pets para o principal, e reconectar permite devolvê-los ao destino anterior.

Jogos reúnem os pets na tela em que foram iniciados. O estado, a skin e o histórico concluído da conversa acompanham o pet nas transferências. O histórico fica apenas na memória durante a sessão; respostas e tarefas em andamento são canceladas quando a tela que as solicitou é removida ou o pet é transferido. É possível abrir o app em telas pequenas: chat, HUD, menus e balões ajustam seus limites ao espaço disponível.

O visual usa painéis com cores de cada personagem, melhor contraste, foco visível, indicações de teclado e respeito à preferência de reduzir animações. A área do desktop continua transparente.

## Personagens e provedores

| Pet | Provedor de conversa |
| --- | --- |
| Gemi ✨ | Google Gemini |
| Codexy ⚡ | OpenAI com chave configurada; Gemini como alternativa |
| Raposo 🦊 | Persona do Google Gemini |
| Sparky 🌟 | Persona do Google Gemini |

Não há integração com a API da Anthropic. A raposa foi renomeada para Raposo; os identificadores internos antigos foram mantidos para preservar configurações e skins.

Clique com o botão direito em um pet para abrir o chat. Configure as chaves pelo botão 🔑. O Gemini usa sua chave do Google AI Studio; a chave opcional da OpenAI é configurada no Codexy. As variáveis `GEMINI_API_KEY` e `OPENAI_API_KEY` também são aceitas e não são copiadas para o arquivo de configuração.

O chat usa as APIs pela internet; chaves, cotas, cobrança e disponibilidade dos modelos dependem do provedor. A presença de uma chave não comprova que a conta tem acesso ao modelo. O app não envia telemetria de uso a um serviço próprio. Os contadores de tokens podem ser estimados quando o provedor não informa o consumo.

### Conversa e consumo de tokens

O Gemini usa `gemini-flash-lite-latest` por padrão; o Codexy com chave OpenAI usa `gpt-4o-mini`. Uma seleção explícita em `geminiModel` ou `openaiModel` no arquivo de configuração tem prioridade. Os aliases de modelos podem mudar de versão no provedor. Só um erro de modelo inexistente permite tentar uma alternativa automaticamente; erros de cota, indisponibilidade ou uma resposta interrompida não geram novas tentativas pagas.

Os prompts são curtos e estáveis. As ferramentas só são enviadas quando o último pedido indica uma tarefa local; perguntas e conversa comum dispensam suas definições. O botão Codex e `/codex` entregam a tarefa diretamente à CLI, evitando uma chamada intermediária ao Gemini/OpenAI. O estado de fome, energia e diversão só entra quando for assunto da pergunta.

Cada chamada leva até 12 mensagens recentes e 12.000 caracteres de histórico serializado, conservando pedidos e pares de chamada/resultado completos. Um pedido individual maior recebe um aviso para ser reduzido; ele não é truncado. As respostas têm limite de 512 tokens por chamada. Quando esse limite é atingido, o chat mostra **Peça para continuar**; não envia uma nova solicitação automaticamente. Uma resposta pode fazer no máximo duas rodadas de ferramentas e três execuções, seguidas de uma chamada de resumo sem ferramentas. O modelo recebe até 1.800 caracteres de cada resultado, enquanto o card mostra a saída completa recebida.

Os contadores somam todas as chamadas da resposta e mostram entrada, saída, cache e raciocínio quando informados pelo provedor. O uso da CLI aparece separadamente no card **Codex CLI**. Cache e raciocínio são detalhamentos do total, não valores extras a somar. `~` indica estimativa. Os números são consumo de tokens, não uma cotação em dinheiro.

## Tarefas no computador

Os botões ⚡ Codex e 🚀 Argon, os comandos `/codex` e `/argon`, e os pedidos sugeridos pela IA passam pela mesma confirmação nativa do Windows. O diálogo mostra a tarefa completa, a pasta resolvida e o tipo de acesso. Cancelar é a opção padrão; sem aprovação não há execução.

A pasta pode ser definida nas configurações do projeto; a confirmação sempre mostra o caminho resolvido. Sem uma pasta de projeto, o Codex recebe a pasta pessoal em modo somente leitura. Com uma pasta escolhida, ele recebe `workspace-write`. O Antigravity utiliza as permissões próprias do IDE; escolher uma pasta não impõe um sandbox ao IDE. Codex e Antigravity precisam estar instalados separadamente.

Gemini e OpenAI podem chamar essas ferramentas e receber seu resultado. O Codex abre uma execução separada, temporária, usando a autenticação existente da CLI — inclusive uma conta ChatGPT conectada. Isso não envia mensagens a este chat do Codex, nem à equipe que desenvolveu o aplicativo. A assinatura do ChatGPT não fornece uma chave da API OpenAI: o chat do Codexy pela API precisa de chave e cobrança próprias; a delegação pela CLI usa os limites da conta conectada.

Cada tarefa da CLI usa esforço de raciocínio `low`, preservando as demais configurações do usuário e a tarefa original. Trabalhos complexos podem precisar ser continuados no Codex com outro esforço. A CLI também carrega seu próprio contexto e ferramentas, portanto iniciar uma execução pode consumir muitos tokens mesmo para uma resposta curta. Não é acionada para papo comum.

Leia a tarefa e a pasta antes de aprovar. Conteúdo colado ou respostas do modelo podem conter instruções enganosas. A confirmação reduz execuções acidentais; ela não garante que uma tarefa aprovada seja segura.

## Chaves e proteções

- As chaves salvas são criptografadas com `safeStorage` do Electron, usando DPAPI no Windows. Elas permanecem descriptografadas na memória enquanto o app funciona e nunca são devolvidas ao renderer.
- A configuração fica em `%APPDATA%/gemi-pet/config.json`. Arquivos antigos com chaves em texto puro são migrados ao abrir o app. A substituição só ocorre depois de criptografar todas as chaves. Se o arquivo estiver corrompido ou não puder ser desbloqueado, ele é preservado e o app informa o erro.
- As chaves estão vinculadas ao usuário/sistema. Copiar o arquivo para outro usuário ou computador pode exigir cadastrar as chaves novamente. DPAPI não isola as chaves de todos os outros programas executados na mesma conta.
- O renderer usa isolamento de contexto, sandbox explícito e Node desabilitado. Navegação, popups, webviews e permissões não solicitadas são bloqueados. Todos os IPC validam a janela, o frame principal e a página de origem; os dados recebidos também são limitados.
- Links externos são limitados aos sites de configuração do Google AI Studio e OpenAI. Respostas do chat são escapadas antes da formatação.
- `%TEMP%/gemi-boot.log` mantém até 1 MiB mais um arquivo de rotação `.1`; chaves conhecidas são removidas das mensagens. Evite registrar outros dados pessoais no console.
- A detecção de Spotify/Antigravity é local e consulta os processos a cada 30 segundos.

## Verificar e compilar

- `npm run lint`: ESLint em todo o JavaScript.
- `npm test`: testes de provedores com respostas simuladas, streaming fragmentado, delegação, limites, métricas, histórico, migração de chaves, IPC, confirmação nativa, cancelamento, pastas e rotação de log. Não chama APIs pagas nem a CLI real.
- `npm run test:renderer`: abre uma janela oculta e temporária do Electron, exercita os módulos, seis jogos, seis skins, chat e o cofre real. Não acessa sua configuração nem chama APIs pagas ou agentes locais.
- `npm run check`: executa todas as verificações anteriores.
- `npm run build:native`: compila o monitor de janelas e o gerador de ícone a partir dos fontes C#.
- `npm run dist`: compila os auxiliares e gera `dist/Gemi Pets.exe`.

Os executáveis auxiliares são gerados e ignorados pelo Git. O pacote inclui os módulos do processo principal, os módulos da interface, o monitor compilado e a licença. O fluxo do GitHub Actions verifica e compila o Windows em cada push e pull request.

## Assinatura digital

O build local e o artefato padrão da verificação são **sem assinatura digital**; o SmartScreen pode alertar. Assinar exige um certificado de assinatura de código válido sob seu controle. Para usar um certificado compatível com electron-builder, configure `CSC_LINK` e `CSC_KEY_PASSWORD` no ambiente ou nos segredos do build antes de executar `npm run dist`. Não coloque certificados ou senhas no repositório. Nenhum certificado ou assinatura foi criado nesta revisão.

## Organização

O processo principal usa `lib/` para armazenamento, segurança, execução de ferramentas e log. `ai-providers.js` trata Gemini/OpenAI, `chat-policy.js` limita o contexto e `codex-runner.js` acompanha a CLI. A interface está separada em `core.js`, `sounds.js`, `skins.js`, `pets.js`, `games.js`, `chat.js`, `ui.js` e `renderer.js`. A geometria responsiva fica em `layout.js`, e a detecção de monitores em `lib/displays.js`. O estado compartilhado fica em `core.js`; `renderer.js` conecta os eventos e a animação.

Licença MIT; veja `LICENSE`.
