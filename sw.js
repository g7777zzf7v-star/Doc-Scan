/* ماسح المستمسكات — service worker (offline + self-update)
   VERSION is replaced at build time with a hash of index.html, so every new
   upload changes this file and browsers install the new version automatically. */
var VERSION = '76c60e5af4';
var CORE = 'docscan-core-' + VERSION;
var RT = 'docscan-rt-v1';
var CORE_FILES = ['./', './index.html', './apple-touch-icon.png', './icon-192.png', './icon-512.png', './manifest.webmanifest'];
var RT_HOSTS = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CORE).then(function (c) {
    return c.addAll(CORE_FILES.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('docscan-core-') === 0 && k !== CORE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function timeout(ms) { return new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); }); }

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = req.url;

  // The app page: network first (always the newest version when online), cache when offline.
  if (req.mode === 'navigate') {
    e.respondWith(Promise.race([fetch(req, { cache: 'no-cache' }), timeout(6000)]).then(function (r) {
      if (r && r.ok) { var cp = r.clone(); caches.open(CORE).then(function (c) { c.put('./index.html', cp); }); }
      return r;
    }).catch(function () {
      return caches.open(CORE).then(function (c) { return c.match('./index.html').then(function (m) { return m || c.match('./'); }); });
    }));
    return;
  }

  // AI engine + model files (large, versioned by name): cache first, never re-download once stored.
  if (url.indexOf(self.registration.scope) === 0 && /\/(vendor|models)\//.test(url)) {
    e.respondWith(caches.open(RT).then(function (c) {
      return c.match(req).then(function (m) { return m || fetch(req).then(function (r) { if (r && r.ok) c.put(req, r.clone()); return r; }); });
    }));
    return;
  }

  // Own small files (icons, manifest): cache first, refresh in background.
  if (url.indexOf(self.registration.scope) === 0) {
    e.respondWith(caches.open(CORE).then(function (c) {
      return c.match(req, { ignoreSearch: true }).then(function (m) {
        var net = fetch(req).then(function (r) { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(function () { return m; });
        return m || net;
      });
    }));
    return;
  }

  // Fonts and versioned CDN libraries: cache after first use so they work offline later.
  if (RT_HOSTS.test(url)) {
    e.respondWith(caches.open(RT).then(function (c) {
      return c.match(req).then(function (m) {
        if (m) return m;
        return fetch(req).then(function (r) { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; });
      });
    }));
  }
});
