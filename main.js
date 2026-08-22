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
  // Concede automaticamente microfone/tela dentro do próprio app (é local e
  // controlado por você, não precisa ficar perguntando toda vez).
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const permitidas = ['media', 'display-capture', 'mediaKeySystem'];
    callback(permitidas.includes(permission));
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
