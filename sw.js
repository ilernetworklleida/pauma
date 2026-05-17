const CACHE = 'maluap-v0-13-0';
const SHELL = [
  '/',
  '/app/',
  '/privacidad.html',
  '/404.html',
  '/assets/css/style.css',
  '/assets/js/app.js',
  '/assets/js/auth.js',
  '/assets/icons/icon.svg',
  '/assets/icons/og.svg',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
     .then(() => broadcast({ type: 'sw-activated', version: CACHE }))
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting' || event.data?.type === 'skipWaiting') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    if (request.method === 'POST' && new URL(request.url).pathname === '/app/') {
      event.respondWith(handleShareTarget(request));
    }
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

async function handleShareTarget(request) {
  try {
    const form = await request.formData();
    const file = form.get('audio');
    if (file && file instanceof File) {
      const buf = await file.arrayBuffer();
      await caches.open('maluap-shared').then(c =>
        c.put('/_shared/audio', new Response(buf, {
          headers: { 'Content-Type': file.type || 'audio/mpeg' }
        }))
      );
    }
  } catch (_) {}
  return Response.redirect('/app/?shared=audio', 303);
}

function broadcast(msg) {
  return self.clients.matchAll().then(list => list.forEach(c => c.postMessage(msg)));
}
