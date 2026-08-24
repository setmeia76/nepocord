const { app, BrowserWindow, Menu, session, desktopCapturer } = require('electron');
const path = require('path');

// Aponta direto para o app hospedado no Render — sem servidor local,
// sem ngrok, funciona de qualquer rede e abre bem mais rápido.
const URL_PRODUCAO = 'https://discord2-tmuf.onrender.com/';
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
  janelaPrincipal.loadURL(URL_APP);

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
