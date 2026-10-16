const express = require('express');
const http = require('http');
const path = require('path');
const compression = require('compression');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// [PERF] Compressão gzip — reduz ~70% do tamanho do HTML/CSS/JS transferido.
// Especialmente importante no plano free do Render.
app.use(compression());

// __dirname garante que o caminho funciona tanto rodando com "node server.js"
// quanto dentro do app empacotado (.exe), onde a pasta atual é diferente.
app.use(express.static(path.join(__dirname, 'public')));

// Fornece as credenciais de um servidor TURN pro cliente. Sem isso, o app
// só tem STUN — que funciona bem na maioria das redes, mas falha em redes
// mais restritas (ex: Wi-Fi de escola/empresa com "isolamento de cliente",
// que bloqueia dispositivos de se conectarem direto entre si mesmo na
// mesma rede). O TURN retransmite o tráfego nesses casos.
//
// A chave vem de uma variável de ambiente (METERED_API_KEY) pra não expor
// nada sensível no código-fonte público. Sem a chave configurada, cai de
// volta pro STUN-only (comportamento atual, nada quebra).
app.get('/turn-credentials', async (req, res) => {
  const apiKey = process.env.METERED_API_KEY;
  const appName = process.env.METERED_APP_NAME;
  if (!apiKey || !appName) {
    return res.json({ configurado: false, iceServers: [] });
  }
  try {
    const resposta = await fetch(
      `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`
    );
    if (!resposta.ok) throw new Error('Metered respondeu ' + resposta.status);
    const iceServers = await resposta.json();
    res.json({ configurado: true, iceServers });
  } catch (e) {
    console.error('Falha ao buscar credenciais TURN:', e.message);
    res.json({ configurado: false, iceServers: [] });
  }
});

// socketId -> nome (válido durante toda a conexão)
const nomesPorSocket = {};

// [FIX] Rate-limiting simples por socket — evita spam de mensagens
const LIMITE_MENSAGENS_POR_SEGUNDO = 5;
const MAX_TAMANHO_MENSAGEM = 2000; // caracteres
const contadoresMensagens = {}; // socketId -> { count, resetAt }

function podeEnviarMensagem(socketId) {
  const agora = Date.now();
  let info = contadoresMensagens[socketId];
  if (!info || agora > info.resetAt) {
    info = { count: 0, resetAt: agora + 1000 };
    contadoresMensagens[socketId] = info;
  }
  if (info.count >= LIMITE_MENSAGENS_POR_SEGUNDO) return false;
  info.count++;
  return true;
}

function membrosDaSala(sala, excluirId) {
  const set = io.sockets.adapter.rooms.get(sala);
  if (!set) return [];
  return [...set]
    .filter((id) => id !== excluirId)
    .map((id) => ({ id, nome: nomesPorSocket[id] || 'convidado' }));
}

io.on('connection', (socket) => {
  let salaAtual = null;

  // Entrar na sala = só chat e presença. NÃO conecta voz/câmera/tela automaticamente.
  socket.on('entrar-sala', ({ sala, nome }) => {
    // [FIX] Validação básica dos inputs
    if (typeof sala !== 'string' || typeof nome !== 'string') return;
    sala = sala.trim().substring(0, 24);
    nome = nome.trim().substring(0, 20);
    if (!sala || !nome) return;

    salaAtual = sala;
    nomesPorSocket[socket.id] = nome;
    socket.join(sala);

    socket.emit('usuarios-na-sala', membrosDaSala(sala, socket.id));
    socket.to(sala).emit('novo-usuario', { id: socket.id, nome });
  });

  // Chat de texto (sempre ativo, independente da chamada)
  socket.on('mensagem-chat', ({ sala, nome, texto }) => {
    // [FIX] Validação de tamanho e rate-limiting
    if (typeof texto !== 'string') return;
    texto = texto.trim();
    if (!texto || texto.length > MAX_TAMANHO_MENSAGEM) return;
    if (!podeEnviarMensagem(socket.id)) return; // rate-limited

    io.to(sala).emit('mensagem-chat', { nome, texto, hora: Date.now() });
  });

  // ---- Canal de voz/tela: opt-in, o usuário precisa clicar para entrar ----
  socket.on('entrar-voz', ({ sala }) => {
    const salaVoz = sala + ':voz';
    const outros = membrosDaSala(salaVoz, socket.id);
    socket.join(salaVoz);
    socket.emit('usuarios-na-voz', outros);
    socket.to(salaVoz).emit('novo-usuario-voz', { id: socket.id, nome: nomesPorSocket[socket.id] });
  });

  socket.on('sair-voz', ({ sala }) => {
    const salaVoz = sala + ':voz';
    socket.to(salaVoz).emit('usuario-saiu-voz', { id: socket.id });
    socket.leave(salaVoz);
  });

  // Sinalização WebRTC (repassa para o destinatário específico)
  socket.on('sinal', ({ para, sinal }) => {
    io.to(para).emit('sinal', { de: socket.id, sinal });
  });

  socket.on('disconnect', () => {
    if (salaAtual) {
      socket.to(salaAtual).emit('usuario-saiu', { id: socket.id, nome: nomesPorSocket[socket.id] });
      socket.to(salaAtual + ':voz').emit('usuario-saiu-voz', { id: socket.id });
    }
    delete nomesPorSocket[socket.id];
    delete contadoresMensagens[socket.id];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
