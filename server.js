const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

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
    salaAtual = sala;
    nomesPorSocket[socket.id] = nome;
    socket.join(sala);

    socket.emit('usuarios-na-sala', membrosDaSala(sala, socket.id));
    socket.to(sala).emit('novo-usuario', { id: socket.id, nome });
  });

  // Chat de texto (sempre ativo, independente da chamada)
  socket.on('mensagem-chat', ({ sala, nome, texto }) => {
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
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
