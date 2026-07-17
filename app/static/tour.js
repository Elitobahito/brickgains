/* BrickGains - onboarding product tour (coach-marks). Vanilla, CSP-safe.
   Dark overlay + spotlight on the target + tooltip card with Back/Next/Skip.
   Shown once (localStorage bg_tour_v2). Replayable via the "Tour" button. */
(function(){
  var FR = (document.documentElement.lang === 'fr');
  var LOC = document.documentElement.lang || 'en';
  var T = {
    en: {skip:'Skip', back:'Back', next:'Next', done:'Got it', tour:'Tour', of:'of',
      steps:[
        {t:'Welcome to your portfolio', d:'This is your BrickGains dashboard. Here you track what your LEGO is worth in real time. Let me show you around in 20 seconds.'},
        {t:'1. Add your sets', d:'Type a set number (suggestions pop up as you type), the price you paid, and its condition. We fetch the real BrickLink market value automatically.'},
        {t:'2. See your value and ROI', d:'These update live: how many sets you track, what you paid, what they are worth now, and your total return.'},
        {t:'3. Market Movers', d:'The biggest gainers and laggards versus retail price. A quick way to spot which sets are heating up.'},
        {t:'4. Watchlist', d:'Track sets you do not own yet. We flag when they move in price or retire, so you know the right moment to buy.'},
        {t:'5. eBay profit calculator', d:'Before you sell, see your real profit after eBay fees and shipping. No surprises.'},
        {t:'You are all set!', d:'That is the whole dashboard. Add your first set to get started. Upgrade to Pro anytime for price alerts and unlimited tracking.'}
      ]},
    fr: {skip:'Passer', back:'Précédent', next:'Suivant', done:'Compris', tour:'Tuto', of:'sur',
      steps:[
        {t:'Bienvenue dans votre portefeuille', d:'Voici votre tableau de bord BrickGains. Vous y suivez la valeur de vos LEGO en temps réel. Petit tour en 20 secondes.'},
        {t:'1. Ajoutez vos sets', d:'Tapez un numéro de set (des suggestions apparaissent), le prix payé et son état. On récupère automatiquement la vraie valeur marché BrickLink.'},
        {t:'2. Votre valeur et votre ROI', d:'Mis à jour en direct : nombre de sets suivis, total payé, valeur actuelle et rendement total.'},
        {t:'3. Market Movers', d:'Les plus fortes hausses et les retardataires face au prix de vente. Repérez vite les sets qui chauffent.'},
        {t:'4. Watchlist', d:'Suivez des sets que vous ne possédez pas encore. On vous alerte quand le prix bouge ou qu ils partent en retraite.'},
        {t:'5. Calculateur de profit eBay', d:'Avant de vendre, voyez votre profit réel après les frais eBay et la livraison. Aucune surprise.'},
        {t:'Tout est prêt !', d:'Voilà tout le tableau de bord. Ajoutez votre premier set pour démarrer. Passez Pro quand vous voulez pour les alertes de prix et le suivi illimité.'}
      ]}
  }[FR?'fr':'en'] || null;
  var L = T || {skip:'Skip',back:'Back',next:'Next',done:'Got it',tour:'Tour',of:'of',steps:[]};

  function targets(){
    var movers = document.querySelectorAll('.movers-sec');
    return [
      null,
      document.querySelector('.add-row'),
      document.querySelector('.portfolio-head'),
      movers[0] || null,
      movers[1] || null,
      document.querySelector('.ebay-calc'),
      null
    ];
  }

  var overlay, spot, card, idx = 0;
  function build(){
    overlay = document.createElement('div'); overlay.className='tour-ov';
    spot = document.createElement('div'); spot.className='tour-spot';
    card = document.createElement('div'); card.className='tour-card';
    overlay.appendChild(spot); overlay.appendChild(card);
    document.body.appendChild(overlay);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
  }
  function esc(s){ return String(s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}); }

  var STEP_TAB = [null, 'portfolio', 'portfolio', 'movers', 'watch', 'ebay', null];
  function show(i){
    idx = i;
    var step = L.steps[i]; if(!step) return end();
    if(STEP_TAB[i] && window.showTab){ window.showTab(STEP_TAB[i]); }
    var el = targets()[i];
    // spotlight
    if(el){
      el.scrollIntoView({block:'center', behavior:'smooth'});
      setTimeout(function(){ paint(el, step); }, 260);
    } else {
      spot.style.display='none';
      paint(null, step);
    }
  }
  function paint(el, step){
    if(el){
      var r = el.getBoundingClientRect();
      var pad = 8;
      spot.style.display='block';
      spot.style.top=(r.top-pad)+'px'; spot.style.left=(r.left-pad)+'px';
      spot.style.width=(r.width+pad*2)+'px'; spot.style.height=(r.height+pad*2)+'px';
    } else {
      spot.style.display='none';
    }
    var last = idx===L.steps.length-1;
    card.innerHTML =
      '<div class="tc-step">'+(idx+1)+' '+L.of+' '+L.steps.length+'</div>'+
      '<div class="tc-title">'+esc(step.t)+'</div>'+
      '<div class="tc-text">'+esc(step.d)+'</div>'+
      '<div class="tc-dots">'+L.steps.map(function(_,k){return '<i class="'+(k===idx?'on':'')+'"></i>';}).join('')+'</div>'+
      '<div class="tc-btns">'+
        '<button class="tc-skip">'+L.skip+'</button>'+
        '<div class="tc-r">'+
          (idx>0?'<button class="tc-back">'+L.back+'</button>':'')+
          '<button class="tc-next">'+(last?L.done:L.next)+'</button>'+
        '</div>'+
      '</div>';
    card.querySelector('.tc-skip').onclick = end;
    card.querySelector('.tc-next').onclick = function(){ last ? end() : show(idx+1); };
    var b = card.querySelector('.tc-back'); if(b) b.onclick = function(){ show(idx-1); };
    positionCard(el);
  }
  function positionCard(el){
    card.style.visibility='hidden'; card.style.display='block';
    var cw = card.offsetWidth, ch = card.offsetHeight;
    var vw = window.innerWidth, vh = window.innerHeight, m=16, top, left;
    if(el){
      var r = el.getBoundingClientRect();
      if(r.bottom + ch + 20 < vh){ top = r.bottom + 14; }         // below
      else if(r.top - ch - 20 > 0){ top = r.top - ch - 14; }      // above
      else { top = Math.max(m, (vh-ch)/2); }                       // center
      left = Math.min(Math.max(m, r.left), vw - cw - m);
    } else {
      top = (vh-ch)/2; left = (vw-cw)/2;
    }
    card.style.top = top+'px'; card.style.left = left+'px';
    card.style.visibility='visible';
  }
  function reposition(){ if(overlay && overlay.parentNode){ var el=targets()[idx]; paint(el, L.steps[idx]); } }
  function end(){
    if(overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay=null;
    try{ localStorage.setItem('bg_tour_v2','1'); }catch(e){}
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
  }
  function start(){ if(overlay) return; build(); show(0); }
  window.BGTour = { start: start };

  function addButton(){
    var nav = document.querySelector('.appbar .links'); if(!nav) return;
    var b = document.createElement('button');
    b.className='tour-btn'; b.type='button'; b.textContent='? '+L.tour;
    b.title = FR?'Revoir le tuto':'Replay the tour';
    b.onclick = start;
    nav.insertBefore(b, nav.firstChild);
  }
  function init(){
    if(!document.querySelector('.portfolio-head')) return; // only on /app
    addButton();
    var seen; try{ seen = localStorage.getItem('bg_tour_v2'); }catch(e){ seen='1'; }
    if(!seen) setTimeout(start, 700);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
