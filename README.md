# 👀 nepocord





## Estrutura do projeto

- `server.js` — servidor (chat, presença, sala de voz, sinalização WebRTC).
  Roda no Render via `npm start`.
- `public/index.html` — toda a interface e lógica do cliente.
- `main.js` — janela do Electron, aponta para o site do Render.
- `build/icone.png` — ícone do app (👀).


## Limitações conhecidas

- Sem TURN server: em redes bem restritas (algumas redes corporativas ou de
  faculdade) a conexão direta pode falhar. Funciona bem em casa. Se isso for
  um problema recorrente, dá pra adicionar um TURN gratuito (ex: metered.ca)
  — me avisa que eu configuro.
- Sem histórico de chat — as mensagens somem quando todo mundo sai da sala.
- Mesh P2P: cada pessoa se conecta diretamente com todas as outras, então
  funciona bem até uns 4–6 participantes ao mesmo tempo.
