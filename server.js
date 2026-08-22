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

// sala -> lista de { socketId, nome }
const salas = {};

io.on('connection', (socket) => {
  let salaAtual = null;
  let nomeAtual = null;

  socket.on('entrar-sala', ({ sala, nome }) => {
    salaAtual = sala;
    nomeAtual = nome;
    socket.join(sala);

    if (!salas[sala]) salas[sala] = [];

    // avisa aos que já estão na sala que alguém novo chegou
    const outros = salas[sala].map(u => ({ id: u.socketId, nome: u.nome }));
    socket.emit('usuarios-na-sala', outros);

    salas[sala].push({ socketId: socket.id, nome });

    socket.to(sala).emit('novo-usuario', { id: socket.id, nome });
  });

  // Chat de texto
  socket.on('mensagem-chat', ({ sala, nome, texto }) => {
    io.to(sala).emit('mensagem-chat', { nome, texto, hora: Date.now() });
  });

  // Sinalização WebRTC (repassa para o destinatário específico)
  socket.on('sinal', ({ para, sinal }) => {
    io.to(para).emit('sinal', { de: socket.id, sinal });
  });

  socket.on('disconnect', () => {
    if (salaAtual && salas[salaAtual]) {
      salas[salaAtual] = salas[salaAtual].filter(u => u.socketId !== socket.id);
      socket.to(salaAtual).emit('usuario-saiu', { id: socket.id, nome: nomeAtual });
      if (salas[salaAtual].length === 0) delete salas[salaAtual];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
