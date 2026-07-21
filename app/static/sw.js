/* BrickGains service worker — installability + light offline, safe for a live-data app.
   - /api/* : never cached (always live prices/portfolio)
   - navigations & CSS/JS : network-first (fresh), cache only as offline fallback
   - images/fonts : cache-first with background refresh */
var VERSION = 'bg-cache-v1';
var CORE = ['/', '/styles.css', '/main.js', '/icon-192.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) { return c.addAll(CORE).catch(function () {}); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (x) { return; }
  if (url.origin !== location.origin) return;        // leave cross-origin (analytics, Google, Stripe) alone
  if (url.pathname.indexOf('/api/') === 0) return;   // live data → straight to network

  // navigations: network-first, fall back to cached home when offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(function () { return caches.match(req).then(function (m) { return m || caches.match('/'); }); }));
    return;
  }

  // CSS/JS: network-first (always fresh after a deploy), cache as offline fallback
  if (/\.(css|js)$/i.test(url.pathname)) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.status === 200) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }

  // images/fonts: cache-first with background refresh (rarely change, fast)
  if (/\.(png|jpg|jpeg|webp|gif|svg|ico|woff2?)$/i.test(url.pathname)) {
    e.respondWith(
      caches.open(VERSION).then(function (c) {
        return c.match(req).then(function (cached) {
          var net = fetch(req).then(function (res) { if (res && res.status === 200) c.put(req, res.clone()); return res; }).catch(function () { return cached; });
          return cached || net;
        });
      })
    );
  }
});
