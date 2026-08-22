# 👀 discord2 — chat, voz e tela pra você e seus amigos

## O que mudou nesta versão

1. **Cores** — tema azul bem escuro + rosa choque, com logo de olhos (👀).
2. **Microfone opcional** — entrar na sala (chat) não pede mais permissão de
   nada. Só ao clicar em 📞 "entrar na chamada" o app pede o microfone — e se
   você negar ou não tiver microfone, a chamada continua funcionando mesmo
   assim (você só não vai falar, mas ouve e pode compartilhar tela).
3. **Chamada não conecta mais sozinha** — entrar na sala só ativa o chat de
   texto. Voz e tela são uma etapa separada, só começa quando alguém clica em
   📞.
4. **Correção do compartilhamento de tela** — o bug em que só um dos dois via
   a tela do outro (ou só ouvia quando os dois compartilhavam) era um erro
   clássico de WebRTC: só quem "iniciava" a conexão conseguia renegociar ao
   adicionar uma trilha nova. Troquei pela técnica de **negociação perfeita**
   (perfect negotiation), que funciona nos dois sentidos, não importa quem
   entrou primeiro na sala.
5. **Redução de ruído** — botão 🔉 na barra de controles, ligado por padrão.
6. **App desktop mais rápido** — o `.exe` agora abre direto
   `https://discord2-tmuf.onrender.com/` em vez de subir um servidor Node
   local. Abre bem mais rápido e funciona de qualquer rede, sem ngrok.

## Estrutura do projeto

- `server.js` — servidor (chat, presença, sala de voz, sinalização WebRTC).
  Roda no Render via `npm start`.
- `public/index.html` — toda a interface e lógica do cliente.
- `main.js` — janela do Electron, aponta para o site do Render.
- `build/icone.png` — ícone do app (👀).

## Como atualizar o site no Render

O Render está conectado ao GitHub (`setmeia76/discord2`) e faz deploy
automático a cada push. Para os amigos que usam o link direto no navegador
verem essas correções, você precisa subir os arquivos atualizados:

```
cd discord2          # a pasta com os arquivos atualizados
git add .
git commit -m "corrige compartilhamento de tela, chamada opt-in, novo tema"
git push
```

O Render detecta o push e refaz o deploy sozinho (leva 1–2 minutos).

## Como gerar o .exe você mesmo

```
npm install
npm run dist
```

O instalador sai em `dist/discord2 Setup 1.0.0.exe`. Como ele só abre uma
janela apontando para o Render, não precisa reconstruir o `.exe` toda vez que
mudar `server.js` ou `public/index.html` — só quando mudar algo em `main.js`
ou no ícone. As correções de tela/chamada valem assim que você fizer o `git
push` (o app carrega a versão nova automaticamente na próxima vez que abrir).

> No Linux, `npm run dist` (que gera .exe) precisa de `wine64` e `wine32`
> instalados (`sudo apt install wine64 wine32`). No Windows, roda direto.

## Testar localmente antes de subir

```
npm start
```
Abre em `http://localhost:3000`.

## Sobre a permissão de microfone no Windows

Na primeira vez que você clicar em 📞, o Windows pode mostrar um aviso de
permissão de microfone (isso é do sistema operacional, não do app — nenhum
programa consegue pular essa etapa). Se você recusar, o app continua
funcionando normalmente, só sem enviar seu áudio.

## Limitações conhecidas

- Sem TURN server: em redes bem restritas (algumas redes corporativas ou de
  faculdade) a conexão direta pode falhar. Funciona bem em casa. Se isso for
  um problema recorrente, dá pra adicionar um TURN gratuito (ex: metered.ca)
  — me avisa que eu configuro.
- Sem histórico de chat — as mensagens somem quando todo mundo sai da sala.
- Mesh P2P: cada pessoa se conecta diretamente com todas as outras, então
  funciona bem até uns 4–6 participantes ao mesmo tempo.
