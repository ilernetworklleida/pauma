/* Maluap · app.js · v0.3
 * Transcripción en vivo con diarización, modo "yo hablo", historial con buscador
 * y exportación, modo SOS, push-to-talk, estadísticas, onboarding y auto-update PWA.
 * Sin dependencias externas. Chrome/Edge Android y desktop.
 */
(() => {
  'use strict';

  // ════════════════════════════════════════════════════════════════
  // ONE-SHOT MIGRATION: pauma-* → maluap-* (v0.13 rename)
  // ════════════════════════════════════════════════════════════════
  (function migrateLegacyKeys() {
    try {
      if (localStorage.getItem('maluap-migrated-from-pauma') === '1') return;
      const moved = [];
      Object.keys(localStorage)
        .filter(k => k.startsWith('pauma-'))
        .forEach(k => {
          const newKey = 'maluap-' + k.slice('pauma-'.length);
          if (!localStorage.getItem(newKey)) {
            localStorage.setItem(newKey, localStorage.getItem(k));
          }
          localStorage.removeItem(k);
          moved.push(newKey);
        });
      localStorage.setItem('maluap-migrated-from-pauma', '1');
      if (moved.length) console.info('[maluap] migrated ' + moved.length + ' settings from pauma');
    } catch (_) {}
  })();

  // ════════════════════════════════════════════════════════════════
  // CONST + STATE
  // ════════════════════════════════════════════════════════════════
  const PALETTE_LEN = 8;
  const VERSION = 'v0.13';

  const PHRASE_CATEGORIES = [
    { id: 'general',    label: 'General' },
    { id: 'urgencia',   label: 'Urgencia' },
    { id: 'medico',     label: 'Médico' },
    { id: 'compras',    label: 'Compras' },
    { id: 'transporte', label: 'Transporte' },
    { id: 'social',     label: 'Social' },
    { id: 'tramites',   label: 'Trámites' },
    { id: 'trabajo',    label: 'Trabajo' },
    { id: 'casa',       label: 'Casa' },
  ];

  const DEFAULT_PHRASES = {
    general: [
      'Hola, soy sorda. ¿Puedes escribir aquí?',
      'Más despacio, por favor.',
      'No te entiendo, ¿puedes repetir?',
      'Por favor, mírame a los ojos cuando hablas.',
      'No tapes la boca cuando hablas, leo los labios.',
      'Escribe en este móvil, por favor.',
      'Gracias.',
      'Sí.',
      'No.',
    ],
    urgencia: [
      'Necesito ayuda urgente.',
      'Llama a una ambulancia, por favor.',
      'Soy sorda, no puedo oír las indicaciones por megafonía.',
      'Mi pareja también es sorda.',
      'Avisa a este contacto de emergencia: ',
      'No puedo hablar por teléfono. Escríbeme.',
    ],
    medico: [
      'Soy sorda. Por favor, escribe aquí lo que me digas.',
      '¿Me puedes explicar el tratamiento por escrito?',
      'No tengo alergias conocidas.',
      'Soy alérgica a: ',
      '¿Puedes ponerme la receta por escrito?',
      '¿Cuándo tengo la próxima cita?',
      'Necesito un intérprete de LSE para esta consulta.',
      '¿Me puedes apuntar la dosis y horario?',
    ],
    compras: [
      '¿Me puedes apuntar el precio aquí?',
      '¿Tenéis esto en otro color?',
      '¿Aceptáis tarjeta?',
      'No, gracias, solo estoy mirando.',
      '¿Me lo puedes envolver para regalo?',
      '¿Hay devolución si no me sirve?',
    ],
    transporte: [
      '¿A qué hora sale el siguiente?',
      'Por favor, escríbeme la dirección.',
      'Necesito que el conductor me avise cuando lleguemos.',
      '¿Puedes apuntarme el número de andén?',
      '¿En qué parada me bajo para ir a...?',
      'Hay retraso, ¿me lo puedes escribir?',
    ],
    social: [
      'Encantada de conocerte.',
      '¿Cómo te llamas?',
      '¿Te apetece tomar algo?',
      'Lo siento, no he entendido.',
      '¿Puedes repetir más despacio?',
      'Discúlpame, estoy leyendo lo que has dicho.',
    ],
    tramites: [
      'Necesito un intérprete de LSE para este trámite.',
      '¿Me podéis comunicar por correo o WhatsApp en vez de llamar?',
      'No tengo teléfono fijo donde se me pueda llamar.',
      '¿Puedo presentar esto por escrito?',
      '¿Qué documentos necesito traer?',
    ],
    trabajo: [
      'Soy sorda. Para reuniones, necesito que activéis los subtítulos en directo.',
      '¿Puedes ponerlo por escrito en el chat para que lo lea?',
      'Por favor, no habléis a la vez en la reunión.',
      'Necesito ver tu cara para leer los labios.',
      '¿Me reenvías un resumen por escrito al acabar?',
    ],
    casa: [
      'Han llamado al timbre.',
      'Avísame con una luz o con vibración, no con un grito.',
      'Si me llamas y no respondo, es porque no te oigo, no te ignoro.',
      '¿Me escribes lo que está sonando?',
    ],
  };

  const state = {
    view: 'listen',
    sosActive: false,
    sosOrigin: null, // a qué vista volver al cerrar SOS
    lang: localStorage.getItem('maluap-lang') || 'es-ES',
    fontSize: localStorage.getItem('maluap-fontsize') || 'normal',
    showEmotion: localStorage.getItem('maluap-emotion') !== '0',
    saveHistory: localStorage.getItem('maluap-history') !== '0',
    pushToTalk: localStorage.getItem('maluap-ptt') === '1',

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
    faceToFace: localStorage.getItem('maluap-f2f') === '1',
    myName: localStorage.getItem('maluap-my-name') || '',
    keywords: localStorage.getItem('maluap-keywords') || '',
    showNotice: localStorage.getItem('maluap-show-notice') !== '0',
    ttsPlaying: false,
    pass: loadJSON('maluap-pass', { name: '', languages: '', emergency: '', notes: '' }),
    presentationActive: false,
    sharedAudioBlob: null,

    speakers: loadJSON('maluap-speakers', {}),
    currentSession: null,
    historyDb: null,
    historySearch: '',

    interimEl: null,
    lastSegmentEl: null,
    lastSpeaker: null,

    phrases: loadJSON('maluap-phrases', { ...DEFAULT_PHRASES }),
    activeCategory: localStorage.getItem('maluap-cat') || 'general',
    recentSpoken: loadJSON('maluap-recent-spoken', []),

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
    setKeywords: $('#setKeywords'),
    setShowNotice: $('#setShowNotice'),
    noticeBanner: $('#noticeBanner'),
    noticeClose: $('#noticeClose'),
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

    btnShowPass: $('#btnShowPass'),
    passContent: $('#passContent'),
    passName: $('#passName'),
    passLanguages: $('#passLanguages'),
    passDetails: $('#passDetails'),
    passClose: $('#passClose'),
    passWrite: $('#passWrite'),

    passName_input: $('#passName_input'),
    passLanguages_input: $('#passLanguages_input'),
    passEmergency_input: $('#passEmergency_input'),
    passNotes_input: $('#passNotes_input'),
    btnOpenPass: $('#btnOpenPass'),
    btnPresentation: $('#btnPresentation'),

    presentation: $('#presentation'),
    presText: $('#presText'),
    presToggleMic: $('#presToggleMic'),
    presClose: $('#presClose'),

    sharedAudioModal: $('#sharedAudioModal'),
    sharedAudioPreview: $('#sharedAudioPreview'),
    sharedAudioResult: $('#sharedAudioResult'),
    sharedAudioCancel: $('#sharedAudioCancel'),
    sharedAudioTranscribe: $('#sharedAudioTranscribe'),

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

  // FIX iOS Safari: detectar y avisar limitaciones
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isIOSSafari = isIOS && isSafari;

  function feedbackToast(text, kind = '') {
    const t = document.createElement('div');
    t.className = 'feedback-toast' + (kind ? ' ' + kind : '');
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1900);
    // FIX a11y: anunciar a lectores de pantalla via aria-live
    const live = document.getElementById('liveRegion');
    if (live) {
      live.textContent = '';
      setTimeout(() => { live.textContent = text; }, 50);
    }
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
      const req = indexedDB.open('maluap', 2);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        if (!db.objectStoreNames.contains('sessions')) {
          const s = db.createObjectStore('sessions', { keyPath: 'id' });
          s.createIndex('started', 'started');
        }
      };
      req.onsuccess = async () => {
        try { await migrateLegacyDb(req.result); } catch (_) {}
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    });
  }
  function migrateLegacyDb(newDb) {
    return new Promise((resolve) => {
      if (localStorage.getItem('maluap-db-migrated') === '1') return resolve();
      try {
        const req = indexedDB.open('pauma', 2);
        req.onupgradeneeded = () => req.transaction?.abort?.();
        req.onerror = () => { localStorage.setItem('maluap-db-migrated', '1'); resolve(); };
        req.onsuccess = () => {
          const oldDb = req.result;
          if (!oldDb.objectStoreNames.contains('sessions')) {
            oldDb.close();
            localStorage.setItem('maluap-db-migrated', '1');
            return resolve();
          }
          const oldTx = oldDb.transaction('sessions', 'readonly');
          const rows = [];
          oldTx.objectStore('sessions').openCursor().onsuccess = (e) => {
            const cur = e.target.result;
            if (cur) { rows.push(cur.value); cur.continue(); }
            else {
              if (!rows.length) {
                oldDb.close();
                localStorage.setItem('maluap-db-migrated', '1');
                return resolve();
              }
              const tx = newDb.transaction('sessions', 'readwrite');
              const store = tx.objectStore('sessions');
              rows.forEach(r => store.put(r));
              tx.oncomplete = () => {
                oldDb.close();
                indexedDB.deleteDatabase('pauma');
                localStorage.setItem('maluap-db-migrated', '1');
                console.info('[maluap] migrated ' + rows.length + ' sessions from pauma DB');
                resolve();
              };
              tx.onerror = () => { oldDb.close(); resolve(); };
            }
          };
        };
      } catch (_) { resolve(); }
    });
  }
  async function dbPutSession(s) {
    if (!state.historyDb) state.historyDb = await openDb();
    return new Promise((res, rej) => {
      const tx = state.historyDb.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').put(s);
      tx.oncomplete = res;
      tx.onerror = () => {
        // FIX: quota exceeded → avisar al usuario una vez por sesion
        const err = tx.error;
        if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
          if (!state._quotaWarned) {
            state._quotaWarned = true;
            feedbackToast('Espacio lleno · borra historial antiguo', 'err');
          }
        }
        rej(err);
      };
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
    const kws = state.keywords
      .split(/[\n,]/)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 30);

    // 1) Clave Deepgram propia del usuario (BYO key) → conexion directa sin pasar por servidor
    const userKey = (localStorage.getItem('maluap-dg-key') || '').trim();
    if (userKey) {
      const params = {
        model: 'nova-2',
        language: lang,
        diarize: 'true',
        punctuate: 'true',
        smart_format: 'true',
        numerals: 'true',
        filler_words: 'false',
        interim_results: 'true',
        utterances: 'true',
        utterance_end_ms: '1000',
        vad_events: 'true',
        encoding: 'linear16',
        sample_rate: '16000',
        channels: '1',
        endpointing: '300',
      };
      const keywords = kws.slice(0, 30).map(k => k + ':2');
      return {
        provider: 'deepgram',
        token: userKey,
        key_id: null,
        expires_at: null,
        ws_url: 'wss://api.deepgram.com/v1/listen',
        params,
        keywords,
      };
    }

    // 2) Clave configurada en el servidor (.env)
    const qs = new URLSearchParams({ lang });
    for (const k of kws) qs.append('keyword', k);
    try {
      const res = await fetch('/api/token.php?' + qs.toString(), { credentials: 'same-origin' });
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
    if (Array.isArray(cfg.keywords)) {
      for (const kw of cfg.keywords) params.append('keywords', kw);
    }
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
          state.reconnectAttempts = (state.reconnectAttempts || 0) + 1;
          if (state.reconnectAttempts > 3) {
            setStatus('Sin conexión estable · pasando a modo básico', 'warn');
            state.reconnectAttempts = 0;
            stopInternal().then(() => {
              if (SR) {
                state.listening = true;
                el.brandDot.classList.add('listening');
                el.tabMic.classList.add('listening');
                try {
                  state.provider = 'webspeech';
                  startWebSpeech();
                  setQuality('basic', 'Modo básico tras fallo de red');
                  showQuickActions();
                } catch (_) { stop(); }
              }
            });
            return;
          }
          const delay = Math.min(1500 * state.reconnectAttempts, 8000);
          setStatus('Conexión cerrada. Reanudando…', 'warn');
          setTimeout(() => state.listening && restart(), delay);
        }
      };
    });
  }

  function handleDeepgramMessage(raw) {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    // FIX: manejar mensajes de error de Deepgram
    if (data.type === 'Error' || data.error) {
      console.warn('[deepgram error]', data);
      setStatus('Error del servicio · reintentando…', 'warn');
      return;
    }

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
  function postProcessWebSpeech(text) {
    if (!text) return text;
    let t = text.trim();
    t = t.charAt(0).toLocaleUpperCase('es-ES') + t.slice(1);
    if (!/[.!?…]$/.test(t)) t += '.';
    t = t.replace(/(^|[.!?]\s+)([a-záéíóúñü])/g, (_, sep, ch) => sep + ch.toLocaleUpperCase('es-ES'));
    return t;
  }
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
        if (res.isFinal) addFinal(postProcessWebSpeech(text), null);
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
        state.reconnectAttempts = 0;
        await startDeepgram(cfg);
        setStatus('Escuchando · alta calidad · identifica hablantes', 'ok');
        setQuality('high', 'Alta calidad · diarización activa');
        showQuickActions();
        showTranscribeNotice();
        return;
      } catch (err) {
        console.warn('Deepgram failed, fallback', err);
        cleanupAudio();
      }
    }
    if (SR) {
      try {
        state.provider = 'webspeech';
        startWebSpeech();
        setStatus('Escuchando · modo básico (sin identificar hablantes)', 'warn');
        setQuality('basic', 'Modo básico · sin identificar hablantes');
        showQuickActions();
        showTranscribeNotice();
        if (!localStorage.getItem('maluap-fallback-warned')) {
          localStorage.setItem('maluap-fallback-warned', '1');
          setTimeout(() => feedbackToast('Modo básico · calidad estándar del navegador', 'warn'), 1500);
        }
        return;
      } catch (err) {
        await stopInternal();
        setStatus('No se pudo iniciar (¿permiso de micrófono?)', 'error');
        feedbackToast('No se pudo activar el micrófono', 'err');
        return;
      }
    }
    // FIX iOS: mensaje claro segun navegador
    if (isIOSSafari) {
      setStatus('iPhone: la transcripción requiere conexión y permiso de micrófono', 'error');
      feedbackToast('En iPhone necesitas internet · revisa permisos', 'err');
    } else {
      setStatus('Tu navegador no es compatible. Usa Chrome o Edge.', 'error');
      feedbackToast('Navegador no compatible', 'err');
    }
    setQuality('error', 'No disponible');
    await stopInternal();
  }

  // versión sin vibrate ni "En pausa" para usar en errores de start()
  async function stopInternal() {
    state.listening = false;
    clearInterval(state.keepAliveTimer); state.keepAliveTimer = null;
    el.brandDot.classList.remove('listening');
    el.tabMic.classList.remove('listening');
    el.tabMic.classList.remove('ptt');
    el.tabMic.setAttribute('aria-label', 'Empezar a escuchar');
    if (state.ws) {
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
    state.currentSession = null;
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

  // FIX perf: limita DOM a 500 burbujas visibles. Datos completos en
  // currentSession + IndexedDB.
  const MAX_VISIBLE_SEGMENTS = 500;
  function pruneTranscriptIfNeeded() {
    const segs = el.transcript.querySelectorAll('.segment:not(.interim)');
    if (segs.length <= MAX_VISIBLE_SEGMENTS) return;
    const removeCount = segs.length - MAX_VISIBLE_SEGMENTS;
    for (let i = 0; i < removeCount; i++) {
      const n = segs[i];
      if (n === state.lastSegmentEl) state.lastSegmentEl = null;
      n.remove();
    }
  }

  // FIX perf: event delegation para taps en burbujas (1 listener total
  // en lugar de 2 por burbuja).
  function setupTranscriptDelegation() {
    el.transcript.addEventListener('click', (e) => {
      const speakerEl = e.target.closest('.segment-speaker');
      if (speakerEl) {
        const idx = Number(speakerEl.dataset.speaker);
        if (!Number.isNaN(idx)) openRenameSpeaker(idx);
        return;
      }
      const seg = e.target.closest('.segment');
      if (seg && !seg.classList.contains('interim')) copySegmentText(seg);
    });
  }

  function renderInterim(text, speakerIdx) {
    if (state.presentationActive) {
      appendToPresentation(text, false);
      return;
    }
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
    // Dedup: ignorar finales repetidos consecutivos (bug conocido Web Speech Android)
    const now = Date.now();
    const norm = text.replace(/[.,!?…]+$/g, '').trim().toLowerCase();
    if (state._lastFinalNorm === norm && (now - (state._lastFinalAt || 0)) < 4000) return;
    // Dedup: si el ultimo segmento del MISMO hablante termina exactamente con este texto, ignorar
    if (state.lastSegmentEl && state.lastSpeaker === (speakerIdx != null ? Number(speakerIdx) : null)) {
      const prevText = (state.lastSegmentEl.querySelector('.segment-text')?.textContent || '').toLowerCase();
      if (prevText && (prevText.endsWith(norm) || norm.length > 6 && prevText.includes(norm))) return;
    }
    state._lastFinalNorm = norm;
    state._lastFinalAt = now;

    renderInterim('', null);
    const emotion = detectEmotion(text);
    const nameMatch = detectName(text);
    const time = nowHM();
    const speaker = speakerIdx != null ? Number(speakerIdx) : null;

    // hook al modo presentación: muestra texto enorme
    if (state.presentationActive) {
      appendToPresentation(text, true);
      // tambien añadimos a sesion historica
      if (state.currentSession) {
        state.currentSession.segments.push({ t: Date.now(), speaker, text, emotion });
        if (state.currentSession.segments.length % 5 === 0) persistCurrentSession();
      }
      return;
    }

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
        // FIX perf: NO addEventListener por burbuja. Event delegation en init().
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
          // FIX perf: sin addEventListener, se maneja por delegation
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

        // FIX perf: pruning visual (no DB) si hay >500 burbujas visibles
        pruneTranscriptIfNeeded();
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
    saveJSON('maluap-speakers', state.speakers);
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
      // BYO key: si el usuario ha puesto su clave ElevenLabs, llamamos directo a ElevenLabs
      const userElKey = (localStorage.getItem('maluap-el-key') || '').trim();
      let res;
      if (userElKey) {
        const voiceId = '21m00Tcm4TlvDq8ikWAM'; // Rachel
        res = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId, {
          method: 'POST',
          headers: {
            'xi-api-key': userElKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.55, similarity_boost: 0.85, style: 0.0, use_speaker_boost: true },
          }),
        });
      } else {
        res = await fetch('/api/tts.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          credentials: 'same-origin',
        });
      }
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
      state.ttsPlaying = false; // FIX: liberar flag
      setStatus('Tu navegador no permite leer en voz alta', 'error');
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = state.lang; u.rate = 1.0; u.pitch = 1.0;
    state.ttsPlaying = true;
    u.onstart = () => { state.ttsPlaying = true; };
    u.onend = () => { state.ttsPlaying = false; setStatus(''); };
    // FIX: liberar flag siempre, incluso con error
    u.onerror = () => {
      state.ttsPlaying = false;
      setStatus('Error al leer en voz', 'warn');
      setTimeout(() => setStatus(''), 2000);
    };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    setStatus('Hablando…', 'ok');
  }
  function addToRecentSpoken(text) {
    const t = text.trim();
    if (!t) return;
    state.recentSpoken = [t, ...state.recentSpoken.filter(x => x !== t)].slice(0, 8);
    saveJSON('maluap-recent-spoken', state.recentSpoken);
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
        localStorage.setItem('maluap-cat', cat.id);
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
        saveJSON('maluap-phrases', state.phrases);
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
    // FIX UX: auto-focus en textareas al abrir vistas relevantes
    if (view === 'speak') setTimeout(() => el.speakText?.focus(), 100);
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
  function closeSessionSheet() {
    el.sheet.hidden = true;
    state.activeSessionDetailId = null;
    if (state.view === 'history') renderHistory(); // FIX: refrescar lista por si cambio el titulo
  }

  async function saveSheetTitle() {
    if (!state.activeSessionDetailId) return;
    const title = el.sheetTitle.textContent.trim().slice(0, 80);
    const s = await dbGetSession(state.activeSessionDetailId);
    if (!s) return;
    if (s.title === title) return; // FIX: no escribir si no cambio
    s.title = title;
    await dbPutSession(s);
    feedbackToast('Título guardado', 'ok');
  }

  function sessionToText(session) {
    const lines = [];
    lines.push(`Maluap · ${session.title?.trim() || fmtDate(session.started)}`);
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
    const title = session.title?.trim() || 'Conversación de Maluap';
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
    a.download = `maluap-${safeName}.txt`;
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
      hint.textContent = 'Aún no hay personas guardadas. Aparecerán aquí cuando Maluap las identifique.';
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
      // FIX: añadir boton borrar
      const del = document.createElement('button');
      del.className = 'speaker-edit'; del.type = 'button';
      del.textContent = 'Borrar';
      del.style.color = 'var(--listening)';
      del.addEventListener('click', () => {
        askConfirm({
          title: '¿Borrar esta persona?',
          message: `Maluap olvidará a "${speakerLabel(idx)}". La volverá a detectar si vuelve a hablar.`,
          confirmLabel: 'Borrar',
          onConfirm: () => {
            delete state.speakers[idx];
            saveJSON('maluap-speakers', state.speakers);
            renderSpeakersSettings();
            feedbackToast('Persona borrada', 'ok');
          },
        });
      });
      row.appendChild(swatch); row.appendChild(name); row.appendChild(edit); row.appendChild(del);
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
        localStorage.setItem('maluap-lang', state.lang);
        updateLangLabel();
        if (state.listening) restart();
      });
    });
    $$('input[name="fontsize"]').forEach(r => {
      r.checked = r.value === state.fontSize;
      r.addEventListener('change', () => {
        state.fontSize = r.value;
        localStorage.setItem('maluap-fontsize', state.fontSize);
        applyFontSize();
      });
    });
    el.setEmotion.checked = state.showEmotion;
    el.setEmotion.addEventListener('change', () => {
      state.showEmotion = el.setEmotion.checked;
      localStorage.setItem('maluap-emotion', state.showEmotion ? '1' : '0');
    });
    el.setHistory.checked = state.saveHistory;
    el.setHistory.addEventListener('change', () => {
      state.saveHistory = el.setHistory.checked;
      localStorage.setItem('maluap-history', state.saveHistory ? '1' : '0');
    });
    el.setPTT.checked = state.pushToTalk;
    el.setPTT.addEventListener('change', () => {
      state.pushToTalk = el.setPTT.checked;
      localStorage.setItem('maluap-ptt', state.pushToTalk ? '1' : '0');
    });

    el.setMyName.value = state.myName;
    el.setMyName.addEventListener('change', () => {
      state.myName = el.setMyName.value.trim();
      localStorage.setItem('maluap-my-name', state.myName);
    });

    el.setKeywords.value = state.keywords;
    el.setKeywords.addEventListener('change', () => {
      // FIX: sanitizar keywords antes de guardar
      const clean = el.setKeywords.value
        .split(/[\n,]/)
        .map(s => s.trim().replace(/[^\wáéíóúüñÁÉÍÓÚÜÑ '·\-]/g, '').slice(0, 60))
        .filter(s => s.length > 0)
        .slice(0, 30)
        .join('\n');
      state.keywords = clean;
      el.setKeywords.value = clean;
      localStorage.setItem('maluap-keywords', state.keywords);
      feedbackToast(clean ? 'Vocabulario guardado' : 'Vocabulario vacío', 'ok');
    });

    el.setShowNotice.checked = state.showNotice;
    el.setShowNotice.addEventListener('change', () => {
      state.showNotice = el.setShowNotice.checked;
      localStorage.setItem('maluap-show-notice', state.showNotice ? '1' : '0');
    });

    el.noticeClose.addEventListener('click', () => { el.noticeBanner.hidden = true; });

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
    localStorage.setItem('maluap-lang', state.lang);
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
    el.sosTranscript.innerHTML = '<span class="muted">Habla cerca del móvil. Maluap transcribirá automáticamente.</span>';
    activateView('sos');
    vibrate([60, 40, 60]);
    if (!state.listening) start();
    // FIX UX: focus en input SOS para que la persona escriba al instante
    setTimeout(() => el.sosInput?.focus(), 150);
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
    localStorage.setItem('maluap-onboarded', '1');
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
  // MALUAP PASS (tarjeta de identidad sorda)
  // ════════════════════════════════════════════════════════════════
  function renderPassDetails() {
    el.passName.textContent = state.pass.name || 'Maluap';
    el.passLanguages.textContent = state.pass.languages
      ? 'Hablo: ' + state.pass.languages
      : 'Comuníquese por escrito en este móvil';

    el.passDetails.innerHTML = '';
    const fields = [
      { label: 'Contacto de emergencia', value: state.pass.emergency },
      { label: 'Información útil', value: state.pass.notes },
    ];
    let hasContent = false;
    for (const f of fields) {
      if (!f.value || !f.value.trim()) continue;
      hasContent = true;
      const row = document.createElement('div');
      row.className = 'pass-detail-row';
      const lbl = document.createElement('span');
      lbl.className = 'pass-detail-label';
      lbl.textContent = f.label;
      const val = document.createElement('span');
      val.className = 'pass-detail-value';
      val.textContent = f.value;
      row.appendChild(lbl); row.appendChild(val);
      el.passDetails.appendChild(row);
    }
    if (!hasContent) {
      const hint = document.createElement('p');
      hint.className = 'muted';
      hint.style.fontSize = 'var(--fs-sm)';
      hint.style.textAlign = 'center';
      hint.textContent = 'Configura tu tarjeta en Ajustes para añadir contacto de emergencia e info útil.';
      el.passDetails.appendChild(hint);
    }
  }

  function openPass() {
    renderPassDetails();
    activateView('pass');
    requestWakeLock();
  }
  function closePass() {
    activateView('listen');
  }

  function setupPass() {
    // entradas en ajustes
    el.passName_input.value = state.pass.name || '';
    el.passLanguages_input.value = state.pass.languages || '';
    el.passEmergency_input.value = state.pass.emergency || '';
    el.passNotes_input.value = state.pass.notes || '';

    const savePass = () => {
      state.pass = {
        name: el.passName_input.value.trim().slice(0, 40),
        languages: el.passLanguages_input.value.trim().slice(0, 80),
        emergency: el.passEmergency_input.value.trim().slice(0, 60),
        notes: el.passNotes_input.value.trim().slice(0, 280),
      };
      saveJSON('maluap-pass', state.pass);
    };
    [el.passName_input, el.passLanguages_input, el.passEmergency_input, el.passNotes_input]
      .forEach(input => input.addEventListener('change', () => {
        savePass();
        feedbackToast('Tarjeta guardada', 'ok');
      }));

    el.btnOpenPass.addEventListener('click', openPass);
    el.btnShowPass.addEventListener('click', () => {
      closeSos();
      openPass();
    });
    el.passClose.addEventListener('click', closePass);
    el.passWrite.addEventListener('click', () => {
      closePass();
      openSos();
    });

    const passShareBtn = document.getElementById('passShare');
    if (passShareBtn) {
      passShareBtn.addEventListener('click', async () => {
        const p = state.pass;
        const lines = [
          p.name ? p.name : '',
          'Soy persona sorda.',
          p.languages ? 'Me comunico en: ' + p.languages : '',
          p.emergency ? 'Contacto de emergencia: ' + p.emergency : '',
          p.notes ? p.notes : '',
          'Comunícate por escrito conmigo.',
        ].filter(Boolean).join('\n');
        try {
          if (navigator.share) {
            await navigator.share({ title: 'Mi tarjeta · Maluap', text: lines });
          } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(lines);
            feedbackToast('Tarjeta copiada', 'ok');
          }
        } catch (_) {}
      });
    }
  }

  // ════════════════════════════════════════════════════════════════
  // MODO PRESENTACIÓN (ella habla -> audiencia lee texto grande)
  // ════════════════════════════════════════════════════════════════
  function openPresentation() {
    state.presentationActive = true;
    el.presentation.hidden = false;
    el.presText.innerHTML = '<span class="muted">Habla. Tu voz aparecerá aquí en grande para que todos te lean.</span>';
    requestWakeLock();
  }
  function closePresentation() {
    state.presentationActive = false;
    el.presentation.hidden = true;
    if (state.listening) stop();
  }
  function presentationToggleMic() {
    if (state.listening) {
      stop();
      el.presToggleMic.classList.remove('listening');
    } else {
      // empezar pero NO en vista listen
      startInPresentationMode();
    }
  }
  async function startInPresentationMode() {
    el.presToggleMic.classList.add('listening');
    el.presText.innerHTML = '<span class="muted">Escuchando…</span>';
    await start();
  }

  // Hook en addFinal y renderInterim para volcar a presentation si activa
  function appendToPresentation(text, isFinal) {
    if (!state.presentationActive) return;
    const muted = el.presText.querySelector('.muted');
    if (muted) muted.remove();
    if (isFinal) {
      const p = document.createElement('p');
      p.textContent = text;
      // limitar a 3 frases finales visibles
      el.presText.innerHTML = '';
      el.presText.appendChild(p);
    } else {
      const interim = el.presText.querySelector('p.interim');
      if (interim) {
        interim.textContent = text;
      } else {
        const p = document.createElement('p');
        p.className = 'interim';
        p.style.opacity = '0.6';
        p.textContent = text;
        el.presText.innerHTML = '';
        el.presText.appendChild(p);
      }
    }
  }

  function setupPresentation() {
    el.btnPresentation.addEventListener('click', openPresentation);
    el.presClose.addEventListener('click', closePresentation);
    el.presToggleMic.addEventListener('click', presentationToggleMic);
  }

  // ════════════════════════════════════════════════════════════════
  // AUDIO COMPARTIDO (share_target desde otras apps)
  // ════════════════════════════════════════════════════════════════
  async function checkSharedAudio() {
    const params = new URLSearchParams(location.search);
    if (params.get('shared') !== 'audio') return;
    try {
      const cache = await caches.open('maluap-shared');
      const res = await cache.match('/_shared/audio');
      if (!res) return;
      const blob = await res.blob();
      await cache.delete('/_shared/audio');
      // limpiar la query string
      history.replaceState({}, '', '/app/');
      state.sharedAudioBlob = blob;
      el.sharedAudioPreview.src = URL.createObjectURL(blob);
      el.sharedAudioResult.innerHTML = '';
      el.sharedAudioModal.hidden = false;
    } catch (err) {
      console.warn('shared audio error', err);
    }
  }

  async function transcribeSharedAudio() {
    if (!state.sharedAudioBlob) return;
    el.sharedAudioTranscribe.disabled = true;
    el.sharedAudioResult.innerHTML = '<p class="muted"><span class="spinner"></span> Transcribiendo… esto puede tardar unos segundos.</p>';
    try {
      const lang = state.lang.startsWith('ca') ? 'ca' : state.lang.startsWith('en') ? 'en' : 'es';
      const res = await fetch('/api/transcribe-file.php?lang=' + lang, {
        method: 'POST',
        headers: { 'Content-Type': state.sharedAudioBlob.type || 'audio/mpeg' },
        body: state.sharedAudioBlob,
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error('http_' + res.status);
      const data = await res.json();
      renderSharedAudioResult(data);
    } catch (err) {
      el.sharedAudioResult.innerHTML = '<p style="color: var(--listening)">No se pudo transcribir el audio. Revisa tu conexión.</p>';
    } finally {
      el.sharedAudioTranscribe.disabled = false;
    }
  }

  function renderSharedAudioResult(dgData) {
    const alt = dgData?.results?.channels?.[0]?.alternatives?.[0];
    const summary = dgData?.results?.summary?.short || dgData?.results?.summary?.result?.summary;
    const transcript = alt?.transcript || '';
    if (!transcript) {
      el.sharedAudioResult.innerHTML = '<p class="muted">No se ha detectado voz en el audio.</p>';
      return;
    }
    const html = [];
    if (summary) {
      html.push(`<div class="segment" style="background:var(--accent-soft); border-left-color:var(--accent); margin-bottom:var(--s-3)">
        <div class="segment-meta"><span class="segment-speaker" style="color:var(--accent)">Resumen</span></div>
        <span class="segment-text">${escapeHtml(summary)}</span>
      </div>`);
    }
    html.push(`<div class="segment">
      <div class="segment-meta"><span class="segment-speaker">Transcripción</span></div>
      <span class="segment-text">${escapeHtml(transcript)}</span>
    </div>`);
    html.push(`<div style="margin-top: var(--s-3); display:flex; gap: var(--s-2); flex-wrap: wrap">
      <button class="btn-text" id="copySharedTranscript" type="button">Copiar texto</button>
    </div>`);
    el.sharedAudioResult.innerHTML = html.join('');
    document.getElementById('copySharedTranscript')?.addEventListener('click', () => {
      navigator.clipboard.writeText(transcript).then(() => feedbackToast('Copiado', 'ok'));
    });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function closeSharedAudio() {
    el.sharedAudioModal.hidden = true;
    if (state.sharedAudioBlob) {
      state.sharedAudioBlob = null;
      try { URL.revokeObjectURL(el.sharedAudioPreview.src); } catch (_) {}
    }
  }

  function setupSharedAudio() {
    el.sharedAudioCancel.addEventListener('click', closeSharedAudio);
    el.sharedAudioTranscribe.addEventListener('click', transcribeSharedAudio);
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

    if (!localStorage.getItem('maluap-onboarded')) startOnboarding();

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
        saveJSON('maluap-phrases', state.phrases);
        renderQuickPhrases();
      }
    });

    // history
    // FIX: visibility correcta del clear al cargar (por si hay valor previo)
    el.searchClear.hidden = !el.histSearch.value;
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
    // FIX: Enter solo = nueva linea; Ctrl/Cmd/Shift+Enter = leer
    el.sosInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || e.shiftKey)) {
        e.preventDefault();
        sosSpeak();
      }
    });

    // onboarding
    el.obNext.addEventListener('click', nextOnboarding);
    el.obSkip.addEventListener('click', finishOnboarding);

    setupServiceWorker();
    setupInstallPrompt();
    setupConfirm();
    setupTranscriptDelegation();
    setupBeforeUnload();
    setupPass();
    setupPresentation();
    setupSharedAudio();
    checkSharedAudio();
    setupApiKeys();
    setupSoundWatch();
    // Expose toast for auth.js / other modules
    window.MaluapToast = feedbackToast;
    setStatus('Listo · pulsa el micrófono para empezar');
  }

  // ════════════════════════════════════════════════════════════════
  // BYO API KEYS (Deepgram + ElevenLabs guardadas localmente)
  // ════════════════════════════════════════════════════════════════
  function setupApiKeys() {
    const dgKey = document.getElementById('setDgKey');
    const dgProject = document.getElementById('setDgProject');
    const elKey = document.getElementById('setElKey');
    const btnSave = document.getElementById('btnSaveKeys');
    const btnClear = document.getElementById('btnClearKeys');
    const status = document.getElementById('keysStatus');
    if (!dgKey || !btnSave) return;

    const masked = (s) => s ? s.slice(0, 4) + '••••••••' + s.slice(-4) : '';
    const renderStatus = () => {
      const dk = localStorage.getItem('maluap-dg-key');
      const ek = localStorage.getItem('maluap-el-key');
      if (!dk && !ek) {
        status.textContent = '○ Sin claves · modo básico activo';
        status.style.color = 'var(--text-dim)';
      } else {
        const parts = [];
        if (dk) parts.push('✓ Deepgram: ' + masked(dk));
        if (ek) parts.push('✓ ElevenLabs: ' + masked(ek));
        status.innerHTML = parts.join('<br>');
        status.style.color = 'var(--success, #34d399)';
      }
    };

    dgKey.value = localStorage.getItem('maluap-dg-key') || '';
    dgProject.value = localStorage.getItem('maluap-dg-project') || '';
    elKey.value = localStorage.getItem('maluap-el-key') || '';
    renderStatus();

    btnSave.addEventListener('click', () => {
      const dk = dgKey.value.trim();
      const dp = dgProject.value.trim();
      const ek = elKey.value.trim();
      if (dk) localStorage.setItem('maluap-dg-key', dk); else localStorage.removeItem('maluap-dg-key');
      if (dp) localStorage.setItem('maluap-dg-project', dp); else localStorage.removeItem('maluap-dg-project');
      if (ek) localStorage.setItem('maluap-el-key', ek); else localStorage.removeItem('maluap-el-key');
      feedbackToast('Claves guardadas en este móvil', 'ok');
      renderStatus();
    });

    btnClear.addEventListener('click', () => {
      askConfirm({
        title: '¿Borrar las claves API?',
        message: 'Quedarás en modo básico (Web Speech) hasta que pegues claves nuevas.',
        confirmLabel: 'Sí, borrar',
        onConfirm: () => {
          localStorage.removeItem('maluap-dg-key');
          localStorage.removeItem('maluap-dg-project');
          localStorage.removeItem('maluap-el-key');
          dgKey.value = ''; dgProject.value = ''; elKey.value = '';
          renderStatus();
          feedbackToast('Claves borradas', 'ok');
        },
      });
    });
  }

  // ════════════════════════════════════════════════════════════════
  // VIGILANTE DE SONIDOS (alerta haptica + visual ante sonidos fuertes)
  // ════════════════════════════════════════════════════════════════
  function setupSoundWatch() {
    const toggle = document.getElementById('setWatchEnabled');
    const status = document.getElementById('watchStatus');
    if (!toggle) return;

    state.watch = state.watch || { active: false, ctx: null, stream: null, raf: null, consecutive: 0, alertedAt: 0 };

    toggle.checked = localStorage.getItem('maluap-watch') === '1';
    updateWatchStatus();

    toggle.addEventListener('change', async () => {
      if (toggle.checked) {
        localStorage.setItem('maluap-watch', '1');
        const ok = await startSoundWatch();
        if (!ok) { toggle.checked = false; localStorage.removeItem('maluap-watch'); }
        updateWatchStatus();
      } else {
        localStorage.removeItem('maluap-watch');
        stopSoundWatch();
        updateWatchStatus();
      }
    });

    // Auto-arrancar si estaba activo
    if (toggle.checked) {
      setTimeout(() => { startSoundWatch().then(updateWatchStatus); }, 800);
    }

    function updateWatchStatus() {
      if (state.watch.active) {
        status.textContent = '● Vigilando · te avisaremos con vibración y parpadeo';
        status.style.color = 'var(--success, #34d399)';
      } else if (toggle.checked) {
        status.textContent = '⚠ No se pudo activar (¿permiso de micrófono?)';
        status.style.color = 'var(--listening, #ef4444)';
      } else {
        status.textContent = '○ Desactivado';
        status.style.color = 'var(--text-dim)';
      }
    }
  }

  async function startSoundWatch() {
    if (state.watch.active) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      state.watch.active = true;
      state.watch.stream = stream;
      state.watch.ctx = ctx;
      state.watch.consecutive = 0;
      state.watch.alertedAt = 0;

      const THRESHOLD = 50; // amplitud sobre el centro (128) tras escalar
      const FRAMES_TO_ALERT = 12; // ~200ms de sonido fuerte sostenido

      const tick = () => {
        if (!state.watch.active) return;
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i++) {
          const v = Math.abs(data[i] - 128);
          if (v > peak) peak = v;
        }
        if (peak > THRESHOLD) {
          state.watch.consecutive++;
          if (state.watch.consecutive >= FRAMES_TO_ALERT) {
            const now = Date.now();
            if (now - state.watch.alertedAt > 3000) {
              triggerSoundAlert(peak);
              state.watch.alertedAt = now;
            }
            state.watch.consecutive = 0;
          }
        } else {
          state.watch.consecutive = Math.max(0, state.watch.consecutive - 1);
        }
        state.watch.raf = requestAnimationFrame(tick);
      };
      tick();
      return true;
    } catch (err) {
      console.warn('SoundWatch start failed', err);
      state.watch.active = false;
      return false;
    }
  }

  function stopSoundWatch() {
    if (state.watch.raf) cancelAnimationFrame(state.watch.raf);
    if (state.watch.stream) state.watch.stream.getTracks().forEach(t => t.stop());
    if (state.watch.ctx) { try { state.watch.ctx.close(); } catch (_) {} }
    state.watch = { active: false, ctx: null, stream: null, raf: null, consecutive: 0, alertedAt: 0 };
  }

  function triggerSoundAlert(peak) {
    vibrate([200, 80, 200, 80, 400, 80, 200]);
    feedbackToast('🔔 Sonido fuerte detectado', 'warn');
    document.body.classList.add('flash-alert');
    setTimeout(() => document.body.classList.remove('flash-alert'), 1600);
  }

  // ════════════════════════════════════════════════════════════════
  // BEFORE UNLOAD: aviso si cierra con transcripcion activa
  // ════════════════════════════════════════════════════════════════
  function setupBeforeUnload() {
    window.addEventListener('beforeunload', (e) => {
      if (state.listening && state.currentSession?.segments?.length > 0) {
        // Intentar persistir sincronamente antes de cerrar
        try { persistCurrentSession(); } catch (_) {}
        // Aviso al usuario (el texto exacto lo controla el navegador)
        e.preventDefault();
        e.returnValue = 'Hay una transcripción en curso. ¿Cerrar igualmente?';
        return e.returnValue;
      }
    });
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
    localStorage.setItem('maluap-f2f', state.faceToFace ? '1' : '0');
    applyFaceToFace();
    feedbackToast(state.faceToFace ? 'Modo cara a cara activo' : 'Modo normal', 'ok');
    vibrate(20);
  }
  function setupF2F() {
    el.btnF2F.addEventListener('click', toggleFaceToFace);
  }

  // ════════════════════════════════════════════════════════════════
  // NOTICE BANNER (aviso transcripcion)
  // ════════════════════════════════════════════════════════════════
  function showTranscribeNotice() {
    if (!state.showNotice) return;
    el.noticeBanner.hidden = false;
    setTimeout(() => { el.noticeBanner.hidden = true; }, 5000);
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
          .filter(k => k.startsWith('maluap-'))
          .map(k => [k, localStorage.getItem(k)])
      ),
      sessions: [],
    };
    try { data.sessions = await dbGetSessions(); } catch (_) {}

    const json = JSON.stringify(data, null, 2);
    const filename = `maluap-backup-${new Date().toISOString().slice(0,10)}.json`;
    const blob = new Blob([json], { type: 'application/json' });

    // FIX: si Share API soporta archivos, ofrecer compartir directo
    // (a Drive, email, WhatsApp...). Si no, descarga local.
    if (navigator.canShare) {
      const file = new File([blob], filename, { type: 'application/json' });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'Backup de Maluap',
            text: 'Mis datos de Maluap a fecha de ' + new Date().toLocaleDateString('es-ES'),
          });
          feedbackToast('Backup compartido', 'ok');
          return;
        } catch (err) {
          if (err.name === 'AbortError') return; // canceló el share
          // si falla, cae al download local
        }
      }
    }

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
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
            Object.keys(localStorage).filter(k => k.startsWith('maluap-')).forEach(k => localStorage.removeItem(k));
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
    if (localStorage.getItem('maluap-first-listen') === '1') return;
    // FIX: no mostrar tip si la pagina esta en segundo plano
    setTimeout(() => {
      if (!state.listening && state.view === 'listen' && document.visibilityState === 'visible') {
        el.tipMic.hidden = false;
        setTimeout(() => { el.tipMic.hidden = true; }, 6000);
      }
    }, 4000);
    el.tabMic.addEventListener('click', () => {
      el.tipMic.hidden = true;
      localStorage.setItem('maluap-first-listen', '1');
    }, { once: true });
  }

  // ════════════════════════════════════════════════════════════════
  // KEYBOARD SHORTCUTS
  // ════════════════════════════════════════════════════════════════
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const inEditable = e.target.matches('input, textarea, [contenteditable], select');
      const inButton = e.target.tagName === 'BUTTON';
      // SPACE en boton: dejar comportamiento nativo (activar el boton)
      if (inButton && (e.key === ' ' || e.key === 'Enter')) return;
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
    if (localStorage.getItem('maluap-install-dismissed') === '1') return;

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
      localStorage.setItem('maluap-install-dismissed', '1');
    });

    window.addEventListener('appinstalled', () => {
      el.installBanner.hidden = true;
      deferredInstallPrompt = null;
      setStatus('Maluap instalada · listo', 'ok');
      vibrate([40, 40, 80]);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
