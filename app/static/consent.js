/* BrickGains - GDPR cookie consent (Google Consent Mode v2).
   Trackers default to DENIED (set inline in <head>). This banner lets the visitor
   accept or reject; on accept it unlocks GA4 + Google Ads cookies and loads Clarity. */
(function () {
  var KEY = "bg_consent";
  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  // language from URL prefix (site is served under /fr/, /de/, … ; root = en)
  var m = location.pathname.match(/^\/(fr|de|es|it|nl|sv|da)(\/|$)/);
  var lang = m ? m[1] : "en";
  var S = {
    en: { t: "We use cookies to measure traffic and improve our ads. You decide.", a: "Accept", r: "Reject", m: "Learn more" },
    fr: { t: "Nous utilisons des cookies pour mesurer l’audience et améliorer nos publicités. À vous de choisir.", a: "Accepter", r: "Refuser", m: "En savoir plus" },
    de: { t: "Wir verwenden Cookies, um Zugriffe zu messen und unsere Anzeigen zu verbessern. Sie entscheiden.", a: "Akzeptieren", r: "Ablehnen", m: "Mehr erfahren" },
    es: { t: "Usamos cookies para medir el tráfico y mejorar nuestros anuncios. Tú decides.", a: "Aceptar", r: "Rechazar", m: "Más información" },
    it: { t: "Usiamo i cookie per misurare il traffico e migliorare gli annunci. Decidi tu.", a: "Accetta", r: "Rifiuta", m: "Scopri di più" },
    nl: { t: "We gebruiken cookies om verkeer te meten en onze advertenties te verbeteren. Jij beslist.", a: "Accepteren", r: "Weigeren", m: "Meer info" },
    sv: { t: "Vi använder cookies för att mäta trafik och förbättra våra annonser. Du bestämmer.", a: "Acceptera", r: "Avvisa", m: "Läs mer" },
    da: { t: "Vi bruger cookies til at måle trafik og forbedre vores annoncer. Du bestemmer.", a: "Accepter", r: "Afvis", m: "Læs mere" }
  };
  var T = S[lang] || S.en;
  var moreHref = (lang === "en" ? "" : "/" + lang) + "/cookies";

  function loadClarity() {
    if (!window.BG_CLARITY || window.__bgClarity) return;
    window.__bgClarity = true;
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, "clarity", "script", window.BG_CLARITY);
  }
  function update(v) {
    if (window.gtag) gtag("consent", "update", {
      ad_storage: v, analytics_storage: v, ad_user_data: v, ad_personalization: v
    });
  }
  function accept() { save("granted"); update("granted"); loadClarity(); hide(); }
  function reject() { save("denied"); update("denied"); hide(); }

  var el = null;
  function hide() {
    if (!el) return;
    el.style.transform = "translateY(120%)";
    setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); el = null; }, 300);
  }
  function css() {
    var s = document.createElement("style");
    s.textContent =
      "#bgConsent{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;max-width:760px;margin:0 auto;" +
      "background:#fff;color:#141414;border:2.5px solid #141414;border-radius:16px;box-shadow:6px 7px 0 #141414;" +
      "padding:16px 18px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;transform:translateY(120%);" +
      "transition:transform .32s cubic-bezier(.2,.8,.2,1)}" +
      "#bgConsent p{margin:0;flex:1;min-width:210px;font-size:14px;font-weight:500;line-height:1.5;color:#3a3830}" +
      "#bgConsent a{color:#A80008;font-weight:700;text-decoration:underline;white-space:nowrap}" +
      "#bgConsent .bgc-btns{display:flex;gap:10px;flex-wrap:wrap}" +
      "#bgConsent button{font-family:inherit;font-weight:800;font-size:14px;cursor:pointer;border:2.5px solid #141414;" +
      "border-radius:11px;padding:11px 20px;box-shadow:0 4px 0 #141414;transition:transform .06s,box-shadow .06s}" +
      "#bgConsent button:active{transform:translateY(4px);box-shadow:0 0 0 #141414}" +
      "#bgConsent .bgc-yes{background:#E3000B;color:#fff}" +
      "#bgConsent .bgc-no{background:#fff;color:#141414}" +
      "#bgConsent button:focus-visible{outline:3px solid #FFCF00;outline-offset:2px}" +
      "@media(prefers-reduced-motion:reduce){#bgConsent{transition:none}}";
    document.head.appendChild(s);
  }
  function show() {
    css();
    el = document.createElement("div");
    el.id = "bgConsent";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Cookies");
    el.innerHTML = '<p>🍪 ' + T.t + ' <a href="' + moreHref + '">' + T.m + '</a></p>' +
      '<div class="bgc-btns"><button class="bgc-no" type="button">' + T.r + '</button>' +
      '<button class="bgc-yes" type="button">' + T.a + '</button></div>';
    document.body.appendChild(el);
    el.querySelector(".bgc-yes").addEventListener("click", accept);
    el.querySelector(".bgc-no").addEventListener("click", reject);
    requestAnimationFrame(function () { el.style.transform = "translateY(0)"; });
  }

  // let visitors reopen the choice (e.g. from the /cookies page: onclick="bgOpenConsent()")
  window.bgOpenConsent = function () { if (!el) { try { localStorage.removeItem(KEY); } catch (e) {} start(true); } };

  function start(force) {
    var c = stored();
    if (c === "granted") { update("granted"); loadClarity(); return; }
    if (c === "denied" && !force) { return; }
    if (document.body) show();
    else document.addEventListener("DOMContentLoaded", show);
  }
  start(false);
})();
