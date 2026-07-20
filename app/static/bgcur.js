/* BrickGains - display currency (converts USD amounts at render time).
   Prices are stored in USD; money() multiplies by the live rate for the chosen currency. */
(function () {
  var SYM = {USD:'$', EUR:'€', GBP:'£', SEK:'kr ', DKK:'kr ', NOK:'kr ', CHF:'CHF ', CAD:'CA$', AUD:'A$', PLN:'zł ', JPY:'¥'};
  var CURS = ['USD','EUR','GBP','SEK','DKK','CHF','CAD','AUD'];
  window.BG_CURS = CURS;

  function defCur() {
    var s = localStorage.getItem('bg_cur');
    if (s && SYM[s]) return s;
    var l = (navigator.language || 'en').toLowerCase();
    if (l.indexOf('en-gb') === 0) return 'GBP';
    if (/^(fr|de|es|it|nl|pt|fi|ga|el)/.test(l)) return 'EUR';
    if (l.indexOf('sv') === 0) return 'SEK';
    if (l.indexOf('da') === 0) return 'DKK';
    if (l.indexOf('nb') === 0 || l.indexOf('no') === 0) return 'NOK';
    if (l.indexOf('de-ch') === 0 || l.indexOf('fr-ch') === 0) return 'CHF';
    if (l.indexOf('en-ca') === 0 || l.indexOf('fr-ca') === 0) return 'CAD';
    if (l.indexOf('en-au') === 0) return 'AUD';
    return 'USD';
  }

  var code = defCur();
  window.BGCUR = { code: code, symbol: SYM[code] || (code + ' '), rate: 1 };

  function syncSel() { var s = document.getElementById('curSel'); if (s) s.value = window.BGCUR.code; }
  window.bgRerender = function () {
    ['render', 'loadMovers', 'renderWatch'].forEach(function (fn) {
      try { if (typeof window[fn] === 'function') window[fn](); } catch (e) {}
    });
  };

  function load(c) {
    fetch('/api/rates').then(function (r) { return r.json(); }).then(function (d) {
      var rates = (d && d.rates) || {};
      var rate = (c === 'USD') ? 1 : (parseFloat(rates[c]) || 1);
      window.BGCUR = { code: c, symbol: SYM[c] || (c + ' '), rate: rate };
      syncSel(); window.bgRerender();
    }).catch(function () {
      window.BGCUR = { code: c, symbol: SYM[c] || (c + ' '), rate: 1 };
      syncSel(); window.bgRerender();
    });
  }

  window.setCurrency = function (c) {
    if (!SYM[c]) return;
    localStorage.setItem('bg_cur', c);
    load(c);
  };

  document.addEventListener('DOMContentLoaded', syncSel);
  load(code);
})();
