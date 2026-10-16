(() => {
  const socket = io();
  carregarCredenciaisTurn(); // busca em paralelo, sem atrasar o resto do carregamento

  // ---------- Estado ----------
  let meuNome = '';
  let minhaSala = '';
  let emChamada = false;
  let micAtivo = true;              // [FIX] movido para cá — antes era declarado lá embaixo e causava referência frágil
  let streamMic = null;             // MediaStream do microfone (só existe durante a chamada)
  let streamTela = null;            // MediaStream da tela compartilhada (se ativo)
  let reducaoRuidoAtiva = true;
  let cancelamentoEcoAtivo = true;
  let agcAtivo = true;
  let volumeGeralAtual = 1;          // 0 a 3 → 0% a 300% (volume geral das vozes recebidas)
  const volumesIndividuais = {};     // socketId -> ganho individual (0 a 3), some com o volume geral
  const conexoes = {};        // socketId -> { pc, polite, makingOffer, ignoreOffer }
  const streamsRemotos = {};  // socketId -> MediaStream combinada recebida
  const nomesRemotos = {};    // socketId -> nome (conhecido desde a entrada no chat)
  const participantesNaVoz = {}; // socketId (ou 'local') -> { nome, local }

  let audioCtx = null;
  let masterGain = null;
  const nosAudioRemoto = {};  // socketId -> { fonte, ganho, analisador, dataArray }

  let dispositivoMicPreferido = null;
  let dispositivoSaidaPreferido = null;

  // [FIX] Detecção de fala agora é controlada — só roda durante a chamada, a ~15fps
  let intervalFala = null;
  let estado_qualidadeInterval = null;

  // Começa só com STUN (funciona na maioria das redes). Se o servidor tiver
  // um TURN configurado, essas credenciais são carregadas por cima antes de
  // entrar na chamada — TURN é o que salva a conexão em redes mais
  // restritas (ex: Wi-Fi de escola/empresa com isolamento de cliente).
  const configIce = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  // [QUALIDADE] Mapa de bitrate por preset — impede que o WebRTC abaixe a
  // qualidade sozinho (congestion control). O valor é o teto que o encoder
  // pode usar; na prática ele se estabiliza perto disso.
  const BITRATE_POR_QUALIDADE = {
    '1080@60': 6_000_000,   // 6 Mbps — 1080p suave/jogos
    '1080@30': 4_000_000,   // 4 Mbps — 1080p padrão
    '720@30':  2_500_000,   // 2.5 Mbps — 720p balanço
    '720@24':  2_000_000,   // 2 Mbps — 720p filme
    '480@15':    800_000    // 800 kbps — economia de rede
  };

  // [QUALIDADE] Aplica o bitrate máximo no sender de vídeo de cada peer.
  // Isso TRAVA a qualidade: o encoder não vai mais oscilar/cair.
  async function travarQualidadeVideo(pc) {
    const qualidade = selectQualidadeVideo.value;
    const maxBitrate = BITRATE_POR_QUALIDADE[qualidade] || 4_000_000;
    const fps = parseInt(qualidade.split('@')[1], 10) || 30;

    for (const sender of pc.getSenders()) {
      if (!sender.track || sender.track.kind !== 'video') continue;
      try {
        const params = sender.getParameters();
        // Garante que existe pelo menos uma encoding
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = maxBitrate;
        params.encodings[0].maxFramerate = fps;
        // Prioriza manter resolução — se a rede apertar, baixa o FPS primeiro
        params.degradationPreference = 'maintain-resolution';
        await sender.setParameters(params);
      } catch (e) {
        console.warn('[Qualidade] não foi possível travar bitrate do sender:', e);
      }
    }
  }

  async function carregarCredenciaisTurn() {
    try {
      const resposta = await fetch('/turn-credentials');
      const dados = await resposta.json();
      if (dados.configurado && Array.isArray(dados.iceServers) && dados.iceServers.length) {
        configIce.iceServers = [...configIce.iceServers, ...dados.iceServers];
        console.log('TURN carregado — conexão deve funcionar mesmo em redes mais restritas.');
      }
    } catch (e) {
      // Sem TURN configurado ou servidor indisponível — segue só com STUN,
      // que já é o comportamento de antes.
    }
  }

  // ---------- Elementos ----------
  const telaEntrada = document.getElementById('tela-entrada');
  const app = document.getElementById('app');
  const inputNome = document.getElementById('input-nome');
  const inputSala = document.getElementById('input-sala');
  const btnEntrar = document.getElementById('btn-entrar');
  const erroEntrada = document.getElementById('erro-entrada');
  const rotuloSala = document.getElementById('rotulo-sala');
  const contagem = document.getElementById('contagem');
  const painelVideo = document.getElementById('painel-video');
  const mensagens = document.getElementById('mensagens');
  const formChat = document.getElementById('form-chat');
  const inputChat = document.getElementById('input-chat');
  const btnChamada = document.getElementById('btn-chamada');
  const btnMic = document.getElementById('btn-mic');
  const btnTela = document.getElementById('btn-tela');
  const btnRuido = document.getElementById('btn-ruido');
  const btnSair = document.getElementById('btn-sair');

  const btnConfig = document.getElementById('btn-config');
  const painelConfig = document.getElementById('painel-config');
  const chkRuido = document.getElementById('chk-ruido');
  const chkEco = document.getElementById('chk-eco');
  const chkAgc = document.getElementById('chk-agc');
  const selectQualidadeVideo = document.getElementById('select-qualidade-video');
  const selectQualidadeAudio = document.getElementById('select-qualidade-audio');
  const sliderVolumeGeral = document.getElementById('slider-volume-geral');
  const valorVolumeGeral = document.getElementById('valor-volume-geral');
  const selectMicrofone = document.getElementById('select-microfone');
  const selectSaida = document.getElementById('select-saida');
  const notaSaida = document.getElementById('nota-saida');

  const barraParticipantes = document.getElementById('barra-participantes');

  const menuContexto = document.getElementById('menu-contexto-usuario');
  const menuContextoNome = document.getElementById('menu-contexto-nome');
  const menuContextoValor = document.getElementById('menu-contexto-valor');
  const menuContextoSlider = document.getElementById('menu-contexto-slider');
  const menuContextoRedefinir = document.getElementById('menu-contexto-redefinir');

  // ---------- Entrada na sala (só chat, sem pedir mic/câmera) ----------
  btnEntrar.addEventListener('click', entrarNaSala);
  inputSala.addEventListener('keydown', e => { if (e.key === 'Enter') entrarNaSala(); });

  function entrarNaSala() {
    const nome = inputNome.value.trim();
    const sala = inputSala.value.trim().toLowerCase().replace(/\s+/g, '-');
    if (!nome || !sala) {
      erroEntrada.textContent = 'preencha seu nome e o código da sala.';
      return;
    }

    meuNome = nome;
    minhaSala = sala;

    telaEntrada.style.display = 'none';
    app.style.display = 'flex';
    rotuloSala.textContent = sala;

    socket.emit('entrar-sala', { sala, nome });
  }

  // ---------- Áudio: contexto compartilhado + volume geral ----------
  function garantirAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = volumeGeralAtual;
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // Toda voz recebida passa por aqui — inclusive de quem não está
  // compartilhando tela. No app original só existia reprodução de áudio
  // quando havia um quadro de vídeo, então quem só falava (sem tela) não
  // era ouvido por ninguém. Centralizar isso também é o que permite o
  // volume geral e o volume individual por pessoa.
  function configurarAudioRemoto(id, trilhaAudio) {
    garantirAudioContext();
    pararAudioRemoto(id);
    const streamAudio = new MediaStream([trilhaAudio]);

    // Em alguns navegadores/Electron, uma trilha de áudio WebRTC só é
    // decodificada de forma confiável quando também está "tocando" em algum
    // elemento HTML — usar só o Web Audio API (createMediaStreamSource) sem
    // nenhum elemento pode deixar a trilha muda. Esse <audio> escondido e
    // mudo mantém o decodificador sempre ativo.
    const elementoAudio = new Audio();
    elementoAudio.srcObject = streamAudio;
    elementoAudio.muted = true;
    elementoAudio.autoplay = true;
    elementoAudio.style.display = 'none';
    document.body.appendChild(elementoAudio);
    elementoAudio.play().catch(() => {});

    const fonte = audioCtx.createMediaStreamSource(streamAudio);
    const ganho = audioCtx.createGain();
    ganho.gain.value = volumesIndividuais[id] ?? 1;
    const analisador = audioCtx.createAnalyser();
    analisador.fftSize = 512;
    fonte.connect(ganho);
    ganho.connect(masterGain);
    ganho.connect(analisador);
    nosAudioRemoto[id] = { fonte, ganho, analisador, dataArray: new Uint8Array(analisador.frequencyBinCount), elementoAudio };
  }

  function pararAudioRemoto(id) {
    const n = nosAudioRemoto[id];
    if (!n) return;
    try {
      n.fonte.disconnect();
      if (n.ganho) n.ganho.disconnect();
      n.analisador.disconnect();
      if (n.elementoAudio) { n.elementoAudio.pause(); n.elementoAudio.srcObject = null; n.elementoAudio.remove(); }
    } catch (e) {}
    delete nosAudioRemoto[id];
  }

  // Analisa (sem tocar de volta) o SEU PRÓPRIO microfone, só pra acender o
  // anel de "falando" na sua própria pill.
  function configurarAnaliseLocal(trilhaAudio) {
    garantirAudioContext();
    pararAudioRemoto('local');
    const streamAudio = new MediaStream([trilhaAudio]);
    const fonte = audioCtx.createMediaStreamSource(streamAudio);
    const analisador = audioCtx.createAnalyser();
    analisador.fftSize = 512;
    fonte.connect(analisador); // não conecta no masterGain/destino — não toca de volta pra você
    nosAudioRemoto['local'] = { fonte, ganho: null, analisador, dataArray: new Uint8Array(analisador.frequencyBinCount) };
  }

  function definirVolumeIndividual(id, valor) {
    volumesIndividuais[id] = valor;
    if (nosAudioRemoto[id]) nosAudioRemoto[id].ganho.gain.value = valor;
  }

  // [FIX] Anel rosa na pessoa que está falando — agora roda a ~15fps com
  // setInterval em vez de requestAnimationFrame a 60fps, e SÓ roda durante
  // a chamada em vez de infinitamente desde o carregamento da página.
  function loopDeteccaoDeFala() {
    Object.entries(nosAudioRemoto).forEach(([id, n]) => {
      n.analisador.getByteTimeDomainData(n.dataArray);
      let soma = 0;
      for (let i = 0; i < n.dataArray.length; i++) {
        const v = (n.dataArray[i] - 128) / 128;
        soma += v * v;
      }
      const rms = Math.sqrt(soma / n.dataArray.length);
      const pill = document.getElementById('pill-' + id);
      if (pill) pill.classList.toggle('falando', rms > 0.06);
    });
  }

  function iniciarDeteccaoDeFala() {
    if (intervalFala) return;
    intervalFala = setInterval(loopDeteccaoDeFala, 66); // ~15fps — suficiente pro indicador visual
  }

  function pararDeteccaoDeFala() {
    if (intervalFala) { clearInterval(intervalFala); intervalFala = null; }
    // Remove classe "falando" de todas as pills ao parar
    document.querySelectorAll('.pill-participante.falando').forEach(p => p.classList.remove('falando'));
  }

  // ---------- Painel de configurações (⚙️ no canto superior direito) ----------
  btnConfig.addEventListener('click', () => {
    const abrindo = !painelConfig.classList.contains('aberto');
    painelConfig.classList.toggle('aberto', abrindo);
    btnConfig.classList.toggle('aberto', abrindo);
    if (abrindo) popularDispositivos();
  });

  // ---------- Botão 💬 (só existe no celular): esconde o chat pra sobrar
  // mais espaço de tela pro vídeo/tela compartilhada ----------
  const btnChatMobile = document.getElementById('btn-chat-mobile');
  btnChatMobile.addEventListener('click', () => {
    const escondendo = !app.classList.contains('chat-fechado');
    app.classList.toggle('chat-fechado', escondendo);
    btnChatMobile.classList.toggle('ativo', !escondendo);
    btnChatMobile.textContent = escondendo ? '🖥️' : '💬';
    btnChatMobile.title = escondendo ? 'mostrar chat' : 'esconder chat';
  });

  document.addEventListener('click', (e) => {
    if (!painelConfig.classList.contains('aberto')) return;
    if (painelConfig.contains(e.target) || e.target === btnConfig) return;
    painelConfig.classList.remove('aberto');
    btnConfig.classList.remove('aberto');
  });

  selectQualidadeAudio.addEventListener('change', async () => {
    const modoMusica = selectQualidadeAudio.value === 'musica';
    chkRuido.disabled = modoMusica;
    chkEco.disabled = modoMusica;
    chkAgc.disabled = modoMusica;
    
    if (streamMic) {
      const constraintsAudio = modoMusica ? {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 48000,
        channelCount: 2
      } : {
        echoCancellation: cancelamentoEcoAtivo,
        noiseSuppression: reducaoRuidoAtiva,
        autoGainControl: agcAtivo
      };
      
      try { await streamMic.getAudioTracks()[0].applyConstraints(constraintsAudio); }
      catch (e) { console.warn('não foi possível alternar qualidade de áudio', e); }
    }
  });

  selectQualidadeVideo.addEventListener('change', async () => {
    if (streamTela) {
      const valVideo = selectQualidadeVideo.value;
      const [res, fpsStr] = valVideo.split('@');
      const height = res === '1080' ? 1080 : res === '720' ? 720 : 480;
      const width = res === '1080' ? 1920 : res === '720' ? 1280 : 854;
      const fps = parseInt(fpsStr, 10);
      const track = streamTela.getVideoTracks()[0];
      if (track && track.applyConstraints) {
        try {
          await track.applyConstraints({
            width: { ideal: width, max: width },
            height: { ideal: height, max: height },
            frameRate: { ideal: fps, max: fps }
          });
        } catch (e) {
          console.warn('[Qualidade] não foi possível aplicar novas constraints:', e);
        }
      }
      Object.values(conexoes).forEach(e => travarQualidadeVideo(e.pc));
    }
  });

  chkRuido.addEventListener('change', async () => {
    reducaoRuidoAtiva = chkRuido.checked;
    btnRuido.classList.toggle('ativo', reducaoRuidoAtiva);
    btnRuido.textContent = reducaoRuidoAtiva ? '🔉' : '🔊';
    if (streamMic) {
      try { await streamMic.getAudioTracks()[0].applyConstraints({ noiseSuppression: reducaoRuidoAtiva }); }
      catch (e) { console.warn('não foi possível alternar a redução de ruído', e); }
    }
  });

  chkEco.addEventListener('change', async () => {
    cancelamentoEcoAtivo = chkEco.checked;
    if (streamMic) {
      try { await streamMic.getAudioTracks()[0].applyConstraints({ echoCancellation: cancelamentoEcoAtivo }); }
      catch (e) { console.warn('não foi possível alternar o cancelamento de eco', e); }
    }
  });

  chkAgc.addEventListener('change', async () => {
    agcAtivo = chkAgc.checked;
    if (streamMic) {
      try { await streamMic.getAudioTracks()[0].applyConstraints({ autoGainControl: agcAtivo }); }
      catch (e) { console.warn('não foi possível alternar o ganho automático', e); }
    }
  });

  sliderVolumeGeral.addEventListener('input', () => {
    volumeGeralAtual = Number(sliderVolumeGeral.value) / 100;
    valorVolumeGeral.textContent = sliderVolumeGeral.value + '%';
    if (masterGain) masterGain.gain.value = volumeGeralAtual;
  });

  selectMicrofone.addEventListener('change', () => trocarMicrofone(selectMicrofone.value));
  selectSaida.addEventListener('change', () => trocarSaidaDeAudio(selectSaida.value));

  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => {
      if (painelConfig.classList.contains('aberto')) popularDispositivos();
    });
  }

  async function popularDispositivos() {
    try {
      const dispositivos = await navigator.mediaDevices.enumerateDevices();
      const entradas = dispositivos.filter(d => d.kind === 'audioinput');
      const saidas = dispositivos.filter(d => d.kind === 'audiooutput');

      selectMicrofone.innerHTML = '';
      if (entradas.length === 0) {
        selectMicrofone.innerHTML = '<option value="">nenhum microfone encontrado</option>';
      } else {
        entradas.forEach((d, i) => {
          const opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.textContent = d.label || ('microfone ' + (i + 1));
          selectMicrofone.appendChild(opt);
        });
        if (dispositivoMicPreferido) selectMicrofone.value = dispositivoMicPreferido;
      }

      const suportaSaida = typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;
      selectSaida.disabled = !suportaSaida;
      if (!suportaSaida) {
        selectSaida.innerHTML = '<option value="">indisponível neste app</option>';
        notaSaida.textContent = 'este navegador/Electron não permite trocar a saída de áudio.';
      } else if (saidas.length === 0) {
        selectSaida.innerHTML = '<option value="">nenhum dispositivo encontrado</option>';
        notaSaida.textContent = '';
      } else {
        selectSaida.innerHTML = '';
        saidas.forEach((d, i) => {
          const opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.textContent = d.label || ('saída ' + (i + 1));
          selectSaida.appendChild(opt);
        });
        if (dispositivoSaidaPreferido) selectSaida.value = dispositivoSaidaPreferido;
        notaSaida.textContent = '';
      }
    } catch (e) {
      console.warn('não foi possível listar os dispositivos de áudio', e);
    }
  }

  async function trocarMicrofone(deviceId) {
    dispositivoMicPreferido = deviceId || null;
    if (!emChamada || !deviceId) return;
    try {
      const novoStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: cancelamentoEcoAtivo,
          noiseSuppression: reducaoRuidoAtiva,
          autoGainControl: agcAtivo
        },
        video: false
      });
      const novaTrilha = novoStream.getAudioTracks()[0];
      novaTrilha.enabled = micAtivo;

      Object.values(conexoes).forEach(estado => {
        const remetente = estado.pc.getSenders().find(s => s.track && s.track.kind === 'audio');
        if (remetente) remetente.replaceTrack(novaTrilha);
      });

      if (streamMic) streamMic.getTracks().forEach(t => t.stop());
      streamMic = novoStream;
      configurarAnaliseLocal(novaTrilha);
      atualizarUiChamada();
    } catch (e) {
      console.warn('não foi possível trocar de microfone', e);
    }
  }

  async function trocarSaidaDeAudio(deviceId) {
    dispositivoSaidaPreferido = deviceId || null;
    if (!deviceId || !audioCtx || typeof audioCtx.setSinkId !== 'function') return;
    try { await audioCtx.setSinkId(deviceId); }
    catch (e) { console.warn('não foi possível trocar a saída de áudio', e); }
  }

  // ---------- Participantes na chamada (barra + menu de contexto) ----------
  // [FIX] Debounce: evita recriar TODOS os elementos DOM a cada tick do slider de volume
  let timerRenderParticipantes = null;

  function adicionarParticipanteNaVoz(id, nome, local) {
    participantesNaVoz[id] = { nome, local: !!local };
    renderizarParticipantes();
  }

  function removerParticipanteDaVoz(id) {
    delete participantesNaVoz[id];
    delete volumesIndividuais[id];
    renderizarParticipantes();
  }

  function renderizarParticipantesDebounced() {
    if (timerRenderParticipantes) clearTimeout(timerRenderParticipantes);
    timerRenderParticipantes = setTimeout(renderizarParticipantes, 50);
  }

  function renderizarParticipantes() {
    const ids = Object.keys(participantesNaVoz);
    barraParticipantes.classList.toggle('visivel', ids.length > 0);
    barraParticipantes.innerHTML = '';
    ids.forEach(id => {
      const p = participantesNaVoz[id];
      const pill = document.createElement('div');
      pill.className = 'pill-participante' + (p.local ? '' : ' remoto');
      pill.id = 'pill-' + id;
      const inicial = (p.nome || '?').trim().charAt(0).toUpperCase();
      const volumePct = Math.round((volumesIndividuais[id] ?? 1) * 100);
      pill.innerHTML =
        '<span class="avatar-mini">' + escapeHtml(inicial) + '</span>' +
        '<span>' + escapeHtml(p.nome) + '</span>' +
        (p.local
          ? '<span class="tag-voce">você</span>'
          : (volumePct !== 100 ? '<span class="icone-volume-custom">' + volumePct + '%</span>' : ''));
      if (!p.local) {
        pill.title = 'clique com o botão direito para ajustar o volume';
        pill.addEventListener('contextmenu', (e) => abrirMenuContexto(e, id, p.nome));
      }
      barraParticipantes.appendChild(pill);
    });
  }

  let idContextoAtual = null;

  function abrirMenuContexto(evento, id, nome) {
    evento.preventDefault();
    idContextoAtual = id;
    menuContextoNome.textContent = nome;
    const valorAtual = Math.round((volumesIndividuais[id] ?? 1) * 100);
    menuContextoSlider.value = valorAtual;
    menuContextoValor.textContent = valorAtual + '%';

    menuContexto.classList.add('aberto');
    const margem = 10;
    let x = evento.clientX;
    let y = evento.clientY;
    const retangulo = menuContexto.getBoundingClientRect();
    if (x + retangulo.width > window.innerWidth - margem) x = window.innerWidth - retangulo.width - margem;
    if (y + retangulo.height > window.innerHeight - margem) y = window.innerHeight - retangulo.height - margem;
    menuContexto.style.left = x + 'px';
    menuContexto.style.top = y + 'px';
  }

  function fecharMenuContexto() {
    menuContexto.classList.remove('aberto');
    idContextoAtual = null;
  }

  menuContextoSlider.addEventListener('input', () => {
    if (!idContextoAtual) return;
    const valor = Number(menuContextoSlider.value);
    menuContextoValor.textContent = valor + '%';
    definirVolumeIndividual(idContextoAtual, valor / 100);
    renderizarParticipantesDebounced(); // [FIX] debounced em vez de direto
  });

  menuContextoRedefinir.addEventListener('click', () => {
    if (!idContextoAtual) return;
    menuContextoSlider.value = 100;
    menuContextoValor.textContent = '100%';
    definirVolumeIndividual(idContextoAtual, 1);
    renderizarParticipantes();
  });

  document.addEventListener('click', (e) => {
    if (menuContexto.classList.contains('aberto') && !menuContexto.contains(e.target)) fecharMenuContexto();
  });
  document.addEventListener('contextmenu', (e) => {
    if (menuContexto.classList.contains('aberto') && !e.target.closest('.pill-participante.remoto')) fecharMenuContexto();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    fecharMenuContexto();
    painelConfig.classList.remove('aberto');
    btnConfig.classList.remove('aberto');
  });

  // ---------- Quadros de vídeo (tela compartilhada) ----------
  function criarOuAtualizarQuadro(id, nome, stream) {
    let quadro = document.getElementById('quadro-' + id);
    if (!quadro) {
      quadro = document.createElement('div');
      quadro.className = 'quadro-video';
      quadro.id = 'quadro-' + id;

      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.disablePictureInPicture = true;
      // O áudio de todo mundo é tocado pelo grafo de Web Audio
      // (configurarAudioRemoto), então o <video> fica sempre mudo — senão
      // o som tocaria duas vezes.
      video.muted = true;
      quadro.appendChild(video);

      const rot = document.createElement('div');
      rot.className = 'rotulo';
      quadro.appendChild(rot);

      const controles = document.createElement('div');
      controles.className = 'controles-quadro';

      const btnTelaCheia = document.createElement('button');
      btnTelaCheia.className = 'botao-quadro';
      btnTelaCheia.title = 'tela cheia (ou dê 2 cliques na tela)';
      btnTelaCheia.textContent = '⛶';
      btnTelaCheia.addEventListener('click', () => alternarTelaCheia(quadro, video));
      video.addEventListener('dblclick', () => alternarTelaCheia(quadro, video));

      const btnOcultar = document.createElement('button');
      btnOcultar.className = 'botao-quadro botao-ocultar';
      btnOcultar.title = 'mutar tela (ocultar localmente)';
      btnOcultar.textContent = '🙈';
      btnOcultar.addEventListener('click', () => alternarTelaOculta(id));

      controles.appendChild(btnTelaCheia);
      controles.appendChild(btnOcultar);
      quadro.appendChild(controles);

      const aviso = document.createElement('div');
      aviso.className = 'aviso-oculta';
      aviso.innerHTML = '🙈<br>tela mutada<br><small>clique para mostrar de novo</small>';
      aviso.addEventListener('click', () => alternarTelaOculta(id));
      quadro.appendChild(aviso);

      painelVideo.appendChild(quadro);
    }

    quadro._streamOriginal = stream;
    const video = quadro.querySelector('video');
    if (!quadro.classList.contains('tela-oculta-local') && video.srcObject !== stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    }
    quadro.querySelector('.rotulo').textContent = nome + ' · tela';
  }

  // Oculta/mostra a tela compartilhada de alguém só do seu lado
  function alternarTelaOculta(id) {
    const quadro = document.getElementById('quadro-' + id);
    if (!quadro) return;
    const video = quadro.querySelector('video');
    const ocultando = !quadro.classList.contains('tela-oculta-local');
    quadro.classList.toggle('tela-oculta-local', ocultando);
    const botao = quadro.querySelector('.botao-ocultar');
    if (ocultando) {
      video.srcObject = null;
      if (botao) { botao.textContent = '🙉'; botao.title = 'desmutar tela'; }
    } else {
      video.srcObject = quadro._streamOriginal || null;
      video.play().catch(() => {});
      if (botao) { botao.textContent = '🙈'; botao.title = 'mutar tela (ocultar localmente)'; }
    }
  }

  function removerQuadro(id) {
    const quadro = document.getElementById('quadro-' + id);
    if (quadro) quadro.remove();
  }

  // Tela cheia no QUADRO inteiro (não só no <video>)
  function alternarTelaCheia(quadro, video) {
    if (document.fullscreenElement === quadro || document.fullscreenElement === video) {
      const sair = document.exitFullscreen || document.webkitExitFullscreen;
      if (sair) sair.call(document);
      return;
    }
    const pedir = quadro.requestFullscreen
      ? quadro.requestFullscreen.bind(quadro)
      : quadro.webkitRequestFullscreen
        ? quadro.webkitRequestFullscreen.bind(quadro)
        : null;
    if (!pedir) { console.warn('tela cheia não suportada neste navegador'); return; }

    Promise.resolve(pedir()).catch(() => {
      const pedirVideo = video.requestFullscreen
        ? video.requestFullscreen.bind(video)
        : video.webkitRequestFullscreen
          ? video.webkitRequestFullscreen.bind(video)
          : null;
      if (pedirVideo) Promise.resolve(pedirVideo()).catch(e => console.warn('tela cheia recusada', e));
    });
  }

  // ---------- WebRTC: negociação perfeita (funciona nos dois sentidos) ----------
  function adicionarMinhasTrilhas(pc, estado) {
    if (estado.tracksAdicionadas) return;
    estado.tracksAdicionadas = true;
    if (streamMic) streamMic.getTracks().forEach(t => pc.addTrack(t, streamMic));
    else pc.addTransceiver('audio', { direction: 'recvonly' });
    if (streamTela) {
      streamTela.getTracks().forEach(t => pc.addTrack(t, streamTela));
      // [QUALIDADE] Trava o bitrate quando um novo peer se conecta e já existe tela sendo compartilhada
      setTimeout(() => travarQualidadeVideo(pc), 500);
    }
  }

  function criarConexao(idRemoto, nomeRemoto, souIniciador) {
    const pc = new RTCPeerConnection(configIce);
    const estado = { pc, polite: !souIniciador, makingOffer: false, ignoreOffer: false, tracksAdicionadas: false };
    conexoes[idRemoto] = estado;
    nomesRemotos[idRemoto] = nomeRemoto;

    if (souIniciador) adicionarMinhasTrilhas(pc, estado);

    pc.onicecandidate = (evento) => {
      if (evento.candidate) {
        socket.emit('sinal', { para: idRemoto, sinal: { tipo: 'ice', candidate: evento.candidate } });
      }
    };

    pc.ontrack = (evento) => {
      let ms = streamsRemotos[idRemoto];
      if (!ms) { ms = new MediaStream(); streamsRemotos[idRemoto] = ms; }
      ms.addTrack(evento.track);

      if (evento.track.kind === 'audio') configurarAudioRemoto(idRemoto, evento.track);

      evento.track.onended = () => {
        ms.removeTrack(evento.track);
        if (evento.track.kind === 'audio') pararAudioRemoto(idRemoto);
        if (ms.getVideoTracks().length === 0) removerQuadro(idRemoto);
      };
      if (ms.getVideoTracks().length > 0) criarOuAtualizarQuadro(idRemoto, nomeRemoto, ms);
    };

    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) removerQuadro(idRemoto);
    };

    pc.onnegotiationneeded = async () => {
      try {
        estado.makingOffer = true;
        await pc.setLocalDescription();
        socket.emit('sinal', { para: idRemoto, sinal: { tipo: 'oferta', sdp: pc.localDescription } });
      } catch (e) {
        console.error(e);
      } finally {
        estado.makingOffer = false;
      }
    };

    return estado;
  }

  function fecharConexao(id) {
    if (conexoes[id]) { conexoes[id].pc.close(); delete conexoes[id]; }
    delete streamsRemotos[id];
    pararAudioRemoto(id);
    removerParticipanteDaVoz(id);
    removerQuadro(id);
  }

  // ---------- Eventos de sinalização (Socket.IO) ----------
  socket.on('usuarios-na-sala', (usuarios) => {
    usuarios.forEach(u => { nomesRemotos[u.id] = u.nome; });
    atualizarContagem(usuarios.length + 1);
  });

  socket.on('novo-usuario', ({ id, nome }) => {
    nomesRemotos[id] = nome;
    adicionarMensagemSistema(nome + ' entrou na sala.');
    atualizarContagem(Object.keys(nomesRemotos).length + 1);
  });

  socket.on('usuario-saiu', ({ id, nome }) => {
    fecharConexao(id);
    delete nomesRemotos[id];
    adicionarMensagemSistema((nome || 'alguém') + ' saiu da sala.');
    atualizarContagem(Object.keys(nomesRemotos).length + 1);
  });

  // ---- Canal de voz/tela (só entra quem clicou em 📞) ----
  socket.on('usuarios-na-voz', (usuarios) => {
    usuarios.forEach(u => {
      criarConexao(u.id, u.nome, true);
      adicionarParticipanteNaVoz(u.id, u.nome, false);
    });
  });

  socket.on('novo-usuario-voz', ({ id, nome }) => {
    if (!emChamada) return;
    criarConexao(id, nome, false);
    adicionarParticipanteNaVoz(id, nome, false);
  });

  socket.on('usuario-saiu-voz', ({ id }) => {
    fecharConexao(id);
  });

  socket.on('sinal', async ({ de, sinal }) => {
    let estado = conexoes[de];
    if (!estado) estado = criarConexao(de, nomesRemotos[de] || 'convidado', false);
    const { pc, polite } = estado;

    if (sinal.tipo === 'oferta') {
      const colisao = estado.makingOffer || pc.signalingState !== 'stable';
      estado.ignoreOffer = !polite && colisao;
      if (estado.ignoreOffer) return;

      if (colisao) {
        await Promise.all([
          pc.setLocalDescription({ type: 'rollback' }),
          pc.setRemoteDescription(new RTCSessionDescription(sinal.sdp))
        ]);
      } else {
        await pc.setRemoteDescription(new RTCSessionDescription(sinal.sdp));
      }

      adicionarMinhasTrilhas(pc, estado);

      const resposta = await pc.createAnswer();
      await pc.setLocalDescription(resposta);
      socket.emit('sinal', { para: de, sinal: { tipo: 'resposta', sdp: pc.localDescription } });
    } else if (sinal.tipo === 'resposta') {
      await pc.setRemoteDescription(new RTCSessionDescription(sinal.sdp));
    } else if (sinal.tipo === 'ice') {
      try { await pc.addIceCandidate(sinal.candidate); }
      catch (e) { if (!estado.ignoreOffer) console.error(e); }
    }
  });

  function atualizarContagem(n) {
    contagem.textContent = n + (n === 1 ? ' pessoa na sala' : ' pessoas na sala');
  }

  // ---------- Chat ----------
  formChat.addEventListener('submit', (e) => {
    e.preventDefault();
    const texto = inputChat.value.trim();
    if (!texto) return;
    socket.emit('mensagem-chat', { sala: minhaSala, nome: meuNome, texto });
    inputChat.value = '';
  });

  socket.on('mensagem-chat', ({ nome, texto, hora }) => {
    const div = document.createElement('div');
    div.className = 'msg';
    const h = new Date(hora);
    const horaTexto = h.getHours().toString().padStart(2, '0') + ':' + h.getMinutes().toString().padStart(2, '0');
    div.innerHTML = `<span class="nome">${escapeHtml(nome)}</span>${escapeHtml(texto)}<span class="hora">${horaTexto}</span>`;
    mensagens.appendChild(div);
    mensagens.scrollTop = mensagens.scrollHeight;
  });

  function adicionarMensagemSistema(texto) {
    const div = document.createElement('div');
    div.className = 'msg sistema';
    div.textContent = texto;
    mensagens.appendChild(div);
    mensagens.scrollTop = mensagens.scrollHeight;
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ---------- Entrar / sair da chamada (opt-in — nada disso acontece sozinho) ----------
  btnChamada.addEventListener('click', () => {
    if (emChamada) sairDaChamada(); else entrarNaChamada();
  });

  async function entrarNaChamada() {
    if (emChamada) return;
    garantirAudioContext();

    const modoMusica = selectQualidadeAudio.value === 'musica';
    const constraintsAudio = modoMusica ? {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      sampleRate: 48000,
      channelCount: 2
    } : {
      echoCancellation: cancelamentoEcoAtivo,
      noiseSuppression: reducaoRuidoAtiva,
      autoGainControl: agcAtivo
    };
    if (dispositivoMicPreferido) constraintsAudio.deviceId = { exact: dispositivoMicPreferido };

    try {
      streamMic = await navigator.mediaDevices.getUserMedia({ audio: constraintsAudio, video: false });
    } catch (e) {
      streamMic = null;
    }

    if (streamMic) configurarAnaliseLocal(streamMic.getAudioTracks()[0]);

    emChamada = true;
    adicionarParticipanteNaVoz('local', meuNome, true);
    iniciarDeteccaoDeFala(); // [FIX] inicia o loop SÓ agora
    socket.emit('entrar-voz', { sala: minhaSala });
    atualizarUiChamada();
  }

  function sairDaChamada() {
    if (!emChamada) return;
    if (streamTela) pararCompartilhamentoTela();

    Object.keys(conexoes).forEach(fecharConexao);

    if (streamMic) {
      streamMic.getTracks().forEach(t => t.stop());
      streamMic = null;
    }

    emChamada = false;
    pararDeteccaoDeFala(); // [FIX] para o loop ao sair
    pararAudioRemoto('local');
    removerParticipanteDaVoz('local');
    if (audioCtx && audioCtx.state === 'running') {
      audioCtx.suspend().catch(() => {});
    }
    socket.emit('sair-voz', { sala: minhaSala });
    atualizarUiChamada();
  }

  function atualizarUiChamada() {
    btnChamada.classList.toggle('ativo', emChamada);
    btnChamada.textContent = emChamada ? '📵' : '📞';
    btnChamada.title = emChamada ? 'sair da chamada' : 'entrar na chamada';

    [btnMic, btnTela, btnRuido].forEach(b => b.classList.toggle('indisponivel', !emChamada));

    if (emChamada) {
      btnMic.classList.toggle('indisponivel', !streamMic);
      btnMic.textContent = streamMic ? '🎤' : '🔇';
      btnMic.title = streamMic ? 'microfone' : 'microfone indisponível';
      btnRuido.classList.toggle('indisponivel', !streamMic);
    }
  }

  // ---------- Microfone ----------
  btnMic.addEventListener('click', () => {
    if (!emChamada || !streamMic) return;
    micAtivo = !micAtivo;
    streamMic.getAudioTracks().forEach(t => t.enabled = micAtivo);
    btnMic.classList.toggle('ativo', micAtivo);
    btnMic.textContent = micAtivo ? '🎤' : '🔇';
  });

  // ---------- Redução de ruído ----------
  btnRuido.addEventListener('click', async () => {
    if (!emChamada || !streamMic) return;
    reducaoRuidoAtiva = !reducaoRuidoAtiva;
    const trilha = streamMic.getAudioTracks()[0];
    try {
      await trilha.applyConstraints({ noiseSuppression: reducaoRuidoAtiva });
    } catch (e) {
      console.warn('este navegador não permite alternar a redução de ruído em tempo real', e);
    }
    btnRuido.classList.toggle('ativo', reducaoRuidoAtiva);
    btnRuido.textContent = reducaoRuidoAtiva ? '🔉' : '🔊';
    btnRuido.title = reducaoRuidoAtiva ? 'redução de ruído: ativada' : 'redução de ruído: desativada';
    chkRuido.checked = reducaoRuidoAtiva;
  });

  // ---------- Compartilhar tela ----------
  const compartilhamentoTelaSuportado = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  if (!compartilhamentoTelaSuportado) {
    btnTela.title = 'compartilhamento de tela não é suportado neste navegador (é um recurso só de computador)';
    btnTela.classList.add('sem-suporte');
  }

  btnTela.addEventListener('click', async () => {
    if (!emChamada) return;
    if (streamTela) { pararCompartilhamentoTela(); return; }

    if (!compartilhamentoTelaSuportado) {
      adicionarMensagemSistema('Compartilhar tela não é suportado neste navegador — é um recurso só de computador (não funciona em celular).');
      return;
    }

    try {
      const valVideo = selectQualidadeVideo.value;
      const [res, fpsStr] = valVideo.split('@');
      const height = res === '1080' ? 1080 : res === '720' ? 720 : 480;
      const width = res === '1080' ? 1920 : res === '720' ? 1280 : 854;
      const fps = parseInt(fpsStr, 10);

      streamTela = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: fps, max: fps },
          width: { ideal: width, max: width },
          height: { ideal: height, max: height }
        },
        audio: false
      });
    } catch (e) {
      return; // usuário cancelou o seletor de tela
    }

    const trilhaTela = streamTela.getVideoTracks()[0];
    trilhaTela.onended = pararCompartilhamentoTela;

    // Aplica a trilha em todos os peers e TRAVA o bitrate na qualidade escolhida
    for (const estado of Object.values(conexoes)) {
      estado.pc.addTrack(trilhaTela, streamTela);
      // Aguarda a negociação resolver antes de setar os parâmetros
      // (sem o setTimeout o sender ainda não tem parâmetros disponíveis)
      setTimeout(() => travarQualidadeVideo(estado.pc), 500);
    }

    criarOuAtualizarQuadro('local', meuNome, streamTela);
    btnTela.classList.add('ativo');

    // [QUALIDADE] Reforça a trava a cada 8 segundos enquanto tela estiver ativa.
    // Isso impede que o WebRTC relaxe o bitrate depois de alguns minutos.
    if (!estado_qualidadeInterval) {
      estado_qualidadeInterval = setInterval(() => {
        if (!streamTela) { clearInterval(estado_qualidadeInterval); estado_qualidadeInterval = null; return; }
        Object.values(conexoes).forEach(e => travarQualidadeVideo(e.pc));
      }, 8000);
    }
  });

  function pararCompartilhamentoTela() {
    if (estado_qualidadeInterval) {
      clearInterval(estado_qualidadeInterval);
      estado_qualidadeInterval = null;
    }
    if (!streamTela) return;
    const trilha = streamTela.getVideoTracks()[0];
    Object.values(conexoes).forEach(estado => {
      const remetente = estado.pc.getSenders().find(s => s.track === trilha);
      if (remetente) estado.pc.removeTrack(remetente);
    });
    streamTela.getTracks().forEach(t => t.stop());
    streamTela = null;
    removerQuadro('local');
    btnTela.classList.remove('ativo');
  }

  // ---------- Sair da sala ----------
  btnSair.addEventListener('click', () => {
    window.location.reload();
  });
})();
