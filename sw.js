/* sw.js - offline first */
'use strict';

const VERSION = 'soldi-v18';
const ASSETS = [
  './',
  'index.html',
  'css/app.css',
  'js/db.js',
  'js/parser.js',
  'js/charts.js',
  'js/backup.js',
  'js/sync.js',
  'js/app.js',
  'fonts/baloo2-latin.woff2',
  'fonts/nunito-latin.woff2',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Gemini & co: rete diretta
  // prima la rete (aggiornamenti immediati a ogni apertura), cache solo se offline
  const fromNet = () => fetch(e.request).then(res => {
    if (res.ok) {
      const clone = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, clone));
    }
    return res;
  });
  const fromCache = () => caches.match(e.request, { ignoreSearch: true });
  e.respondWith(
    fromNet().catch(() => fromCache().then(h => h || caches.match('index.html')))
  );
});
