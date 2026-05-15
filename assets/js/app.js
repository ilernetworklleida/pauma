/* Pauma · app.js · v0.3
 * Transcripción en vivo con diarización, modo "yo hablo", historial con buscador
 * y exportación, modo SOS, push-to-talk, estadísticas, onboarding y auto-update PWA.
 * Sin dependencias externas. Chrome/Edge Android y desktop.
 */
(() => {
  'use strict';

  // ════════════════════════════════════════════════════════════════
  // CONST + STATE
  // ════════════════════════════════════════════════════════════════
  const PALETTE_LEN = 8;
  const VERSION = 'v0.6';

  const PHRASE_CATEGORIES = [
    { id: 'general',    label: 'General' },
    { id: 'urgencia',   label: 'Urgencia' },
    { id: 'medico',     label: 'Médico' },
    { id: 'compras',    label: 'Compras' },
    { id: 'transporte', label: 'Transporte' },
    { id: 'social',     label: 'Social' },
  ];

  const DEFAULT_PHRASES = {
    general: [
      'Hola, soy sorda. ¿Puedes escribir aquí?',
      'Más despacio, por favor.',
      'No te entiendo, ¿puedes repetir?',
      'Por favor, mírame a los ojos cuando hablas.',
      'Gracias.',
    ],
    urgencia: [
      'Necesito ayuda urgente.',
      'Llama a una ambulancia, por favor.',
      'Soy sorda, no puedo oír las indicaciones por megafonía.',
      'Mi pareja también es sorda.',
    ],
    medico: [
      'Soy sorda. Por favor, escribe aquí lo que me digas.',
      '¿Me puedes explicar el tratamiento por escrito?',
      'No tengo alergias conocidas.',
      '¿Puedes ponerme la receta por escrito?',
    ],
    compras: [
      '¿Me puedes apuntar el precio aquí?',
      '¿Tenéis esto en otro color?',
      '¿Aceptáis tarjeta?',
      'No, gracias, solo estoy mirando.',
    ],
    transporte: [
      '¿A qué hora sale el siguiente?',
      'Por favor, escríbeme la dirección.',
      'Necesito que el conductor me avise cuando lleguemos.',
      '¿Puedes apuntarme el número de andén?',
    ],
    social: [
      'Encantada de conocerte.',
      '¿Cómo te llamas?',
      '¿Te apetece tomar algo?',
      'Lo siento, no he entendido.',
    ],
  };

  const state = {
    view: 'listen',
    sosActive: false,
    sosOrigin: null, // a qué vista volver al cerrar SOS
    lang: localStorage.getItem('pauma-lang') || 'es-ES',
    fontSize: localStorage.getItem('pauma-fontsize') || 'normal',
    showEmotion: localStorage.getItem('pauma-emotion') !== '0',
    saveHistory: localStorage.getItem('pauma-history') !== '0',
    pushToTalk: localStorage.getItem('pauma-ptt') === '1',

    listening: false,
    provider: null,
    ws: null,
    audioCtx: null,
    micStream: null,
    audioProcessor: null,
    audioSource: null,
    audioAnalyser: null,
    audioVizRaf: null,
    webSpeech: null,
    wakeLock: null,
    keepAliveTimer: null,
    currentKeyId: null,
    faceToFace: localStorage.getItem('pauma-f2f') === '1',
    myName: localStorage.getItem('pauma-my-name') || '',
    ttsPlaying: false,

    speakers: loadJSON('pauma-speakers', {}),
    currentSession: null,
    historyDb: null,
    historySearch: '',

    interimEl: null,
    lastSegmentEl: null,
    lastSpeaker: null,

    phrases: loadJSON('pauma-phrases', { ...DEFAULT_PHRASES }),
    activeCategory: localStorage.getItem('pauma-cat') || 'general',
    recentSpoken: loadJSON('pauma-recent-spoken', []),

    activeSessionDetailId: null,
    swReg: null,
  };

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch { return fallback; }
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  // ════════════════════════════════════════════════════════════════
  // DOM
  // ════════════════════════════════════════════════════════════════
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const el = {
    brandDot: $('#brand-dot'),
    btnLang: $('#btnLang'),
    btnSos: $('#btnSos'),
    langLabel: $('#langLabel'),
    statusLine: $('#statusLine'),

    views: $$('.view'),
    transcript: $('#transcript'),
    welcome: $('#welcome'),

    tabs: $$('.tab'),
    tabMic: $('#tabMic'),

    speakText: $('#speakText'),
    btnSpeak: $('#btnSpeak'),
    btnSpeakClear: $('#btnSpeakClear'),
    categories: $('#categories'),
    quickList: $('#quickList'),
    btnAddPhrase: $('#btnAddPhrase'),
    recentSpokenWrap: $('#recentSpokenWrap'),
    recentSpoken: $('#recentSpoken'),

    historyList: $('#historyList'),
    histEmpty: $('#histEmpty'),
    histSearch: $('#histSearch'),
    searchClear: $('#searchClear'),
    btnHistClear: $('#btnHistClear'),

    installBanner: $('#installBanner'),
    installAccept: $('#installAccept'),
    installDismiss: $('#installDismiss'),

    audioViz: $('#audioViz'),
    qualityDot: $('#qualityDot'),
    quickActions: $('#quickActions'),
    qaMark: $('#qaMark'),
    qaRepeat: $('#qaRepeat'),
    qaSlower: $('#qaSlower'),
    tipMic: $('#tipMic'),
    btnF2F: $('#btnF2F'),
    appHeader: document.querySelector('.app-header'),

    setMyName: $('#setMyName'),
    btnExportAll: $('#btnExportAll'),
    btnImportAll: $('#btnImportAll'),
    importFile: $('#importFile'),
    scrollTop: $('#scrollTop'),
    confirmModal: $('#confirmModal'),
    confirmTitle: $('#confirmTitle'),
    confirmMsg: $('#confirmMsg'),
    confirmOk: $('#confirmOk'),
    confirmCancel: $('#confirmCancel'),

    speakersList: $('#speakersList'),
    setEmotion: $('#setEmotion'),
    setHistory: $('#setHistory'),
    setPTT: $('#setPTT'),
    statsGrid: $('#statsGrid'),

    sosBtn: $('#btnSos'),
    sosTranscript: $('#sosTranscript'),
    sosInput: $('#sosInput'),
    sosSpeak: $('#sosSpeak'),
    sosClose: $('#btnSosClose'),

    onboarding: $('#onboarding'),
    obSlides: $$('.ob-slide'),
    obDots: $$('.ob-dot'),
    obNext: $('#obNext'),
    obSkip: $('#obSkip'),

    modalRename: $('#modalRename'),
    renameInput: $('#renameInput'),
    renameCancel: $('#renameCancel'),
    renameSave: $('#renameSave'),

    sheet: $('#sheetSession'),
    sheetBack: $('#sheetBack'),
    sheetTitle: $('#sheetTitle'),
    sheetShare: $('#sheetShare'),
    sheetDownload: $('#sheetDownload'),
    sheetDelete: $('#sheetDelete'),
    sheetBody: $('#sheetBody'),

    updateToast: $('#updateToast'),
    btnUpdate: $('#btnUpdate'),
  };

  // ════════════════════════════════════════════════════════════════
  // UTILS
  // ════════════════════════════════════════════════════════════════
  const uuid = () => crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

  const nowHM = () => new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const fmtDate = (ts) => new Date(ts).toLocaleString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
  const fmtDateShort = (ts) => new Date(ts).toLocaleString('es-ES', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  const setStatus = (text, kind = '') => {
    el.statusLine.textContent = text || '';
    el.statusLine.className = 'status-line' + (kind ? ' ' + kind : '');
  };

  function speakerLabel(idx) {
    if (idx == null) return null;
    const entry = state.speakers[idx];
    if (entry && entry.name) return entry.name;
    return 'Persona ' + (Number(idx) + 1);
  }

  function vibrate(pattern) {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(pattern); } catch (_) {}
    }
  }

  function feedbackToast(text, kind = '') {
    const t = document.createElement('div');
    t.className = 'feedback-toast' + (kind ? ' ' + kind : '');
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1900);
  }

  function setQuality(level, title) {
    el.qualityDot.className = 'quality-dot ' + (level || '');
    if (title) el.qualityDot.title = title;
  }

  // ════════════════════════════════════════════════════════════════
  // STORAGE (IndexedDB)
  // ════════════════════════════════════════════════════════════════
  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('pauma', 2);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        if (!db.objectStoreNames.contains('sessions')) {
          const s = db.createObjectStore('sessions', { keyPath: 'id' });
          s.createIndex('started', 'started');
        }
        // future stores can be added here
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function dbPutSession(s) {
    if (!state.historyDb) state.historyDb = await openDb();
    return new Promise((res, rej) => {
      const tx = state.historyDb.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').put(s);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  }
  async function dbGetSessions() {
    if (!state.historyDb) state.historyDb = await openDb();
    return new Promise((res, rej) => {
      const out = [];
      const tx = state.historyDb.transaction('sessions', 'readonly');
      tx.objectStore('sessions').index('started').openCursor(null, 'prev').onsuccess = (e) => {
        const cur = e.target.result;
        if (cur) { out.push(cur.value); cur.continue(); }
        else res(out);
      };
      tx.onerror = () => rej(tx.error);
    });
  }
  async function dbGetSession(id) {
    if (!state.historyDb) state.historyDb = await openDb();
    return new Promise((res, rej) => {
      const tx = state.historyDb.transaction('sessions', 'readonly');
      const r = tx.objectStore('sessions').get(id);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function dbDeleteSession(id) {
    if (!state.historyDb) state.historyDb = await openDb();
    return new Promise((res, rej) => {
      const tx = state.historyDb.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').delete(id);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  }
  async function dbDeleteAll() {
    if (!state.historyDb) state.historyDb = await openDb();
    return new Promise((res, rej) => {
      const tx = state.historyDb.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').clear();
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  }

  function newSession() {
    return {
      id: uuid(),
      title: '',
      started: Date.now(),
      ended: null,
      lang: state.lang,
      segments: [],
    };
  }

  async function persistCurrentSession() {
    if (!state.saveHistory) return;
    if (!state.currentSession || state.currentSession.segments.length === 0) return;
    state.currentSession.ended = Date.now();
    try { await dbPutSession(state.currentSession); } catch (_) {}
  }

  // ════════════════════════════════════════════════════════════════
  // EMOTION
  // ════════════════════════════════════════════════════════════════
  const EMOTION_RULES = [
    { tag: 'irritado',  re: /(!{2,}|maldit|cabr|joder|qué\s+rabia|qué\s+coñazo|estoy\s+harto)/i },
    { tag: 'alegre',    re: /(jajaja+|jeje+|qué\s+bien|me\s+encanta|guay|genial|qué\s+alegría)/i },
    { tag: 'preocupado',re: /(no\s+sé|estoy\s+preocupad|me\s+da\s+miedo|tengo\s+miedo|qué\s+vamos\s+a\s+hacer)/i },
    { tag: 'cariñoso',  re: /(cariño|mi\s+amor|te\s+quiero|cielo|guapa|guapo|tesoro)/i },
    { tag: 'pregunta',  re: /\?$/ },
  ];
  function detectEmotion(text) {
    if (!state.showEmotion || !text) return null;
    for (const r of EMOTION_RULES) {
      if (r.re.test(text)) return r.tag;
    }
    return null;
  }

  function detectName(text) {
    if (!state.myName || !text) return null;
    const names = state.myName.split(',').map(s => s.trim()).filter(Boolean);
    const t = ' ' + text.toLowerCase() + ' ';
    for (const name of names) {
      const re = new RegExp('(?:^|[^a-záéíóúüñ])' + escapeRegexLocal(name.toLowerCase()) + '(?:[^a-záéíóúüñ]|$)');
      if (re.test(t)) return name;
    }
    return null;
  }
  function escapeRegexLocal(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  async function copySegmentText(segEl) {
    const txt = segEl.querySelector('.segment-text')?.textContent?.trim();
    if (!txt) return;
    try {
      await navigator.clipboard.writeText(txt);
      segEl.classList.add('copied');
      setTimeout(() => segEl.classList.remove('copied'), 600);
      feedbackToast('Copiado al portapapeles', 'ok');
      vibrate(15);
    } catch {
      feedbackToast('No se pudo copiar', 'err');
    }
  }

  // ════════════════════════════════════════════════════════════════
  // TRANSCRIBE (Deepgram + fallback Web Speech)
  // ════════════════════════════════════════════════════════════════
  async function getProviderConfig() {
    const lang = state.lang.startsWith('ca') ? 'ca' : state.lang.startsWith('en') ? 'en' : 'es';
    try {
      const res = await fetch('/api/token.php?lang=' + lang, { credentials: 'same-origin' });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.error) return null;
      return data;
    } catch { return null; }
  }

  function floatTo16BitPCM(f32) {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      const s = Math.max(-1, Math.min(1, f32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out.buffer;
  }

  async function startDeepgram(cfg) {
    const params = new URLSearchParams(cfg.params);
    const url = cfg.ws_url + '?' + params.toString();
    const ws = new WebSocket(url, ['token', cfg.token]);
    state.ws = ws;
    state.currentKeyId = cfg.key_id || null;

    return new Promise((resolve, reject) => {
      const fail = (err) => { cleanupAudio(); reject(err); };
      ws.onerror = () => fail(new Error('ws_error'));
      ws.onopen = async () => {
        try {
          state.micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1, sampleRate: 16000,
              echoCancellation: true, noiseSuppression: true, autoGainControl: true,
            },
          });
          const Ctx = window.AudioContext || window.webkitAudioContext;
          const ctx = new Ctx({ sampleRate: 16000 });
          state.audioCtx = ctx;
          const source = ctx.createMediaStreamSource(state.micStream);
          state.audioSource = source;
          const processor = ctx.createScriptProcessor(4096, 1, 1);
          state.audioProcessor = processor;
          processor.onaudioprocess = (e) => {
            if (ws.readyState !== 1) return;
            if (state.ttsPlaying) return; // anti feedback loop con TTS local
            ws.send(floatTo16BitPCM(e.inputBuffer.getChannelData(0)));
          };
          source.connect(processor);
          processor.connect(ctx.destination);

          // visualizer
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          state.audioAnalyser = analyser;
          startAudioViz();

          state.keepAliveTimer = setInterval(() => {
            if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'KeepAlive' }));
          }, 8000);
          resolve();
        } catch (err) { fail(err); }
      };
      ws.onmessage = (msg) => handleDeepgramMessage(msg.data);
      ws.onclose = () => {
        cleanupAudio();
        if (state.listening) {
          setStatus('Conexión cerrada. Reanudando…', 'warn');
          setTimeout(() => state.listening && restart(), 1500);
        }
      };
    });
  }

  function handleDeepgramMessage(raw) {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    if (data.type === 'Results' && data.channel?.alternatives?.[0]) {
      const alt = data.channel.alternatives[0];
      const isFinal = !!data.is_final;
      const text = (alt.transcript || '').trim();
      if (!text) return;

      let speakerIdx = null;
      if (alt.words?.length) {
        const counts = {};
        for (const w of alt.words) {
          if (w.speaker != null) counts[w.speaker] = (counts[w.speaker] || 0) + 1;
        }
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        if (top) speakerIdx = Number(top[0]);
      }

      if (isFinal) addFinal(text, speakerIdx);
      else renderInterim(text, speakerIdx);
    }
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function startWebSpeech() {
    if (!SR) throw new Error('webspeech_unsupported');
    const r = new SR();
    r.continuous = true; r.interimResults = true; r.lang = state.lang; r.maxAlternatives = 1;
    state.webSpeech = r;
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript.trim();
        if (!text) continue;
        if (res.isFinal) addFinal(text, null);
        else interim += (interim ? ' ' : '') + text;
      }
      renderInterim(interim, null);
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setStatus('Permiso de micrófono denegado', 'error'); stop(); return;
      }
      setStatus('Error: ' + e.error, 'error');
    };
    r.onend = () => {
      if (!state.listening) return;
      try { r.start(); } catch (_) {}
    };
    r.start();
  }

  // ════════════════════════════════════════════════════════════════
  // START / STOP / RESTART
  // ════════════════════════════════════════════════════════════════
  async function start() {
    if (state.listening) return;
    state.listening = true;
    el.brandDot.classList.add('listening');
    el.tabMic.classList.add('listening');
    el.tabMic.setAttribute('aria-label', 'Detener');
    setStatus('Iniciando…');
    if (!state.sosActive) { hideWelcome(); activateView('listen'); }
    state.currentSession = newSession();
    await requestWakeLock();
    vibrate([30, 20, 30]);

    const cfg = await getProviderConfig();
    if (cfg?.provider === 'deepgram' && cfg.token) {
      try {
        state.provider = 'deepgram';
        await startDeepgram(cfg);
        setStatus('Escuchando · alta calidad · identifica hablantes', 'ok');
        setQuality('high', 'Alta calidad · diarización activa');
        showQuickActions();
        return;
      } catch (err) { console.warn('Deepgram failed, fallback', err); }
    }
    if (SR) {
      try {
        state.provider = 'webspeech';
        startWebSpeech();
        setStatus('Escuchando · modo básico (sin diarización)', 'warn');
        setQuality('basic', 'Modo básico · sin identificar hablantes');
        showQuickActions();
        return;
      } catch { await stop(); setStatus('No se pudo iniciar', 'error'); return; }
    }
    setStatus('Tu navegador no es compatible. Usa Chrome o Edge.', 'error');
    setQuality('error', 'No disponible');
    await stop();
  }

  async function stop() {
    state.listening = false;
    clearInterval(state.keepAliveTimer); state.keepAliveTimer = null;
    el.brandDot.classList.remove('listening');
    el.tabMic.classList.remove('listening');
    el.tabMic.classList.remove('ptt');
    el.tabMic.setAttribute('aria-label', 'Empezar a escuchar');

    if (state.ws) {
      try { state.ws.send(JSON.stringify({ type: 'CloseStream' })); } catch (_) {}
      try { state.ws.close(); } catch (_) {}
      state.ws = null;
    }
    if (state.webSpeech) {
      try { state.webSpeech.stop(); } catch (_) {}
      state.webSpeech = null;
    }
    stopAudioViz();
    hideQuickActions();
    setQuality('');
    cleanupAudio();
    releaseWakeLock();
    renderInterim('', null);

    // revoke temp key best-effort
    if (state.currentKeyId) {
      fetch('/api/revoke.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_id: state.currentKeyId }),
        keepalive: true,
        credentials: 'same-origin',
      }).catch(() => {});
      state.currentKeyId = null;
    }

    await persistCurrentSession();
    state.currentSession = null;
    state.lastSpeaker = null;
    state.lastSegmentEl = null;
    vibrate(20);
    setStatus('En pausa');
  }

  async function restart() {
    await stop();
    setTimeout(start, 200);
  }

  function cleanupAudio() {
    if (state.audioProcessor) { try { state.audioProcessor.disconnect(); } catch (_) {} state.audioProcessor = null; }
    if (state.audioSource) { try { state.audioSource.disconnect(); } catch (_) {} state.audioSource = null; }
    if (state.audioAnalyser) { try { state.audioAnalyser.disconnect(); } catch (_) {} state.audioAnalyser = null; }
    if (state.audioCtx) { try { state.audioCtx.close(); } catch (_) {} state.audioCtx = null; }
    if (state.micStream) {
      state.micStream.getTracks().forEach(t => t.stop());
      state.micStream = null;
    }
  }

  // ════════════════════════════════════════════════════════════════
  // AUDIO VISUALIZER
  // ════════════════════════════════════════════════════════════════
  function startAudioViz() {
    const bars = el.audioViz.querySelectorAll('span');
    if (!bars.length || !state.audioAnalyser) return;
    el.audioViz.classList.add('active', 'listening');
    const data = new Uint8Array(state.audioAnalyser.frequencyBinCount);
    const tick = () => {
      if (!state.audioAnalyser) return;
      state.audioAnalyser.getByteFrequencyData(data);
      const step = Math.floor(data.length / bars.length);
      let sum = 0;
      bars.forEach((bar, i) => {
        const v = data[i * step] || 0;
        const h = Math.max(3, Math.min(14, (v / 255) * 14 + 2));
        bar.style.height = h + 'px';
        sum += v;
      });
      const avg = sum / bars.length;
      el.audioViz.classList.toggle('low', avg < 8);
      state.audioVizRaf = requestAnimationFrame(tick);
    };
    tick();
  }
  function stopAudioViz() {
    if (state.audioVizRaf) { cancelAnimationFrame(state.audioVizRaf); state.audioVizRaf = null; }
    el.audioViz.classList.remove('active', 'listening', 'low');
    el.audioViz.querySelectorAll('span').forEach(b => b.style.height = '4px');
  }

  // ════════════════════════════════════════════════════════════════
  // QUICK ACTIONS (durante escucha)
  // ════════════════════════════════════════════════════════════════
  function showQuickActions() {
    el.quickActions.hidden = false;
  }
  function hideQuickActions() {
    el.quickActions.hidden = true;
  }
  function markCurrentMoment() {
    if (state.lastSegmentEl) {
      state.lastSegmentEl.classList.toggle('marked');
      vibrate(20);
      const marked = state.lastSegmentEl.classList.contains('marked');
      feedbackToast(marked ? 'Marcado' : 'Marca quitada', 'ok');
      el.qaMark.classList.toggle('marked', marked);
    } else {
      feedbackToast('Nada que marcar todavía', '');
    }
  }
  function askToRepeat() {
    speak('¿Puedes repetir, por favor?', el.qaRepeat);
    vibrate(30);
  }
  function askToSlowDown() {
    speak('Más despacio, por favor.', el.qaSlower);
    vibrate(30);
  }

  async function toggle() {
    if (state.listening) await stop();
    else await start();
  }

  // ── Push-to-Talk handlers ──
  function setupPTT() {
    let pressTimer = null;
    const startPress = (e) => {
      if (!state.pushToTalk) return;
      e.preventDefault();
      el.tabMic.classList.add('ptt');
      pressTimer = setTimeout(() => { start(); }, 150);
    };
    const endPress = (e) => {
      if (!state.pushToTalk) return;
      e.preventDefault();
      clearTimeout(pressTimer);
      el.tabMic.classList.remove('ptt');
      if (state.listening) stop();
    };
    el.tabMic.addEventListener('touchstart', startPress, { passive: false });
    el.tabMic.addEventListener('touchend', endPress);
    el.tabMic.addEventListener('touchcancel', endPress);
    el.tabMic.addEventListener('mousedown', startPress);
    el.tabMic.addEventListener('mouseup', endPress);
    el.tabMic.addEventListener('mouseleave', endPress);
  }

  // ════════════════════════════════════════════════════════════════
  // WAKE LOCK
  // ════════════════════════════════════════════════════════════════
  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      state.wakeLock = await navigator.wakeLock.request('screen');
      state.wakeLock.addEventListener('release', () => { state.wakeLock = null; });
    } catch (_) {}
  }
  function releaseWakeLock() {
    if (state.wakeLock) { state.wakeLock.release().catch(() => {}); state.wakeLock = null; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.listening && !state.wakeLock) requestWakeLock();
  });

  // ════════════════════════════════════════════════════════════════
  // RENDER (segments)
  // ════════════════════════════════════════════════════════════════
  function hideWelcome() { if (el.welcome) el.welcome.style.display = 'none'; }
  function showWelcome() { if (el.welcome) el.welcome.style.display = ''; }
  function scrollTranscript(target) {
    requestAnimationFrame(() => { target.scrollTop = target.scrollHeight; });
  }

  function renderInterim(text, speakerIdx) {
    const container = state.sosActive ? el.sosTranscript : el.transcript;
    if (!text) {
      if (state.interimEl) { state.interimEl.remove(); state.interimEl = null; }
      return;
    }
    if (!state.interimEl) {
      state.interimEl = document.createElement('div');
      state.interimEl.className = state.sosActive ? 'seg interim' : 'segment interim';
      container.appendChild(state.interimEl);
    }
    if (speakerIdx != null) state.interimEl.dataset.speaker = (speakerIdx % PALETTE_LEN);
    state.interimEl.textContent = text;
    scrollTranscript(container);
  }

  function addFinal(text, speakerIdx) {
    if (!text) return;
    renderInterim('', null);
    const emotion = detectEmotion(text);
    const nameMatch = detectName(text);
    const time = nowHM();
    const speaker = speakerIdx != null ? Number(speakerIdx) : null;

    if (state.sosActive) {
      const span = document.createElement('span');
      span.className = 'seg';
      span.textContent = text;
      el.sosTranscript.appendChild(span);
      scrollTranscript(el.sosTranscript);
    } else {
      if (state.lastSegmentEl && state.lastSpeaker === speaker && (Date.now() - (state.lastSegmentEl._t || 0)) < 12000) {
        const span = state.lastSegmentEl.querySelector('.segment-text');
        span.appendChild(document.createTextNode(' ' + text));
        state.lastSegmentEl._t = Date.now();
        if (emotion) {
          let m = state.lastSegmentEl.querySelector('.segment-emotion');
          if (!m) {
            m = document.createElement('span');
            m.className = 'segment-emotion';
            state.lastSegmentEl.querySelector('.segment-meta').appendChild(m);
          }
          m.textContent = '(' + emotion + ')';
        }
      } else {
        const div = document.createElement('div');
        div.className = 'segment' + (nameMatch ? ' name-match' : '');
        if (speaker != null) div.dataset.speaker = (speaker % PALETTE_LEN);
        div._t = Date.now();
        div.addEventListener('click', (e) => {
          // si han clicado el speaker name (rename), no copiar
          if (e.target.closest('.segment-speaker')) return;
          copySegmentText(div);
        });
        if (nameMatch) {
          vibrate([60, 50, 100, 50, 60]);
          feedbackToast('Te están llamando: "' + nameMatch + '"', 'ok');
        }

        const meta = document.createElement('div');
        meta.className = 'segment-meta';

        if (speaker != null) {
          const sp = document.createElement('span');
          sp.className = 'segment-speaker';
          sp.textContent = speakerLabel(speaker);
          sp.dataset.speaker = speaker;
          sp.addEventListener('click', () => openRenameSpeaker(speaker));
          meta.appendChild(sp);
        }

        const t = document.createElement('span');
        t.className = 'segment-time'; t.textContent = time;
        meta.appendChild(t);

        if (emotion) {
          const m = document.createElement('span');
          m.className = 'segment-emotion'; m.textContent = '(' + emotion + ')';
          meta.appendChild(m);
        }

        const txt = document.createElement('span');
        txt.className = 'segment-text'; txt.textContent = text;

        div.appendChild(meta); div.appendChild(txt);
        el.transcript.appendChild(div);
        state.lastSegmentEl = div;
        state.lastSpeaker = speaker;
      }
      scrollTranscript(el.transcript);
    }

    if (state.currentSession) {
      state.currentSession.segments.push({ t: Date.now(), speaker, text, emotion });
      if (state.currentSession.segments.length % 5 === 0) persistCurrentSession();
    }
  }

  // ════════════════════════════════════════════════════════════════
  // SPEAKERS
  // ════════════════════════════════════════════════════════════════
  let renameSpeakerIdx = null;
  function openRenameSpeaker(idx) {
    renameSpeakerIdx = idx;
    el.renameInput.value = state.speakers[idx]?.name || '';
    el.modalRename.hidden = false;
    setTimeout(() => el.renameInput.focus(), 50);
  }
  function closeRenameSpeaker() { el.modalRename.hidden = true; renameSpeakerIdx = null; }
  function saveRenameSpeaker() {
    if (renameSpeakerIdx == null) return;
    const name = el.renameInput.value.trim().slice(0, 20);
    if (!state.speakers[renameSpeakerIdx]) state.speakers[renameSpeakerIdx] = {};
    state.speakers[renameSpeakerIdx].name = name;
    saveJSON('pauma-speakers', state.speakers);
    document.querySelectorAll('.segment-speaker').forEach(s => {
      if (Number(s.dataset.speaker) === renameSpeakerIdx) s.textContent = speakerLabel(renameSpeakerIdx);
    });
    renderSpeakersSettings();
    closeRenameSpeaker();
  }

  // ════════════════════════════════════════════════════════════════
  // TTS (modo "yo hablo" y SOS)
  // ════════════════════════════════════════════════════════════════
  async function speak(text, btn) {
    if (!text) return;
    if (btn) btn.disabled = true;
    setStatus('Generando voz…');
    addToRecentSpoken(text);
    const originalLabel = btn ? btn.innerHTML : null;
    if (btn && btn.id === 'btnSpeak') {
      btn.innerHTML = '<span class="spinner"></span> Generando…';
    }
    try {
      const res = await fetch('/api/tts.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        credentials: 'same-origin',
      });
      if (res.ok) {
        const blob = await res.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        state.ttsPlaying = true;
        audio.onended = () => { state.ttsPlaying = false; setStatus(''); };
        audio.onerror = () => { state.ttsPlaying = false; fallbackTts(text); };
        await audio.play();
        setStatus('Hablando…', 'ok');
      } else {
        fallbackTts(text);
      }
    } catch {
      fallbackTts(text);
    } finally {
      if (btn) {
        btn.disabled = false;
        if (originalLabel) btn.innerHTML = originalLabel;
      }
    }
  }
  function fallbackTts(text) {
    if (!('speechSynthesis' in window)) {
      setStatus('Tu navegador no permite leer en voz alta', 'error'); return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = state.lang; u.rate = 1.0; u.pitch = 1.0;
    state.ttsPlaying = true;
    u.onstart = () => { state.ttsPlaying = true; };
    u.onend = () => { state.ttsPlaying = false; setStatus(''); };
    u.onerror = () => { state.ttsPlaying = false; };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    setStatus('Hablando…', 'ok');
  }
  function addToRecentSpoken(text) {
    const t = text.trim();
    if (!t) return;
    state.recentSpoken = [t, ...state.recentSpoken.filter(x => x !== t)].slice(0, 8);
    saveJSON('pauma-recent-spoken', state.recentSpoken);
    renderRecentSpoken();
  }

  // ════════════════════════════════════════════════════════════════
  // QUICK PHRASES (con categorías)
  // ════════════════════════════════════════════════════════════════
  function renderCategories() {
    el.categories.innerHTML = '';
    for (const cat of PHRASE_CATEGORIES) {
      const c = document.createElement('button');
      c.className = 'cat-chip' + (cat.id === state.activeCategory ? ' active' : '');
      c.type = 'button';
      c.textContent = cat.label;
      c.dataset.cat = cat.id;
      c.addEventListener('click', () => {
        state.activeCategory = cat.id;
        localStorage.setItem('pauma-cat', cat.id);
        renderCategories();
        renderQuickPhrases();
      });
      el.categories.appendChild(c);
    }
  }
  function renderQuickPhrases() {
    el.quickList.innerHTML = '';
    const list = state.phrases[state.activeCategory] || [];
    list.forEach((p, i) => {
      const row = document.createElement('button');
      row.className = 'quick-item'; row.type = 'button';
      const txt = document.createElement('span');
      txt.className = 'quick-item-text'; txt.textContent = p;
      row.appendChild(txt);
      const del = document.createElement('span');
      del.className = 'quick-item-delete';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Borrar frase');
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        state.phrases[state.activeCategory].splice(i, 1);
        saveJSON('pauma-phrases', state.phrases);
        renderQuickPhrases();
      });
      row.appendChild(del);
      row.addEventListener('click', () => {
        el.speakText.value = p;
        speak(p, el.btnSpeak);
      });
      el.quickList.appendChild(row);
    });
  }
  function renderRecentSpoken() {
    if (!state.recentSpoken.length) {
      el.recentSpokenWrap.hidden = true;
      return;
    }
    el.recentSpokenWrap.hidden = false;
    el.recentSpoken.innerHTML = '';
    state.recentSpoken.forEach((p) => {
      const row = document.createElement('button');
      row.className = 'quick-item'; row.type = 'button';
      const txt = document.createElement('span');
      txt.className = 'quick-item-text'; txt.textContent = p;
      row.appendChild(txt);
      row.addEventListener('click', () => { el.speakText.value = p; speak(p, el.btnSpeak); });
      el.recentSpoken.appendChild(row);
    });
  }

  // ════════════════════════════════════════════════════════════════
  // VIEWS / NAV
  // ════════════════════════════════════════════════════════════════
  function activateView(view) {
    state.view = view;
    el.views.forEach(v => { v.hidden = v.dataset.view !== view; });
    el.tabs.forEach(t => {
      const target = t.dataset.target;
      const isActive = (target === view) || (target === 'listen-view' && view === 'listen');
      t.classList.toggle('active', isActive && target !== 'listen');
    });
    if (view === 'history') renderHistory();
    if (view === 'settings') { renderSpeakersSettings(); renderStats(); }
  }
  function setupTabs() {
    el.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        if (state.pushToTalk && tab === el.tabMic) return;
        const target = tab.dataset.target;
        if (target === 'listen') toggle();
        else if (target === 'listen-view') activateView('listen');
        else activateView(target);
      });
    });
  }

  // ════════════════════════════════════════════════════════════════
  // HISTORY
  // ════════════════════════════════════════════════════════════════
  async function renderHistory() {
    let sessions = [];
    try { sessions = await dbGetSessions(); } catch (_) {}

    const q = state.historySearch.trim().toLowerCase();
    let filtered = sessions;
    if (q) {
      filtered = sessions.filter(s =>
        (s.title || '').toLowerCase().includes(q) ||
        s.segments.some(seg => seg.text.toLowerCase().includes(q))
      );
    }

    if (!filtered.length) {
      el.historyList.innerHTML = '';
      el.historyList.hidden = true;
      el.histEmpty.hidden = false;
      el.histEmpty.querySelector('p').textContent = q
        ? `No hay resultados para "${q}".`
        : 'Todavía no hay conversaciones guardadas.';
      return;
    }
    el.historyList.hidden = false;
    el.histEmpty.hidden = true;
    el.historyList.innerHTML = '';

    for (const s of filtered) {
      const item = document.createElement('button');
      item.className = 'hist-item'; item.type = 'button';

      const head = document.createElement('div');
      head.className = 'hist-item-head';
      const date = document.createElement('span');
      date.className = 'hist-item-date';
      date.textContent = s.title?.trim() || fmtDateShort(s.started);
      const meta = document.createElement('span');
      meta.className = 'hist-item-meta';
      const dur = s.ended ? Math.max(1, Math.round((s.ended - s.started) / 60000)) : 0;
      meta.textContent = `${s.segments.length} frases · ${dur} min`;
      head.appendChild(date); head.appendChild(meta);

      const preview = document.createElement('div');
      preview.className = 'hist-item-preview';
      let previewText = s.segments.slice(0, 3).map(seg => seg.text).join(' ');
      if (q) previewText = previewText.replace(new RegExp(`(${escapeRegex(q)})`, 'gi'), '<mark>$1</mark>');
      preview.innerHTML = previewText;

      item.appendChild(head); item.appendChild(preview);
      item.addEventListener('click', () => openSessionSheet(s.id));
      el.historyList.appendChild(item);
    }
  }
  function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // ── session detail sheet ──
  async function openSessionSheet(id) {
    const session = await dbGetSession(id);
    if (!session) return;
    state.activeSessionDetailId = id;
    el.sheetTitle.textContent = session.title?.trim() || fmtDate(session.started);
    el.sheetBody.innerHTML = '';

    for (const seg of session.segments) {
      const div = document.createElement('div');
      div.className = 'segment';
      if (seg.speaker != null) div.dataset.speaker = seg.speaker % PALETTE_LEN;
      const meta = document.createElement('div');
      meta.className = 'segment-meta';
      if (seg.speaker != null) {
        const sp = document.createElement('span');
        sp.className = 'segment-speaker';
        sp.dataset.speaker = seg.speaker;
        sp.textContent = speakerLabel(seg.speaker);
        meta.appendChild(sp);
      }
      const t = document.createElement('span');
      t.className = 'segment-time';
      t.textContent = new Date(seg.t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      meta.appendChild(t);
      if (seg.emotion) {
        const m = document.createElement('span');
        m.className = 'segment-emotion';
        m.textContent = '(' + seg.emotion + ')';
        meta.appendChild(m);
      }
      const txt = document.createElement('span');
      txt.className = 'segment-text';
      txt.textContent = seg.text;
      div.appendChild(meta); div.appendChild(txt);
      el.sheetBody.appendChild(div);
    }
    el.sheet.hidden = false;
  }
  function closeSessionSheet() { el.sheet.hidden = true; state.activeSessionDetailId = null; }

  async function saveSheetTitle() {
    if (!state.activeSessionDetailId) return;
    const title = el.sheetTitle.textContent.trim().slice(0, 80);
    const s = await dbGetSession(state.activeSessionDetailId);
    if (!s) return;
    s.title = title;
    await dbPutSession(s);
  }

  function sessionToText(session) {
    const lines = [];
    lines.push(`Pauma · ${session.title?.trim() || fmtDate(session.started)}`);
    lines.push('');
    for (const seg of session.segments) {
      const time = new Date(seg.t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      const sp = seg.speaker != null ? speakerLabel(seg.speaker) : '';
      const em = seg.emotion ? ` (${seg.emotion})` : '';
      lines.push(`[${time}] ${sp ? sp + ': ' : ''}${seg.text}${em}`);
    }
    return lines.join('\n');
  }
  async function shareSession() {
    if (!state.activeSessionDetailId) return;
    const session = await dbGetSession(state.activeSessionDetailId);
    if (!session) return;
    const text = sessionToText(session);
    const title = session.title?.trim() || 'Conversación de Pauma';
    if (navigator.share) {
      try { await navigator.share({ title, text }); return; } catch (_) {}
    }
    try { await navigator.clipboard.writeText(text); setStatus('Copiado al portapapeles', 'ok'); }
    catch { setStatus('No se pudo compartir', 'error'); }
  }
  async function downloadSession() {
    if (!state.activeSessionDetailId) return;
    const session = await dbGetSession(state.activeSessionDetailId);
    if (!session) return;
    const text = sessionToText(session);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const safeName = (session.title?.trim() || fmtDateShort(session.started)).replace(/[^a-zA-Z0-9-_ ]/g, '_');
    a.download = `pauma-${safeName}.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }
  async function deleteSession() {
    if (!state.activeSessionDetailId) return;
    askConfirm({
      title: '¿Borrar esta conversación?',
      message: 'No se puede deshacer.',
      confirmLabel: 'Borrar',
      onConfirm: async () => {
        await dbDeleteSession(state.activeSessionDetailId);
        closeSessionSheet();
        renderHistory();
        feedbackToast('Conversación borrada', 'ok');
      },
    });
  }

  // ════════════════════════════════════════════════════════════════
  // SETTINGS
  // ════════════════════════════════════════════════════════════════
  function renderSpeakersSettings() {
    el.speakersList.innerHTML = '';
    const known = Object.keys(state.speakers);
    if (known.length === 0) {
      const hint = document.createElement('p');
      hint.className = 'muted';
      hint.textContent = 'Aún no hay personas guardadas. Aparecerán aquí cuando Pauma las identifique.';
      el.speakersList.appendChild(hint);
      return;
    }
    known.forEach(idx => {
      const row = document.createElement('div');
      row.className = 'speaker-row';
      const swatch = document.createElement('span');
      swatch.className = 'speaker-swatch';
      swatch.style.background = `var(--sp-${Number(idx) % PALETTE_LEN})`;
      const name = document.createElement('span');
      name.className = 'speaker-name';
      name.textContent = speakerLabel(idx);
      const edit = document.createElement('button');
      edit.className = 'speaker-edit'; edit.type = 'button';
      edit.textContent = 'Cambiar';
      edit.addEventListener('click', () => openRenameSpeaker(Number(idx)));
      row.appendChild(swatch); row.appendChild(name); row.appendChild(edit);
      el.speakersList.appendChild(row);
    });
  }
  async function renderStats() {
    let sessions = [];
    try { sessions = await dbGetSessions(); } catch (_) {}
    const weekAgo = Date.now() - 7 * 86400000;
    const last7 = sessions.filter(s => s.started >= weekAgo);
    let totalMin = 0;
    for (const s of last7) {
      const dur = (s.ended || s.started) - s.started;
      totalMin += Math.max(0, dur / 60000);
    }
    const segCount = last7.reduce((acc, s) => acc + s.segments.length, 0);
    const speakerCounts = {};
    for (const s of last7) {
      for (const seg of s.segments) {
        if (seg.speaker != null) speakerCounts[seg.speaker] = (speakerCounts[seg.speaker] || 0) + 1;
      }
    }
    const topSpeaker = Object.entries(speakerCounts).sort((a, b) => b[1] - a[1])[0];
    const topName = topSpeaker ? speakerLabel(topSpeaker[0]) : '—';

    el.statsGrid.innerHTML = '';
    const items = [
      { num: last7.length, label: 'Conversaciones (7 días)' },
      { num: Math.round(totalMin) + ' min', label: 'Tiempo total' },
      { num: segCount, label: 'Frases transcritas' },
      { num: topName, label: 'Persona más frecuente' },
    ];
    for (const it of items) {
      const card = document.createElement('div');
      card.className = 'stat-card';
      const n = document.createElement('div'); n.className = 'stat-number'; n.textContent = it.num;
      const l = document.createElement('div'); l.className = 'stat-label'; l.textContent = it.label;
      card.appendChild(n); card.appendChild(l);
      el.statsGrid.appendChild(card);
    }
  }
  function setupSettings() {
    $$('input[name="lang"]').forEach(r => {
      r.checked = r.value === state.lang;
      r.addEventListener('change', () => {
        state.lang = r.value;
        localStorage.setItem('pauma-lang', state.lang);
        updateLangLabel();
        if (state.listening) restart();
      });
    });
    $$('input[name="fontsize"]').forEach(r => {
      r.checked = r.value === state.fontSize;
      r.addEventListener('change', () => {
        state.fontSize = r.value;
        localStorage.setItem('pauma-fontsize', state.fontSize);
        applyFontSize();
      });
    });
    el.setEmotion.checked = state.showEmotion;
    el.setEmotion.addEventListener('change', () => {
      state.showEmotion = el.setEmotion.checked;
      localStorage.setItem('pauma-emotion', state.showEmotion ? '1' : '0');
    });
    el.setHistory.checked = state.saveHistory;
    el.setHistory.addEventListener('change', () => {
      state.saveHistory = el.setHistory.checked;
      localStorage.setItem('pauma-history', state.saveHistory ? '1' : '0');
    });
    el.setPTT.checked = state.pushToTalk;
    el.setPTT.addEventListener('change', () => {
      state.pushToTalk = el.setPTT.checked;
      localStorage.setItem('pauma-ptt', state.pushToTalk ? '1' : '0');
    });

    el.setMyName.value = state.myName;
    el.setMyName.addEventListener('change', () => {
      state.myName = el.setMyName.value.trim();
      localStorage.setItem('pauma-my-name', state.myName);
    });

    el.btnExportAll.addEventListener('click', exportAllData);
    el.btnImportAll.addEventListener('click', importAllData);
    el.importFile.addEventListener('change', handleImportFile);
  }
  function applyFontSize() {
    document.body.classList.remove('fs-large', 'fs-xl');
    if (state.fontSize === 'large') document.body.classList.add('fs-large');
    else if (state.fontSize === 'xl') document.body.classList.add('fs-xl');
  }
  function updateLangLabel() {
    el.langLabel.textContent = state.lang.startsWith('ca') ? 'CA'
      : state.lang.startsWith('en') ? 'EN' : 'ES';
  }
  function cycleLang() {
    const order = ['es-ES', 'ca-ES', 'en-US'];
    const i = order.indexOf(state.lang);
    state.lang = order[(i + 1) % order.length];
    localStorage.setItem('pauma-lang', state.lang);
    $$('input[name="lang"]').forEach(r => { r.checked = r.value === state.lang; });
    updateLangLabel();
    if (state.listening) restart();
  }

  // ════════════════════════════════════════════════════════════════
  // SOS
  // ════════════════════════════════════════════════════════════════
  function openSos() {
    state.sosOrigin = state.view;
    state.sosActive = true;
    el.sosTranscript.innerHTML = '<span class="muted">Habla cerca del móvil. Pauma transcribirá automáticamente.</span>';
    activateView('sos');
    vibrate([60, 40, 60]);
    if (!state.listening) start();
  }
  function closeSos() {
    state.sosActive = false;
    if (state.listening) stop();
    activateView(state.sosOrigin === 'sos' ? 'listen' : (state.sosOrigin || 'listen'));
    state.sosOrigin = null;
  }
  function sosSpeak() {
    const t = el.sosInput.value.trim();
    if (!t) return;
    speak(t, el.sosSpeak);
    el.sosInput.value = '';
  }

  // ════════════════════════════════════════════════════════════════
  // ONBOARDING
  // ════════════════════════════════════════════════════════════════
  let obIdx = 0;
  function startOnboarding() {
    el.onboarding.hidden = false; obIdx = 0; showObSlide(0);
  }
  function showObSlide(i) {
    obIdx = i;
    el.obSlides.forEach((s, idx) => { s.hidden = idx !== i; });
    el.obDots.forEach((d, idx) => d.classList.toggle('active', idx === i));
    el.obNext.textContent = i === el.obSlides.length - 1 ? 'Empezar' : 'Siguiente';
  }
  function nextOnboarding() {
    if (obIdx < el.obSlides.length - 1) showObSlide(obIdx + 1);
    else finishOnboarding();
  }
  function finishOnboarding() {
    el.onboarding.hidden = true;
    localStorage.setItem('pauma-onboarded', '1');
  }

  // ════════════════════════════════════════════════════════════════
  // SERVICE WORKER + UPDATE
  // ════════════════════════════════════════════════════════════════
  function setupServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').then(reg => {
      state.swReg = reg;
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            el.updateToast.hidden = false;
          }
        });
      });
    }).catch(() => {});

    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'sw-activated') {
        // version refreshed
      }
    });

    el.btnUpdate.addEventListener('click', () => {
      const waiting = state.swReg?.waiting;
      if (waiting) waiting.postMessage('skipWaiting');
      setTimeout(() => location.reload(), 300);
    });
  }

  // ════════════════════════════════════════════════════════════════
  // INIT
  // ════════════════════════════════════════════════════════════════
  function init() {
    applyFontSize();
    updateLangLabel();
    applyFaceToFace();
    setupTabs();
    setupPTT();
    setupSettings();
    renderCategories();
    renderQuickPhrases();
    renderRecentSpoken();
    activateView('listen');
    setupHeaderScroll();
    setupKeyboardShortcuts();
    setupQuickActions();
    setupTipMic();
    setupF2F();

    // route from manifest shortcuts
    const params = new URLSearchParams(location.search);
    if (params.get('start') === 'listen') setTimeout(start, 200);
    if (params.get('view') === 'speak') activateView('speak');
    if (params.get('view') === 'sos') openSos();

    if (!localStorage.getItem('pauma-onboarded')) startOnboarding();

    // header
    el.btnLang.addEventListener('click', cycleLang);
    el.btnSos.addEventListener('click', openSos);

    // speak
    el.btnSpeak.addEventListener('click', () => {
      const t = el.speakText.value.trim();
      if (t) speak(t, el.btnSpeak);
    });
    el.btnSpeakClear.addEventListener('click', () => { el.speakText.value = ''; });
    el.btnAddPhrase.addEventListener('click', () => {
      const txt = prompt('Nueva frase para "' + (PHRASE_CATEGORIES.find(c => c.id === state.activeCategory)?.label || '') + '":');
      if (txt && txt.trim()) {
        if (!state.phrases[state.activeCategory]) state.phrases[state.activeCategory] = [];
        state.phrases[state.activeCategory].push(txt.trim().slice(0, 200));
        saveJSON('pauma-phrases', state.phrases);
        renderQuickPhrases();
      }
    });

    // history
    el.histSearch.addEventListener('input', (e) => {
      state.historySearch = e.target.value;
      el.searchClear.hidden = !e.target.value;
      renderHistory();
    });
    el.searchClear.addEventListener('click', () => {
      el.histSearch.value = '';
      state.historySearch = '';
      el.searchClear.hidden = true;
      el.histSearch.focus();
      renderHistory();
    });
    el.btnHistClear.addEventListener('click', () => {
      askConfirm({
        title: '¿Borrar todo el historial?',
        message: 'Se borrarán todas las conversaciones guardadas en este dispositivo. No se puede deshacer.',
        confirmLabel: 'Sí, borrar todo',
        onConfirm: async () => {
          await dbDeleteAll();
          renderHistory();
          feedbackToast('Historial borrado', 'ok');
        },
      });
    });

    // rename modal
    el.renameCancel.addEventListener('click', closeRenameSpeaker);
    el.renameSave.addEventListener('click', saveRenameSpeaker);
    el.renameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveRenameSpeaker(); });

    // session sheet
    el.sheetBack.addEventListener('click', closeSessionSheet);
    el.sheetTitle.addEventListener('blur', saveSheetTitle);
    el.sheetTitle.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.sheetTitle.blur(); } });
    el.sheetShare.addEventListener('click', shareSession);
    el.sheetDownload.addEventListener('click', downloadSession);
    el.sheetDelete.addEventListener('click', deleteSession);

    // SOS
    el.sosClose.addEventListener('click', closeSos);
    el.sosSpeak.addEventListener('click', sosSpeak);
    el.sosInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sosSpeak(); }
    });

    // onboarding
    el.obNext.addEventListener('click', nextOnboarding);
    el.obSkip.addEventListener('click', finishOnboarding);

    setupServiceWorker();
    setupInstallPrompt();
    setupConfirm();
    setStatus('Listo · pulsa el micrófono para empezar');
  }

  // ════════════════════════════════════════════════════════════════
  // CARA A CARA
  // ════════════════════════════════════════════════════════════════
  function applyFaceToFace() {
    document.body.classList.toggle('face-to-face', state.faceToFace);
    el.btnF2F.classList.toggle('active', state.faceToFace);
  }
  function toggleFaceToFace() {
    state.faceToFace = !state.faceToFace;
    localStorage.setItem('pauma-f2f', state.faceToFace ? '1' : '0');
    applyFaceToFace();
    feedbackToast(state.faceToFace ? 'Modo cara a cara activo' : 'Modo normal', 'ok');
    vibrate(20);
  }
  function setupF2F() {
    el.btnF2F.addEventListener('click', toggleFaceToFace);
  }

  // ════════════════════════════════════════════════════════════════
  // MODAL DE CONFIRMACION GENERICO
  // ════════════════════════════════════════════════════════════════
  let confirmCb = null;
  function askConfirm({ title, message, confirmLabel, onConfirm }) {
    confirmCb = onConfirm;
    el.confirmTitle.textContent = title || '¿Estás seguro?';
    el.confirmMsg.textContent = message || '';
    el.confirmOk.textContent = confirmLabel || 'Sí, hazlo';
    el.confirmModal.hidden = false;
  }
  function closeConfirm() {
    el.confirmModal.hidden = true;
    confirmCb = null;
  }
  function setupConfirm() {
    el.confirmOk.addEventListener('click', () => {
      const cb = confirmCb;
      closeConfirm();
      if (cb) cb();
    });
    el.confirmCancel.addEventListener('click', closeConfirm);
    el.confirmModal.addEventListener('click', (e) => {
      if (e.target === el.confirmModal) closeConfirm();
    });
  }

  // ════════════════════════════════════════════════════════════════
  // BACKUP / RESTORE
  // ════════════════════════════════════════════════════════════════
  async function exportAllData() {
    const data = {
      version: VERSION,
      exportedAt: new Date().toISOString(),
      localStorage: Object.fromEntries(
        Object.keys(localStorage)
          .filter(k => k.startsWith('pauma-'))
          .map(k => [k, localStorage.getItem(k)])
      ),
      sessions: [],
    };
    try { data.sessions = await dbGetSessions(); } catch (_) {}

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pauma-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    feedbackToast('Backup descargado', 'ok');
  }

  function importAllData() {
    el.importFile.click();
  }

  async function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object') throw new Error('formato');

      askConfirm({
        title: '¿Restaurar este backup?',
        message: 'Se reemplazarán todas las conversaciones, personas, frases y ajustes actuales con los del archivo.',
        confirmLabel: 'Sí, restaurar',
        onConfirm: async () => {
          // localStorage
          if (data.localStorage && typeof data.localStorage === 'object') {
            Object.keys(localStorage).filter(k => k.startsWith('pauma-')).forEach(k => localStorage.removeItem(k));
            for (const [k, v] of Object.entries(data.localStorage)) {
              if (typeof v === 'string') localStorage.setItem(k, v);
            }
          }
          // sessions
          if (Array.isArray(data.sessions)) {
            await dbDeleteAll();
            for (const s of data.sessions) {
              try { await dbPutSession(s); } catch (_) {}
            }
          }
          feedbackToast('Restaurado · recargando...', 'ok');
          setTimeout(() => location.reload(), 800);
        },
      });
    } catch (err) {
      feedbackToast('Archivo no válido', 'err');
    } finally {
      el.importFile.value = '';
    }
  }

  // ════════════════════════════════════════════════════════════════
  // HEADER SHADOW al scroll + TIP MIC primera vez
  // ════════════════════════════════════════════════════════════════
  function setupHeaderScroll() {
    el.views.forEach(v => {
      v.addEventListener('scroll', () => {
        el.appHeader.classList.toggle('scrolled', v.scrollTop > 4);
        el.scrollTop.classList.toggle('visible', v.scrollTop > 240);
      }, { passive: true });
    });
    el.scrollTop.addEventListener('click', () => {
      const active = document.querySelector('.view:not([hidden])');
      if (active) active.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function setupTipMic() {
    if (localStorage.getItem('pauma-first-listen') === '1') return;
    // primera visita: mostrar tip a los 4s si no ha pulsado el mic
    setTimeout(() => {
      if (!state.listening && state.view === 'listen') {
        el.tipMic.hidden = false;
        setTimeout(() => { el.tipMic.hidden = true; }, 6000);
      }
    }, 4000);
    el.tabMic.addEventListener('click', () => {
      el.tipMic.hidden = true;
      localStorage.setItem('pauma-first-listen', '1');
    }, { once: true });
  }

  // ════════════════════════════════════════════════════════════════
  // KEYBOARD SHORTCUTS
  // ════════════════════════════════════════════════════════════════
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const inEditable = e.target.matches('input, textarea, [contenteditable]');
      if (inEditable) {
        // ESC en input limpia/cierra
        if (e.key === 'Escape') {
          if (state.sosActive) closeSos();
          else if (!el.sheet.hidden) closeSessionSheet();
          else if (!el.modalRename.hidden) closeRenameSpeaker();
        }
        return;
      }

      if (e.key === ' ' && state.view === 'listen') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'Escape') {
        if (state.sosActive) closeSos();
        else if (!el.sheet.hidden) closeSessionSheet();
        else if (!el.modalRename.hidden) closeRenameSpeaker();
        else if (state.listening) stop();
      } else if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) {
        if (!state.sosActive) { e.preventDefault(); openSos(); }
      } else if (e.key === '/' && state.view === 'history') {
        e.preventDefault();
        el.histSearch.focus();
      }
    });
  }

  // ════════════════════════════════════════════════════════════════
  // QUICK ACTIONS setup
  // ════════════════════════════════════════════════════════════════
  function setupQuickActions() {
    el.qaMark.addEventListener('click', markCurrentMoment);
    el.qaRepeat.addEventListener('click', askToRepeat);
    el.qaSlower.addEventListener('click', askToSlowDown);
  }

  // ════════════════════════════════════════════════════════════════
  // PWA INSTALL PROMPT
  // ════════════════════════════════════════════════════════════════
  let deferredInstallPrompt = null;
  function setupInstallPrompt() {
    if (!el.installBanner) return;

    // ya está instalada
    if (window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true) {
      return;
    }
    if (localStorage.getItem('pauma-install-dismissed') === '1') return;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      // espera 8s para no agobiar nada más entrar
      setTimeout(() => {
        if (deferredInstallPrompt) el.installBanner.hidden = false;
      }, 8000);
    });

    el.installAccept.addEventListener('click', async () => {
      el.installBanner.hidden = true;
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') vibrate(40);
      deferredInstallPrompt = null;
    });
    el.installDismiss.addEventListener('click', () => {
      el.installBanner.hidden = true;
      localStorage.setItem('pauma-install-dismissed', '1');
    });

    window.addEventListener('appinstalled', () => {
      el.installBanner.hidden = true;
      deferredInstallPrompt = null;
      setStatus('Pauma instalada · listo', 'ok');
      vibrate([40, 40, 80]);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
