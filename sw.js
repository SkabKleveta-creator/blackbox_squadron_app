/* BLACKBOX SQUADRON v0.5.0 — atomic, scoped offline app shell. */
'use strict';
const VERSION = 'v0.5.0-r2';
const SCOPE = new URL(self.registration.scope);
const CACHE_PREFIX = 'blackbox-squadron:' + encodeURIComponent(SCOPE.pathname) + ':';
const CACHE_NAME = CACHE_PREFIX + VERSION;
const SHELL_PATHS = [
  './', './index.html', './css/game.css', './js/game.js', './js/campaign.js',
  './js/presentation.js', './js/platform.js', './js/ui.js', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-512-maskable.png', './icons/apple-touch-icon.png'
];
const SHELL_URLS = SHELL_PATHS.map(path => new URL(path, SCOPE).href);
const SHELL = new Set(SHELL_URLS);
self.addEventListener('install', event => {
  // A missing file rejects installation; the prior complete version remains usable.
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_URLS.map(url => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) await caches.delete(key);
      // Migrate old releases only when every cached request belongs to this game.
      if (/^blackbox-squadron-v\d/.test(key)) {
        const cache = await caches.open(key), requests = await cache.keys();
        if (requests.length && requests.every(request => { const u = new URL(request.url); return u.origin === SCOPE.origin && u.pathname.startsWith(SCOPE.pathname); })) await caches.delete(key);
      }
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  url.search = ''; url.hash = '';
  if (!SHELL.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url.href);
    if (cached) return cached;
    // Only a successful same-origin response may repair an evicted cache entry.
    try {
      const response = await fetch(request);
      if (response.ok && response.type !== 'opaque') await cache.put(url.href, response.clone());
      return response;
    } catch (_) {
      if (request.mode === 'navigate') {
        const fallback = await cache.match(new URL('./index.html', SCOPE).href);
        if (fallback) return fallback;
      }
      return new Response('BLACKBOX SQUADRON is not cached yet. Reconnect once to finish installation.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
