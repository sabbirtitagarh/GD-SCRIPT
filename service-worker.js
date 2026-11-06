/**
 * GD SCRIPT – service worker
 *  • Pre-caches the app shell so the app opens offline.
 *  • HTML / JS / CSS: network first (so updates arrive quickly), cache as the offline fallback.
 *  • Images / icons: cache first.
 *  • Never touches cross-origin requests (the Google Apps Script API is always live).
 *  • A new version waits until the user taps “Reload” in the app (message SKIP_WAITING).
 * Bump VERSION on every release.
 */
const VERSION = '1.1.0';
const CACHE = 'gdscript-shell-' + VERSION;
const SHELL = [
  './', 'index.html', 'login.html', 'register.html', 'dashboard.html', 'editor.html', 'teleprompter.html', 'recording.html', 'settings.html',
  'manifest.json',
  'css/style.css', 'css/teleprompter.css',
  'js/config.js', 'js/lang-loader.js', 'js/app.js', 'js/i18n.js', 'js/lang/hi.js', 'js/lang/bn.js', 'js/lang/ur.js', 'js/scripts.js', 'js/home.js', 'js/auth.js', 'js/dashboard.js', 'js/editor.js', 'js/settings.js', 'js/branding.js', 'js/drive.js',
  'js/engine.js', 'js/voice-match.js', 'js/teleprompter.js', 'js/recording.js',
  'assets/logo.png', 'assets/icons/icon-96.png', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/favicon-32.png', 'assets/icons/favicon-16.png', 'assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // add one by one so a single missing file cannot break the whole install
    await Promise.all(SHELL.map((p) => cache.add(new Request(new URL(p, self.registration.scope).href, { cache: 'reload' })).catch(() => {})));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('gdscript-shell-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

async function networkFirst(request, ms) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(request), timeout(ms)]);
    if (res && res.ok && res.type === 'basic') cache.put(request, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (request.mode === 'navigate') {
      const fallback = await cache.match(new URL('index.html', self.registration.scope).href);
      if (fallback) return fallback;
    }
    return new Response('You are offline and this page has not been saved yet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok && res.type === 'basic') cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // API + Google calls go straight to the network
  if (req.headers.has('range')) return;                      // let the browser handle media ranges
  if (req.mode === 'navigate' || /\.(html|js|css|json)$/.test(url.pathname)) { event.respondWith(networkFirst(req, 4000)); return; }
  event.respondWith(cacheFirst(req).catch(() => caches.match(req)));
});
