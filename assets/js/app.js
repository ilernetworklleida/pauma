/* Pauma · app.js · v0.2
 * Transcripción en vivo con diarización, modo "yo hablo", historial, tono y onboarding.
 * Sin dependencias externas. Compatible con Chrome/Edge en Android y desktop.
 */
(() => {
  'use strict';

  // ════════════════════════════════════════════════════════════════
  // STATE
  // ════════════════════════════════════════════════════════════════
  const PALETTE_LEN = 8;
  const DEFAULT_PHRASES = [
    'Hola, soy sorda. ¿Puedes escribir aquí?',
    'Más despacio, por favor.',
    'No te entiendo, ¿puedes repetir?',
    'Por favor, mírame a los ojos cuando hablas.',
    'Gracias.',
  ];

  const state = {
    view: 'listen',
    lang: localStorage.getItem('pauma-lang') || 'es-ES',
    fontSize: localStorage.getItem('pauma-fontsize') || 'normal',
    showEmotion: localStorage.getItem('pauma-emotion') !== '0',
    saveHistory: localStorage.getItem('pauma-history') !== '0',

    listening: false,
    provider: null,      // 'deepgram' | 'webspeech'
    ws: null,
    audioCtx: null,
    micStream: null,
    audioProcessor: null,
    audioSource: null,
    webSpeech: null,
    wakeLock: null,
    keepAliveTimer: null,

    speakers: loadSpeakers(),
    currentSession: null,
    sessions: [],
    historyDb: null,

    interimEl: null,
    lastSegmentEl: null,
    lastSpeaker: null,

    phrases: loadPhrases(),
  };

  // ════════════════════════════════════════════════════════════════
  // DOM
  // ════════════════════════════════════════════════════════════════
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const el = {
    brandDot: $('#brand-dot'),
    btnLang: $('#btnLang'),
    langLabel: $('#langLabel'),
    statusLine: $('#statusLine'),

    transcript: $('#transcript'),
    welcome: $('#welcome'),

    views: $$('.view'),
    tabbar: $('.tabbar'),
    tabs: $$('.tab'),
    tabMic: $('#tabMic'),

    speakText: $('#speakText'),
    btnSpeak: $('#btnSpeak'),
    btnSpeakClear: $('#btnSpeakClear'),
    quickList: $('#quickList'),
    btnAddPhrase: $('#btnAddPhrase'),

    historyList: $('#historyList'),
    histEmpty: $('#histEmpty'),
    btnHistClear: $('#btnHistClear'),

    speakersList: $('#speakersList'),
    setEmotion: $('#setEmotion'),
    setHistory: $('#setHistory'),

    onboarding: $('#onboarding'),
    obSlides: $$('.ob-slide'),
    obDots: $$('.ob-dot'),
    obNext: $('#obNext'),
    obSkip: $('#obSkip'),

    modalRename: $('#modalRename'),
    renameInput: $('#renameInput'),
    renameCancel: $('#renameCancel'),
    renameSave: $('#renameSave'),
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
  const nowFull = () => new Date().toLocaleString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  const setStatus = (text, kind = '') => {
    el.statusLine.textContent = text || '';
    el.statusLine.className = 'status-line' + (kind ? ' ' + kind : '');
  };

  const escapeText = (s) => s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function loadSpeakers() {
    try {
      return JSON.parse(localStorage.getItem('pauma-speakers') || '{}');
    } catch { return {}; }
  }
  function saveSpeakers() {
    localStorage.setItem('pauma-speakers', JSON.stringify(state.speakers));
  }
  function loadPhrases() {
    try {
      const raw = localStorage.getItem('pauma-phrases');
      if (!raw) return [...DEFAULT_PHRASES];
      return JSON.parse(raw);
    } catch { return [...DEFAULT_PHRASES]; }
  }
  function savePhrases() {
    localStorage.setItem('pauma-phrases', JSON.stringify(state.phrases));
  }

  function speakerLabel(idx) {
    if (idx == null) return null;
    const entry = state.speakers[idx];
    if (entry && entry.name) return entry.name;
    return 'Persona ' + (Number(idx) + 1);
  }

  // ════════════════════════════════════════════════════════════════
  // STORAGE (IndexedDB para sesiones de historial)
  // ════════════════════════════════════════════════════════════════
  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('pauma', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('sessions')) {
          const s = db.createObjectStore('sessions', { keyPath: 'id' });
          s.createIndex('started', 'started');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbPutSession(session) {
    if (!state.historyDb) state.historyDb = await openDb();
    return new Promise((resolve, reject) => {
      const tx = state.historyDb.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').put(session);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbGetSessions() {
    if (!state.historyDb) state.historyDb = await openDb();
    return new Promise((resolve, reject) => {
      const out = [];
      const tx = state.historyDb.transaction('sessions', 'readonly');
      const store = tx.objectStore('sessions');
      const idx = store.index('started');
      idx.openCursor(null, 'prev').onsuccess = (e) => {
        const cur = e.target.result;
        if (cur) { out.push(cur.value); cur.continue(); }
        else resolve(out);
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbDeleteAllSessions() {
    if (!state.historyDb) state.historyDb = await openDb();
    return new Promise((resolve, reject) => {
      const tx = state.historyDb.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function newSession() {
    return {
      id: uuid(),
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
  // EMOTION (heurística ligera)
  // ════════════════════════════════════════════════════════════════
  const EMOTION_RULES = [
    { tag: 'irritado',  re: /(!{2,}|maldit|cabr|joder|qué\s+rabia|qué\s+coñazo)/i },
    { tag: 'alegre',    re: /(jajaja+|jeje+|qué\s+bien|me\s+encanta|guay|genial)/i },
    { tag: 'preocupado',re: /(no\s+sé|estoy\s+preocupad|me\s+da\s+miedo|qué\s+vamos\s+a\s+hacer)/i },
    { tag: 'cariñoso',  re: /(cariño|mi\s+amor|te\s+quiero|cielo|guapa|guapo)/i },
    { tag: 'duda',      re: /\?$/ },
  ];
  function detectEmotion(text) {
    if (!state.showEmotion || !text) return null;
    for (const r of EMOTION_RULES) {
      if (r.re.test(text)) return r.tag;
    }
    return null;
  }

  // ════════════════════════════════════════════════════════════════
  // TRANSCRIBE: Deepgram (WebSocket) + fallback Web Speech API
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

  function floatTo16BitPCM(float32) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out.buffer;
  }

  async function startDeepgram(cfg) {
    const params = new URLSearchParams(cfg.params);
    const url = cfg.ws_url + '?' + params.toString();
    const ws = new WebSocket(url, ['token', cfg.token]);
    state.ws = ws;

    return new Promise((resolve, reject) => {
      const fail = (err) => { cleanupAudio(); reject(err); };
      ws.onerror = () => fail(new Error('ws_error'));
      ws.onopen = async () => {
        try {
          state.micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
              sampleRate: 16000,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
          state.audioCtx = ctx;
          const source = ctx.createMediaStreamSource(state.micStream);
          state.audioSource = source;
          const processor = ctx.createScriptProcessor(4096, 1, 1);
          state.audioProcessor = processor;
          processor.onaudioprocess = (e) => {
            if (ws.readyState !== 1) return;
            const input = e.inputBuffer.getChannelData(0);
            ws.send(floatTo16BitPCM(input));
          };
          source.connect(processor);
          processor.connect(ctx.destination);

          // keep-alive: send empty keepalive every 8s
          state.keepAliveTimer = setInterval(() => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'KeepAlive' }));
            }
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
      if (alt.words && alt.words.length) {
        const counts = {};
        for (const w of alt.words) {
          if (w.speaker != null) counts[w.speaker] = (counts[w.speaker] || 0) + 1;
        }
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        if (top) speakerIdx = Number(top[0]);
      }

      if (isFinal) {
        addFinal(text, speakerIdx);
      } else {
        renderInterim(text, speakerIdx);
      }
    } else if (data.type === 'UtteranceEnd') {
      // marker, nothing to do; the next final will draw a new bubble
    } else if (data.type === 'Metadata') {
      // session info
    } else if (data.type === 'SpeechStarted') {
      // VAD started
    }
  }

  // ── Fallback Web Speech API ──
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function startWebSpeech() {
    if (!SR) throw new Error('webspeech_unsupported');
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = state.lang;
    r.maxAlternatives = 1;
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
        setStatus('Permiso de micrófono denegado', 'error');
        stop();
        return;
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
    hideWelcome();
    activateView('listen');

    state.currentSession = newSession();

    await requestWakeLock();

    // Try Deepgram first
    const cfg = await getProviderConfig();
    if (cfg && cfg.provider === 'deepgram' && cfg.token) {
      try {
        state.provider = 'deepgram';
        await startDeepgram(cfg);
        setStatus('Escuchando · alta calidad · identifica hablantes', 'ok');
        return;
      } catch (err) {
        console.warn('Deepgram failed, falling back to Web Speech', err);
      }
    }

    // Fallback to Web Speech API
    if (SR) {
      try {
        state.provider = 'webspeech';
        startWebSpeech();
        setStatus('Escuchando · modo básico (sin identificar hablantes)', 'warn');
        return;
      } catch (err) {
        setStatus('No se pudo iniciar la transcripción', 'error');
        await stop();
        return;
      }
    }

    setStatus('Tu navegador no es compatible. Usa Chrome o Edge.', 'error');
    await stop();
  }

  async function stop() {
    state.listening = false;
    clearInterval(state.keepAliveTimer);
    state.keepAliveTimer = null;
    el.brandDot.classList.remove('listening');
    el.tabMic.classList.remove('listening');
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
    cleanupAudio();
    releaseWakeLock();
    renderInterim('', null);

    await persistCurrentSession();
    state.currentSession = null;
    state.lastSpeaker = null;
    state.lastSegmentEl = null;
    setStatus('En pausa');
  }

  async function restart() {
    await stop();
    setTimeout(start, 200);
  }

  function cleanupAudio() {
    if (state.audioProcessor) { try { state.audioProcessor.disconnect(); } catch (_) {} state.audioProcessor = null; }
    if (state.audioSource) { try { state.audioSource.disconnect(); } catch (_) {} state.audioSource = null; }
    if (state.audioCtx) { try { state.audioCtx.close(); } catch (_) {} state.audioCtx = null; }
    if (state.micStream) {
      state.micStream.getTracks().forEach(t => t.stop());
      state.micStream = null;
    }
  }

  async function toggle() {
    if (state.listening) await stop();
    else await start();
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
    if (state.wakeLock) {
      state.wakeLock.release().catch(() => {});
      state.wakeLock = null;
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.listening && !state.wakeLock) {
      requestWakeLock();
    }
  });

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════
  function hideWelcome() { if (el.welcome) el.welcome.style.display = 'none'; }
  function showWelcome() { if (el.welcome) el.welcome.style.display = ''; }

  function scrollTranscript() {
    requestAnimationFrame(() => {
      el.transcript.scrollTop = el.transcript.scrollHeight;
    });
  }

  function renderInterim(text, speakerIdx) {
    if (!text) {
      if (state.interimEl) { state.interimEl.remove(); state.interimEl = null; }
      return;
    }
    if (!state.interimEl) {
      state.interimEl = document.createElement('div');
      state.interimEl.className = 'segment interim';
      el.transcript.appendChild(state.interimEl);
    }
    if (speakerIdx != null) state.interimEl.dataset.speaker = (speakerIdx % PALETTE_LEN);
    state.interimEl.textContent = text;
    scrollTranscript();
  }

  function addFinal(text, speakerIdx) {
    if (!text) return;
    renderInterim('', null);
    const emotion = detectEmotion(text);
    const time = nowHM();
    const speaker = speakerIdx != null ? Number(speakerIdx) : null;

    // group consecutive same-speaker into single bubble
    if (state.lastSegmentEl && state.lastSpeaker === speaker && (Date.now() - (state.lastSegmentEl._t || 0)) < 12000) {
      const span = state.lastSegmentEl.querySelector('.segment-text');
      span.appendChild(document.createTextNode(' ' + text));
      state.lastSegmentEl._t = Date.now();
      if (emotion) {
        const m = state.lastSegmentEl.querySelector('.segment-emotion');
        if (m) m.textContent = '(' + emotion + ')';
      }
    } else {
      const div = document.createElement('div');
      div.className = 'segment';
      if (speaker != null) div.dataset.speaker = (speaker % PALETTE_LEN);
      div._t = Date.now();

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
      t.className = 'segment-time';
      t.textContent = time;
      meta.appendChild(t);

      if (emotion) {
        const m = document.createElement('span');
        m.className = 'segment-emotion';
        m.textContent = '(' + emotion + ')';
        meta.appendChild(m);
      }

      const txt = document.createElement('span');
      txt.className = 'segment-text';
      txt.textContent = text;

      div.appendChild(meta);
      div.appendChild(txt);
      el.transcript.appendChild(div);
      state.lastSegmentEl = div;
      state.lastSpeaker = speaker;
    }

    if (state.currentSession) {
      state.currentSession.segments.push({ t: Date.now(), speaker, text, emotion });
      if (state.currentSession.segments.length % 5 === 0) {
        persistCurrentSession();
      }
    }

    scrollTranscript();
  }

  function clearTranscript() {
    el.transcript.querySelectorAll('.segment').forEach(n => n.remove());
    state.interimEl = null;
    state.lastSegmentEl = null;
    state.lastSpeaker = null;
    if (!state.listening) showWelcome();
  }

  // ════════════════════════════════════════════════════════════════
  // SPEAKERS (rename)
  // ════════════════════════════════════════════════════════════════
  let renameSpeakerIdx = null;
  function openRenameSpeaker(idx) {
    renameSpeakerIdx = idx;
    el.renameInput.value = state.speakers[idx]?.name || '';
    el.modalRename.hidden = false;
    setTimeout(() => el.renameInput.focus(), 50);
  }
  function closeRenameSpeaker() {
    el.modalRename.hidden = true;
    renameSpeakerIdx = null;
  }
  function saveRenameSpeaker() {
    if (renameSpeakerIdx == null) return;
    const name = el.renameInput.value.trim().slice(0, 20);
    if (!state.speakers[renameSpeakerIdx]) state.speakers[renameSpeakerIdx] = {};
    state.speakers[renameSpeakerIdx].name = name;
    saveSpeakers();
    refreshSpeakerLabels();
    renderSpeakersSettings();
    closeRenameSpeaker();
  }
  function refreshSpeakerLabels() {
    document.querySelectorAll('.segment-speaker').forEach(s => {
      const idx = Number(s.dataset.speaker);
      s.textContent = speakerLabel(idx);
    });
  }

  // ════════════════════════════════════════════════════════════════
  // TTS (modo "yo hablo")
  // ════════════════════════════════════════════════════════════════
  async function speak(text) {
    if (!text) return;
    el.btnSpeak.disabled = true;
    setStatus('Generando voz…');

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
        audio.onended = () => setStatus('');
        audio.onerror = () => fallbackTts(text);
        await audio.play();
        setStatus('Hablando…', 'ok');
      } else {
        fallbackTts(text);
      }
    } catch {
      fallbackTts(text);
    } finally {
      el.btnSpeak.disabled = false;
    }
  }

  function fallbackTts(text) {
    if (!('speechSynthesis' in window)) {
      setStatus('Tu navegador no permite leer en voz alta', 'error');
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = state.lang;
    u.rate = 1.0;
    u.pitch = 1.0;
    u.onend = () => setStatus('');
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    setStatus('Hablando…', 'ok');
  }

  function renderQuickPhrases() {
    el.quickList.innerHTML = '';
    state.phrases.forEach((p, i) => {
      const row = document.createElement('button');
      row.className = 'quick-item';
      row.type = 'button';

      const txt = document.createElement('span');
      txt.className = 'quick-item-text';
      txt.textContent = p;
      row.appendChild(txt);

      const del = document.createElement('span');
      del.className = 'quick-item-delete';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Borrar frase');
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        state.phrases.splice(i, 1);
        savePhrases();
        renderQuickPhrases();
      });
      row.appendChild(del);

      row.addEventListener('click', () => {
        el.speakText.value = p;
        speak(p);
      });
      el.quickList.appendChild(row);
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
      const isActive = target === view || (target === 'listen-view' && view === 'listen');
      t.classList.toggle('active', isActive && target !== 'listen');
    });
    if (view === 'history') renderHistory();
    if (view === 'settings') renderSpeakersSettings();
  }

  function setupTabs() {
    el.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.target;
        if (target === 'listen') { toggle(); }
        else if (target === 'listen-view') { activateView('listen'); }
        else { activateView(target); }
      });
    });
  }

  // ════════════════════════════════════════════════════════════════
  // HISTORY VIEW
  // ════════════════════════════════════════════════════════════════
  async function renderHistory() {
    let sessions = [];
    try { sessions = await dbGetSessions(); } catch (_) {}
    state.sessions = sessions;

    if (!sessions.length) {
      el.historyList.hidden = true;
      el.histEmpty.hidden = false;
      return;
    }
    el.historyList.hidden = false;
    el.histEmpty.hidden = true;
    el.historyList.innerHTML = '';

    for (const s of sessions) {
      const item = document.createElement('button');
      item.className = 'hist-item';
      item.type = 'button';

      const head = document.createElement('div');
      head.className = 'hist-item-head';
      const date = document.createElement('span');
      date.className = 'hist-item-date';
      date.textContent = new Date(s.started).toLocaleString('es-ES', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      });
      const meta = document.createElement('span');
      meta.className = 'hist-item-meta';
      const duration = s.ended ? Math.round((s.ended - s.started) / 60000) : 0;
      meta.textContent = `${s.segments.length} frases · ${duration} min`;
      head.appendChild(date);
      head.appendChild(meta);

      const preview = document.createElement('div');
      preview.className = 'hist-item-preview';
      preview.textContent = s.segments.slice(0, 3).map(seg => seg.text).join(' ');

      item.appendChild(head);
      item.appendChild(preview);
      item.addEventListener('click', () => openSessionDetail(s));
      el.historyList.appendChild(item);
    }
  }

  function openSessionDetail(session) {
    el.historyList.innerHTML = '';
    el.histEmpty.hidden = true;

    const back = document.createElement('div');
    back.className = 'hist-back';
    back.innerHTML = '← Volver';
    back.addEventListener('click', () => renderHistory());
    el.historyList.appendChild(back);

    const title = document.createElement('div');
    title.className = 'view-title';
    title.textContent = new Date(session.started).toLocaleString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    });
    el.historyList.appendChild(title);

    const wrap = document.createElement('div');
    wrap.className = 'hist-detail';
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
      div.appendChild(meta);
      div.appendChild(txt);
      wrap.appendChild(div);
    }
    el.historyList.appendChild(wrap);
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
      edit.className = 'speaker-edit';
      edit.type = 'button';
      edit.textContent = 'Cambiar';
      edit.addEventListener('click', () => openRenameSpeaker(Number(idx)));
      row.appendChild(swatch);
      row.appendChild(name);
      row.appendChild(edit);
      el.speakersList.appendChild(row);
    });
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
  // ONBOARDING
  // ════════════════════════════════════════════════════════════════
  let obIdx = 0;
  function startOnboarding() {
    el.onboarding.hidden = false;
    obIdx = 0;
    showObSlide(0);
  }
  function showObSlide(i) {
    obIdx = i;
    el.obSlides.forEach((s, idx) => { s.hidden = idx !== i; });
    el.obDots.forEach((d, idx) => d.classList.toggle('active', idx === i));
    el.obNext.textContent = i === el.obSlides.length - 1 ? 'Empezar' : 'Siguiente';
  }
  function nextOnboarding() {
    if (obIdx < el.obSlides.length - 1) {
      showObSlide(obIdx + 1);
    } else {
      finishOnboarding();
    }
  }
  function finishOnboarding() {
    el.onboarding.hidden = true;
    localStorage.setItem('pauma-onboarded', '1');
  }

  // ════════════════════════════════════════════════════════════════
  // INIT
  // ════════════════════════════════════════════════════════════════
  function init() {
    applyFontSize();
    updateLangLabel();
    setupTabs();
    setupSettings();
    renderQuickPhrases();
    activateView('listen');

    if (!localStorage.getItem('pauma-onboarded')) {
      startOnboarding();
    }

    el.btnLang.addEventListener('click', cycleLang);

    el.btnSpeak.addEventListener('click', () => {
      const t = el.speakText.value.trim();
      if (t) speak(t);
    });
    el.btnSpeakClear.addEventListener('click', () => { el.speakText.value = ''; });
    el.btnAddPhrase.addEventListener('click', () => {
      const txt = prompt('Nueva frase rápida:');
      if (txt && txt.trim()) {
        state.phrases.push(txt.trim().slice(0, 200));
        savePhrases();
        renderQuickPhrases();
      }
    });

    el.btnHistClear.addEventListener('click', async () => {
      if (!confirm('¿Borrar todo el historial? No se puede deshacer.')) return;
      await dbDeleteAllSessions();
      renderHistory();
    });

    el.renameCancel.addEventListener('click', closeRenameSpeaker);
    el.renameSave.addEventListener('click', saveRenameSpeaker);
    el.renameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveRenameSpeaker(); });

    el.obNext.addEventListener('click', nextOnboarding);
    el.obSkip.addEventListener('click', finishOnboarding);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    setStatus('Listo · pulsa el micrófono para empezar');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
