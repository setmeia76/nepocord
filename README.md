# 👀 Nepocord

Aplicação de conversa em salas com chat em tempo real e chamadas de voz/compartilhamento de tela usando WebRTC. A interface web é servida pelo Express; Socket.IO cuida da presença, das mensagens e da sinalização. Há também um shell desktop opcional feito com Electron.

> **Status:** projeto em desenvolvimento. Antes de disponibilizar publicamente, teste com usuários e redes diferentes. O servidor atual não oferece persistência de mensagens nem autenticação de contas.

## Requisitos

- Node.js 20 ou superior (recomendado)
- npm
- Para compilar o aplicativo desktop: dependências de desenvolvimento instaladas e ferramentas suportadas pelo Electron Builder

## Executar localmente — versão web

```bash
npm install
npm start
```

Abra <http://localhost:3000> no navegador. Para desenvolvimento com reinicialização automática e janela Electron:

```bash
npm run dev
```

O comando `npm run dev` inicia o servidor e abre a janela desktop apontada para `http://localhost:3000`.

## Aplicativo desktop

O Electron está configurado para abrir a versão hospedada em `https://nepocord.onrender.com/` por padrão. Para apontá-lo para um servidor local, use:

```bash
# Windows PowerShell
$env:ELECTRON_APP_URL='http://localhost:3000'; npm run app

# macOS/Linux
ELECTRON_APP_URL=http://localhost:3000 npm run app
```

Para gerar um instalador, use o comando correspondente ao seu sistema:

```bash
npm run dist       # Windows
npm run dist:mac   # macOS
npm run dist:linux # Linux
```

A compilação de cada plataforma pode exigir que o processo seja executado no sistema operacional correspondente. Os instaladores gerados não devem ser commitados no repositório.

## Deploy no Render

O arquivo `render.yaml` define um serviço Node com `npm ci --omit=dev` e `npm start`. Importe o repositório no Render e confira o serviço e o domínio gerados. O Render define a variável `PORT` automaticamente.

### TURN opcional

Por padrão, a chamada usa a configuração ICE disponível no cliente; algumas redes exigem um servidor TURN. Para habilitar o endpoint `/turn-credentials`, configure no painel do serviço as variáveis `METERED_API_KEY` e `METERED_APP_NAME`. Use credenciais próprias e mantenha-as somente nas variáveis privadas do provedor — nunca as adicione ao código, ao README ou ao `.env.example`.

## Estrutura

- `server.js` — servidor HTTP, arquivos estáticos, Socket.IO e endpoint opcional de credenciais TURN.
- `public/index.html` — interface web.
- `public/app.js` — lógica de interface, chat e WebRTC.
- `public/style.css` — estilos.
- `main.js` — janela Electron.
- `build/icone.png` — ícone do aplicativo.
- `render.yaml` — configuração de deploy no Render.

## Limitações conhecidas

- As mensagens não são armazenadas em banco de dados; não há histórico persistente.
- As chamadas usam malha P2P, que pode ficar pesada com muitos participantes.
- Sem TURN configurado, algumas redes podem impedir conexões de voz/vídeo.
- Não há autenticação de contas nem salas privadas protegidas por senha. Os códigos de sala devem ser tratados como identificadores compartilháveis, não como um sistema completo de controle de acesso.
- Para uso público em larga escala, adicione autenticação, limites de abuso no servidor, observabilidade e políticas de privacidade.

## Segurança e contribuições

- Nunca envie `.env`, chaves de API, tokens ou credenciais ao GitHub.
- As mensagens são validadas no servidor e o nome do remetente é definido pela sessão conectada, não pelo conteúdo enviado em cada mensagem.
- Antes de abrir um pull request, verifique o código e teste o chat e as chamadas em mais de um navegador.

Sugestões e contribuições são bem-vindas por meio de Issues e Pull Requests.
