(() => {
  'use strict';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  const STATE = {
    listening: false,
    lang: localStorage.getItem('pauma-lang') || 'es-ES',
    recognition: null,
    wakeLock: null,
    restartTimer: null,
    lastResultAt: 0,
  };

  const el = {
    brand: document.getElementById('brand-dot'),
    lang: document.getElementById('lang'),
    mic: document.getElementById('mic'),
    clear: document.getElementById('clear'),
    transcript: document.getElementById('transcript'),
    status: document.getElementById('status'),
    welcome: document.getElementById('welcome'),
  };

  let interimEl = null;

  function init() {
    if (!SR) {
      showUnsupported();
      return;
    }
    el.lang.value = STATE.lang;
    el.lang.addEventListener('change', onLangChange);
    el.mic.addEventListener('click', toggle);
    el.clear.addEventListener('click', clearTranscript);
    document.addEventListener('visibilitychange', onVisibility);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    setStatus('Listo');
  }

  function showUnsupported() {
    if (el.welcome) {
      el.welcome.innerHTML = `
        <p class="welcome-title">Navegador no compatible</p>
        <p class="welcome-sub">Pauma necesita Chrome o Edge para funcionar. En iPhone aún no está disponible porque Safari no soporta esta tecnología.</p>
        <p class="welcome-hint">Prueba abriendo este enlace en Chrome.</p>
      `;
    }
    el.mic.disabled = true;
    el.mic.setAttribute('aria-disabled', 'true');
    setStatus('No disponible');
  }

  function buildRecognition() {
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = STATE.lang;
    r.maxAlternatives = 1;
    r.onresult = onResult;
    r.onerror = onError;
    r.onend = onEnd;
    r.onspeechend = () => { /* keep going */ };
    return r;
  }

  function onResult(e) {
    STATE.lastResultAt = Date.now();
    let interimText = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      const text = result[0].transcript.trim();
      if (!text) continue;
      if (result.isFinal) {
        addFinal(text);
      } else {
        interimText += (interimText ? ' ' : '') + text;
      }
    }
    renderInterim(interimText);
  }

  function onError(e) {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      setStatus('Permiso denegado');
      stop();
      return;
    }
    if (e.error === 'audio-capture') {
      setStatus('Sin micrófono');
      stop();
      return;
    }
    setStatus('Error: ' + e.error);
  }

  function onEnd() {
    if (!STATE.listening) return;
    clearTimeout(STATE.restartTimer);
    STATE.restartTimer = setTimeout(() => {
      if (STATE.listening && STATE.recognition) {
        try { STATE.recognition.start(); } catch (_) {}
      }
    }, 200);
  }

  async function start() {
    if (STATE.listening) return;
    STATE.recognition = buildRecognition();
    STATE.listening = true;
    el.brand.classList.add('listening');
    el.mic.classList.add('listening');
    el.mic.setAttribute('aria-label', 'Pausar transcripción');
    setStatus('Escuchando');
    hideWelcome();
    await requestWakeLock();
    try {
      STATE.recognition.start();
    } catch (err) {
      setStatus('No se pudo iniciar');
      STATE.listening = false;
      el.brand.classList.remove('listening');
      el.mic.classList.remove('listening');
    }
  }

  function stop() {
    STATE.listening = false;
    clearTimeout(STATE.restartTimer);
    el.brand.classList.remove('listening');
    el.mic.classList.remove('listening');
    el.mic.setAttribute('aria-label', 'Empezar a escuchar');
    setStatus('En pausa');
    try { STATE.recognition?.stop(); } catch (_) {}
    releaseWakeLock();
    renderInterim('');
  }

  function toggle() {
    if (STATE.listening) stop(); else start();
  }

  function onLangChange(e) {
    STATE.lang = e.target.value;
    localStorage.setItem('pauma-lang', STATE.lang);
    if (STATE.listening) {
      stop();
      setTimeout(start, 250);
    }
  }

  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      STATE.wakeLock = await navigator.wakeLock.request('screen');
      STATE.wakeLock.addEventListener('release', () => { STATE.wakeLock = null; });
    } catch (_) {}
  }

  function releaseWakeLock() {
    if (STATE.wakeLock) {
      STATE.wakeLock.release().catch(() => {});
      STATE.wakeLock = null;
    }
  }

  function onVisibility() {
    if (document.visibilityState === 'visible' && STATE.listening && !STATE.wakeLock) {
      requestWakeLock();
    }
  }

  function addFinal(text) {
    if (!text) return;
    const time = nowHM();
    renderInterim('');
    const div = document.createElement('div');
    div.className = 'segment';
    const t = document.createElement('span');
    t.className = 'time';
    t.textContent = time;
    div.appendChild(t);
    div.appendChild(document.createTextNode(text));
    el.transcript.appendChild(div);
    scrollToBottom();
  }

  function renderInterim(text) {
    if (!text) {
      if (interimEl) { interimEl.remove(); interimEl = null; }
      return;
    }
    if (!interimEl) {
      interimEl = document.createElement('div');
      interimEl.className = 'segment interim';
      el.transcript.appendChild(interimEl);
    }
    interimEl.textContent = text;
    scrollToBottom();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      el.transcript.scrollTop = el.transcript.scrollHeight;
    });
  }

  function hideWelcome() {
    if (el.welcome) el.welcome.style.display = 'none';
  }

  function clearTranscript() {
    el.transcript.querySelectorAll('.segment').forEach(n => n.remove());
    interimEl = null;
    if (!STATE.listening && el.welcome) {
      el.welcome.style.display = '';
    }
  }

  function setStatus(text) {
    el.status.textContent = text;
  }

  function nowHM() {
    const d = new Date();
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
