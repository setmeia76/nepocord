# 👀 Nepocord

App leve de chat em tempo real, chamadas de voz e compartilhamento de tela em alta definição para grupos de amigos.

Construído com **Node.js**, **Express**, **Socket.io**, **WebRTC** e **Electron**.

---

## 🚀 Funcionalidades

- 💬 **Chat em Tempo Real**: Mensagens instantâneas por sala com proteção contra spam.
- 📞 **Chamadas de Voz**: Conexão peer-to-peer (WebRTC) com redução de ruído, cancelamento de eco e ganho automático.
- 🖥️ **Compartilhamento de Tela**: Suporte a resoluções até 1080p e 60 FPS com controle de bitrate adaptativo.
- ⚙️ **Controle de Áudio Individual**: Controle de volume geral e individual por participante (clique direito no participante).
- 🖥️ **App Desktop (Electron) & Web**: Funciona direto no navegador ou como aplicativo desktop nativo para Windows/Mac/Linux.

---

## 📁 Estrutura do Projeto

- `server.js` — Servidor Node.js (salas, chat, sinalização WebRTC e rota para credenciais TURN).
- `public/` — Interface web do cliente:
  - `index.html` — Estrutura e marcação da interface.
  - `style.css` — Estilização, tema escuro e responsividade.
  - `app.js` — Lógica do cliente, conexão Socket.io, WebRTC e processamento de áudio.
- `main.js` — Ponto de entrada do aplicativo Desktop Electron.
- `build/icone.png` — Ícone do aplicativo.
- `render.yaml` — Configuração de infraestrutura e deploy contínuo no Render.
- `.vscode/launch.json` — Perfis prontos para depuração no VS Code.

---

## 🛠️ Como Executar Localmente

### Pré-requisitos
- [Node.js](https://nodejs.org/) versão 18 ou superior
- npm

### 1. Instalar as dependências
```bash
npm install
```

### 2. Rodar o servidor e o Electron em desenvolvimento
```bash
npm run dev
```
Isso iniciará o servidor local na porta `3000` (com nodemon) e abrirá a janela do Electron apontando para `http://localhost:3000`.

### 3. Rodar apenas o servidor web
```bash
npm start
```
Abra [http://localhost:3000](http://localhost:3000) no seu navegador.

### 4. Rodar apenas o app desktop
```bash
npm run app
```

---

## 📦 Gerar Executável Desktop (Build)

Para gerar o instalador do aplicativo desktop:

```bash
# Para Windows (.exe com instalador NSIS)
npm run dist

# Para macOS (.dmg)
npm run dist:mac

# Para Linux (.AppImage)
npm run dist:linux
```
Os arquivos gerados serão salvos na pasta `dist/` (que está inclusa no `.gitignore`).

---

## 🌐 Deploy na Nuvem (Render)

O repositório já inclui o arquivo `render.yaml` pronto para deploy no plano gratuito do Render.
- Comando de build: `npm ci --omit=dev`
- Comando de start: `npm start`
- Porta padrão: `3000` (ou definida automaticamente pela variável `PORT`)

### Variáveis de Ambiente (Opcionais)
Consulte o arquivo `.env.example` para mais detalhes:
- `PORT`: Porta do servidor HTTP.
- `METERED_API_KEY` & `METERED_APP_NAME`: Credenciais para servidor TURN (Metered), útil para conexões WebRTC em redes restritas.
- `ELECTRON_APP_URL`: URL remota ou local que o Electron deve carregar.

---

## 📝 Licença

Distribuído sob licença livre para fins educacionais e uso pessoal.
