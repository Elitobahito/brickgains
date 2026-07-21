/* BrickGains - onboarding product tour (coach-marks). Vanilla, CSP-safe.
   Dark overlay + spotlight on the target + tooltip card with Back/Next/Skip.
   Shown once (localStorage bg_tour_v3). Replayable via the "Tour" button. */
(function(){
  var GT = window.T || function(k,f){ return f!==undefined?f:k; };
  var L = {
    skip:GT('tour.skip'), back:GT('tour.back'), next:GT('tour.next'), done:GT('tour.done'),
    tour:GT('tour.tour'), of:GT('tour.of'),
    steps:[
      {t:GT('tour.s0.t'), d:GT('tour.s0.d')},
      {t:GT('tour.s1.t'), d:GT('tour.s1.d')},
      {t:GT('tour.s2.t'), d:GT('tour.s2.d')},
      {t:GT('tour.s3.t'), d:GT('tour.s3.d')},
      {t:GT('tour.s4.t'), d:GT('tour.s4.d')},
      {t:GT('tour.s5.t'), d:GT('tour.s5.d')},
      {t:GT('tour.s6.t'), d:GT('tour.s6.d')},
      {t:GT('tour.s7.t'), d:GT('tour.s7.d')}
    ]
  };

  function targets(){
    var movers = document.querySelectorAll('.movers-sec');
    return [
      null,
      document.querySelector('.add-row'),
      document.querySelector('#panel-scan .scan-page') || document.querySelector('.tbtn.accent'),
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

  var STEP_TAB = [null, 'portfolio', 'scan', 'portfolio', 'movers', 'watch', 'ebay', null];
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
    try{ localStorage.setItem('bg_tour_v3','1'); }catch(e){}
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
  }
  function start(){ if(overlay) return; build(); show(0); }
  window.BGTour = { start: start };

  function addButton(){
    var nav = document.querySelector('.appbar .links'); if(!nav) return;
    var b = document.createElement('button');
    b.className='tour-btn'; b.type='button'; b.textContent='? '+L.tour;
    b.title = L.tour;
    b.onclick = start;
    nav.insertBefore(b, nav.firstChild);
  }
  function init(){
    if(!document.querySelector('.portfolio-head')) return; // only on /app
    addButton();
    var seen; try{ seen = localStorage.getItem('bg_tour_v3'); }catch(e){ seen='1'; }
    if(!seen) setTimeout(function(){
      var g=document.getElementById('appGate');
      // don't auto-start the tour while the signup gate is showing (logged-out visitor)
      if(g && getComputedStyle(g).display!=='none') return;
      start();
    }, 900);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
