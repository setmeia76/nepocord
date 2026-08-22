# 👀 nepocord



## Estrutura do projeto

- `server.js` — servidor (chat, presença, sala de voz, sinalização WebRTC).
  Roda no Render via `npm start`.
- `public/index.html` — toda a interface e lógica do cliente.
- `main.js` — janela do Electron, aponta para o site do Render.
- `build/icone.png` — ícone do app (👀).



## Como gerar o .exe você mesmo

```
npm install
npm run dist
```

O instalador sai em `dist/nepocord Setup 1.0.0.exe`. Como ele só abre uma
janela apontando para o Render, não precisa reconstruir o `.exe` toda vez que
mudar `server.js` ou `public/index.html` — só quando mudar algo em `main.js`
ou no ícone. As correções de tela/chamada valem assim que você fizer o `git
push` (o app carrega a versão nova automaticamente na próxima vez que abrir).

> No Linux, `npm run dist` (que gera .exe) precisa de `wine64` e `wine32`
> instalados (`sudo apt install wine64 wine32`). No Windows, roda direto.


## Limitações conhecidas

- Sem TURN server: em redes bem restritas (algumas redes corporativas ou de
  faculdade) a conexão direta pode falhar. Funciona bem em casa. Se isso for

- Sem histórico de chat — as mensagens somem quando todo mundo sai da sala.
- Mesh P2P: cada pessoa se conecta diretamente com todas as outras, então
  funciona bem até uns 4–6 participantes ao mesmo tempo.
