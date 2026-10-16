const electron = require('electron');

// Proteção caso alguém tente rodar "node main.js" diretamente
if (typeof electron === 'string' || !electron.app) {
  console.error('\n❌ [ERRO] O Electron não pode ser iniciado diretamente com "node main.js".');
  console.error('👉 Use "npm run dev", "npm run app" ou inicie pelo menu "Run and Debug" (F5) do VS Code/IDE.\n');
  process.exit(1);
}

const { app, BrowserWindow, Menu, session, desktopCapturer } = electron;
const path = require('path');

// Aponta direto para o app hospedado no Render — sem servidor local,
// sem ngrok, funciona de qualquer rede e abre bem mais rápido.
const URL_PRODUCAO = 'https://nepocord.onrender.com/';
const URL_APP = process.env.ELECTRON_APP_URL || URL_PRODUCAO;

let janelaPrincipal = null;

function criarJanela() {
  janelaPrincipal = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: '#060818',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icone.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  Menu.setApplicationMenu(null);

  // Em modo de desenvolvimento, permite abrir o DevTools com F12 ou Ctrl+Shift+I
  if (!app.isPackaged) {
    janelaPrincipal.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
        janelaPrincipal.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
  }

  janelaPrincipal.loadURL(URL_APP);

  janelaPrincipal.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.warn(`[Aviso] Falha ao carregar ${validatedURL}: ${errorDescription} (${errorCode})`);
    // Se for localhost (ex: servidor ainda iniciando), tenta reconectar
    if (validatedURL.includes('localhost') || validatedURL.includes('127.0.0.1')) {
      console.log('Tentando reconectar ao servidor local em 2 segundos...');
      setTimeout(() => {
        if (janelaPrincipal && !janelaPrincipal.isDestroyed()) {
          janelaPrincipal.loadURL(validatedURL);
        }
      }, 2000);
    }
  });

  janelaPrincipal.on('closed', () => {
    janelaPrincipal = null;
  });
}

app.whenReady().then(() => {
  // Concede automaticamente microfone/tela/tela-cheia dentro do próprio app
  // (é local e controlado por você, não precisa ficar perguntando toda vez).
  // "fullscreen" precisa estar nessa lista, senão o Electron NEGA silenciosamente
  // todo pedido de tela cheia feito pela página (por isso o botão ⛶ não funcionava).
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const permitidas = ['media', 'display-capture', 'mediaKeySystem', 'fullscreen'];
    callback(permitidas.includes(permission));
  });

  // Checagem síncrona de permissão (usada por algumas APIs, como
  // document.fullscreenEnabled) — sem isso, só o handler assíncrono acima
  // não é suficiente em todos os casos.
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    const permitidas = ['media', 'display-capture', 'mediaKeySystem', 'fullscreen'];
    return permitidas.includes(permission);
  });

  // O Electron não expõe getDisplayMedia como um navegador comum — aqui
  // escolhemos a tela principal automaticamente, sem pop-up de seleção.
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const fontes = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    callback({ video: fontes[0] });
  });

  criarJanela();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
