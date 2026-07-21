/* BrickGains — "Install app" prompt. Makes the PWA actually discoverable/installable.
   - Chrome/Edge/Android: captures beforeinstallprompt → 1-click Install button.
   - iOS Safari (no prompt API): shows the Share → Add to Home Screen hint.
   Only in the dashboard, hidden once installed or dismissed. */
(function () {
  // already running as an installed app?
  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  if (standalone) return;
  if (location.pathname.indexOf('/app') !== 0) return;
  var KEY = 'bg_pwa_dismiss';
  try { if (localStorage.getItem(KEY)) return; } catch (e) {}

  var ua = navigator.userAgent;
  var isIOS = /iphone|ipad|ipod/i.test(ua);
  var isSafari = /safari/i.test(ua) && !/crios|fxios|android|chrome/i.test(ua);
  var deferred = null;

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; show('prompt'); });
  if (isIOS && isSafari) { setTimeout(function () { show('ios'); }, 1800); }

  function dismiss(bar) { try { localStorage.setItem(KEY, '1'); } catch (e) {} if (bar) { bar.style.transform = 'translateY(140%)'; setTimeout(function () { if (bar.parentNode) bar.remove(); }, 260); } }

  function css() {
    if (document.getElementById('bgInstallCss')) return;
    var s = document.createElement('style'); s.id = 'bgInstallCss';
    s.textContent =
      "#bgInstall{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147482000;max-width:520px;margin:0 auto;" +
      "background:#141414;color:#fff;border:2.5px solid #141414;border-radius:16px;box-shadow:6px 7px 0 rgba(0,0,0,.25);" +
      "padding:13px 14px;display:flex;align-items:center;gap:12px;transform:translateY(140%);transition:transform .32s cubic-bezier(.2,.8,.2,1);" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif}" +
      "#bgInstall .bi-ic{font-size:24px;line-height:1;flex-shrink:0}" +
      "#bgInstall .bi-t{flex:1;min-width:0;line-height:1.3}" +
      "#bgInstall .bi-t b{font-weight:800;font-size:14.5px;display:block}" +
      "#bgInstall .bi-t span{font-size:12.5px;color:#d7d3c8}" +
      "#bgInstall .bi-go{background:#FFCF00;color:#141414;border:none;border-radius:10px;font-weight:800;font-size:14px;" +
      "padding:10px 16px;cursor:pointer;font-family:inherit;flex-shrink:0}" +
      "#bgInstall .bi-go:active{transform:translateY(2px)}" +
      "#bgInstall .bi-x{background:none;border:none;color:#9a968c;font-size:18px;cursor:pointer;padding:2px 4px;flex-shrink:0}" +
      "@media(prefers-reduced-motion:reduce){#bgInstall{transition:none}}";
    document.head.appendChild(s);
  }

  function show(kind) {
    if (document.getElementById('bgInstall') || !document.body) return;
    css();
    var bar = document.createElement('div'); bar.id = 'bgInstall'; bar.setAttribute('role', 'dialog');
    if (kind === 'ios') {
      bar.innerHTML = '<span class="bi-ic">📲</span><div class="bi-t"><b>Install BrickGains</b>' +
        '<span>Tap <b>Share</b> ⬆ then <b>“Add to Home Screen”</b></span></div>' +
        '<button class="bi-x" aria-label="Close">✕</button>';
    } else {
      bar.innerHTML = '<span class="bi-ic">📲</span><div class="bi-t"><b>Install BrickGains</b>' +
        '<span>Add the app to your home screen</span></div>' +
        '<button class="bi-go">Install</button><button class="bi-x" aria-label="Close">✕</button>';
    }
    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.style.transform = 'translateY(0)'; });
    var x = bar.querySelector('.bi-x'); if (x) x.onclick = function () { dismiss(bar); };
    var go = bar.querySelector('.bi-go');
    if (go) go.onclick = function () {
      if (!deferred) { dismiss(bar); return; }
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; dismiss(bar); });
    };
  }
})();
