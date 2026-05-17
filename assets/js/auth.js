/* Maluap · auth.js
 * Magic link login opcional. Mantiene la sesion via cookie HttpOnly del servidor.
 * En cliente solo mostramos UI: pedir enlace, mostrar usuario logueado, logout.
 */
(() => {
  'use strict';

  const el = {
    section: document.getElementById('authSection'),
    statusBox: document.getElementById('authStatus'),
    emailInput: document.getElementById('authEmail'),
    btnLogin: document.getElementById('authLoginBtn'),
    btnLogout: document.getElementById('authLogoutBtn'),
    hint: document.getElementById('authHint'),
  };
  if (!el.section) return;

  async function refresh() {
    try {
      const r = await fetch('/api/me.php', { credentials: 'same-origin' });
      const data = await r.json();
      render(data);
    } catch {
      render({ logged_in: false });
    }
  }

  function render(state) {
    if (state.logged_in && state.user) {
      el.statusBox.innerHTML = `
        <p style="margin-bottom: var(--s-2)"><strong>Has iniciado sesión como:</strong></p>
        <p style="font-size: var(--fs-md); margin-bottom: var(--s-3)">${escapeHtml(state.user.email)}</p>
      `;
      el.emailInput.hidden = true;
      el.btnLogin.hidden = true;
      el.btnLogout.hidden = false;
      el.hint.textContent = 'Próximamente podrás sincronizar tus datos entre dispositivos. De momento, la sesión solo te identifica para feedback y notificaciones futuras.';
    } else {
      el.statusBox.innerHTML = '<p class="muted" style="margin-bottom: var(--s-3)">Iniciar sesión es <strong>opcional</strong>. La app funciona sin cuenta. Si entras, podrás (en el futuro) sincronizar entre tu móvil y tablet, recibir avisos importantes y mandar feedback con tu identidad.</p>';
      el.emailInput.hidden = false;
      el.btnLogin.hidden = false;
      el.btnLogout.hidden = true;
      el.hint.textContent = 'Te enviaremos un enlace al correo. No usamos contraseñas: cada vez te llega un enlace mágico que caduca en 10 minutos.';
    }
  }

  async function requestMagicLink() {
    const email = el.emailInput.value.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      el.hint.textContent = 'Introduce un correo válido.';
      el.hint.style.color = 'var(--listening)';
      return;
    }
    el.btnLogin.disabled = true;
    el.btnLogin.innerHTML = '<span class="spinner"></span> Enviando...';
    try {
      const r = await fetch('/api/login.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        credentials: 'same-origin',
      });
      const data = await r.json();
      if (r.ok && data.ok) {
        el.statusBox.innerHTML = `
          <div style="background: var(--accent-soft); padding: var(--s-4); border-radius: var(--r-md); border: 1px solid var(--accent)">
            <p><strong>✓ Te hemos enviado un enlace.</strong></p>
            <p style="margin-top: var(--s-2)">Revisa <strong>${escapeHtml(email)}</strong> y pulsa "Entrar a Maluap". El enlace caduca en 10 minutos.</p>
          </div>
        `;
        el.emailInput.hidden = true;
        el.btnLogin.hidden = true;
      } else {
        el.hint.textContent = data.message || 'No se pudo enviar el enlace. Inténtalo más tarde.';
        el.hint.style.color = 'var(--listening)';
        el.btnLogin.disabled = false;
        el.btnLogin.textContent = 'Reintentar';
      }
    } catch (err) {
      el.hint.textContent = 'Error de red. Inténtalo más tarde.';
      el.hint.style.color = 'var(--listening)';
      el.btnLogin.disabled = false;
      el.btnLogin.textContent = 'Reintentar';
    }
  }

  async function logout() {
    try {
      await fetch('/api/logout.php', { method: 'POST', credentials: 'same-origin' });
    } catch {}
    refresh();
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // login feedback al volver de /api/verify.php
  function showLoginFeedback() {
    const params = new URLSearchParams(location.search);
    const flag = params.get('login');
    if (!flag) return;
    const messages = {
      ok: { text: 'Sesión iniciada · bienvenida', kind: 'ok' },
      expired: { text: 'El enlace ya no es válido', kind: 'err' },
      invalid: { text: 'El enlace no es correcto', kind: 'err' },
      error: { text: 'Hubo un problema al iniciar sesión', kind: 'err' },
    };
    const m = messages[flag];
    if (m && typeof window.MaluapToast === 'function') {
      window.MaluapToast(m.text, m.kind);
    }
    history.replaceState({}, '', '/app/');
  }

  el.btnLogin.addEventListener('click', requestMagicLink);
  el.emailInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); requestMagicLink(); }
  });
  el.btnLogout.addEventListener('click', logout);

  refresh();
  showLoginFeedback();
})();
