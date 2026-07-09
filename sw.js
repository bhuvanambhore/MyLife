/* ═══════════════════════════════════════════════════════════════
   MY LIFE OS v3.0 — SERVICE WORKER
   Strategy: Cache-First for app shell (HTML/CSS/JS/icons),
   Network-First for Google Fonts (graceful degradation to cached).
   All user data lives in localStorage — the SW only caches the
   app shell, never user data. This is intentional: data is managed
   exclusively by MLO.Storage in app.js.
═══════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'mylifeos-v3-shell-1';
const OFFLINE_URL = './index.html';

/* App shell — every file the app needs to render fully offline. */
const SHELL_ASSETS = [
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './components/utils.js',
  './components/charts.js',
  './components/toast.js',
  './components/modal.js',
  './modules/dashboard.js',
  './modules/habits.js',
  './modules/tasks.js',
  './modules/calendar.js',
  './modules/office.js',
  './modules/expenses.js',
  './modules/notes.js',
  './modules/mytube.js',
  './modules/links.js',
  './modules/health.js',
  './modules/goals.js',
  './modules/ai-assistant.js',
  './modules/analytics.js',
  './modules/backup.js',
  './modules/security.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

/* ── INSTALL: pre-cache the shell ──────────────────────────── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        SHELL_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Failed to cache:', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: delete old caches ───────────────────────────── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: cache-first for shell, network-first for fonts ─── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  /* Skip non-GET and cross-origin requests we can't cache */
  if (request.method !== 'GET') return;

  /* Google Fonts: network-first, fallback to cache */
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      fetch(request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(request, clone));
        return res;
      }).catch(() => caches.match(request))
    );
    return;
  }

  /* YouTube thumbnails: network-only (they change, and we don't
     want to fill up the cache with random thumbnail images) */
  if (url.hostname.includes('youtube.com') || url.hostname.includes('ytimg.com')) {
    return; // let browser handle normally
  }

  /* Everything else (app shell): cache-first */
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        /* Only cache same-origin successful responses */
        if (res.ok && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
        }
        return res;
      }).catch(() => {
        /* Fallback to index.html for navigation requests */
        if (request.mode === 'navigate') return caches.match(OFFLINE_URL);
      });
    })
  );
});

/* ── Background Sync stub (for future Android WebView push) ── */
self.addEventListener('sync', (event) => {
  /* No-op for now. Will be wired to push reminder notifications
     in the native Android wrapper. */
});
