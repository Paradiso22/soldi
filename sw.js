/* sw.js - offline first */
'use strict';

const VERSION = 'soldi-39';
const ASSETS = [
  './',
  'index.html',
  'css/app.css?v=39',
  'js/db.js?v=39',
  'js/parser.js?v=39',
  'js/charts.js?v=39',
  'js/backup.js?v=39',
  'js/sync.js?v=39',
  'js/batti.js?v=39',
  'js/gate.js?v=39',
  'js/lock.js?v=39',
  'js/app.js?v=39',
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
  // Prima la rete (aggiornamenti immediati a ogni apertura), cache solo se offline.
  // cache:'reload' scavalca la cache HTTP del browser: GitHub Pages dichiara l'HTML
  // valido 10 minuti, e senza questo il browser serviva la versione vecchia anche
  // dopo aver cancellato i dati del sito.
  const fromNet = () => fetch(e.request.url, { cache: 'reload', credentials: 'same-origin' }).then(res => {
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
