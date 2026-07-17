/* BrickGains - real price-history chart on set pages, for Pro/Investor users.
   Free/anon users keep the blurred "unlock" teaser. Vanilla, CSP-safe. */
(function(){
  var locked = document.querySelector('.locked');
  if(!locked) return;
  var m = (location.pathname || '').match(/\/set\/(\d+)/);
  if(!m) return;
  var num = m[1];
  var FR = (document.documentElement.lang === 'fr');
  function money(v){ return v==null ? '-' : '$'+Math.round(v).toLocaleString('en-US'); }
  function fmtDate(d){ return String(d||'').slice(0,10); }

  fetch('/api/me').then(function(r){return r.json();}).then(function(d){
    var u = d.user;
    if(!u || (u.plan!=='pro' && u.plan!=='investor')) return; // not paid -> keep teaser
    fetch('/api/history?set='+num).then(function(r){return r.json();}).then(function(h){
      var pts = (h.history||[]).filter(function(p){ return p.new_avg!=null; });
      if(!pts.length) return; // no data yet -> keep teaser
      render(pts);
    }).catch(function(){});
  }).catch(function(){});

  function render(pts){
    var vals = pts.map(function(p){ return p.new_avg; });
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    var pad = (mx-mn)*0.12 || (mx*0.1) || 1; mn -= pad; mx += pad;
    var W=600, H=170;
    function X(i){ return pts.length>1 ? (i/(pts.length-1))*W : W/2; }
    function Y(v){ return H - ((v-mn)/((mx-mn)||1))*H; }
    var line = pts.map(function(p,i){ return X(i).toFixed(1)+','+Y(p.new_avg).toFixed(1); }).join(' ');
    var area = '0,'+H+' '+line+' '+W+','+H;
    var dots = pts.map(function(p,i){ return '<circle class="lb-dot" cx="'+X(i).toFixed(1)+'" cy="'+Y(p.new_avg).toFixed(1)+'" r="4"/>'; }).join('');
    var first=pts[0], last=pts[pts.length-1];
    var chg = (first.new_avg && last.new_avg) ? Math.round((last.new_avg-first.new_avg)/first.new_avg*100) : 0;
    var chgTxt = pts.length>1 ? ' <span class="hl-chg '+(chg>=0?'up':'down')+'">'+(chg>=0?'+':'')+chg+'%</span>' : '';
    locked.className = 'hist-live';
    locked.innerHTML =
      '<div class="hl-head"><h3>'+(FR?'Historique des prix':'Price history')+'</h3>'+
        '<div class="hl-now">'+money(last.new_avg)+chgTxt+'</div></div>'+
      '<div class="hl-chart"><svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">'+
        '<line class="lb-grid" x1="0" y1="'+(H*0.5)+'" x2="'+W+'" y2="'+(H*0.5)+'"/>'+
        '<polyline class="lb-area" points="'+area+'"/>'+
        '<polyline class="lb-line" points="'+line+'"/>'+dots+
      '</svg></div>'+
      '<div class="hl-meta"><span>'+fmtDate(first.day)+'</span><span>'+(FR?(pts.length+' points, mis à jour mensuellement'):(pts.length+' points, updated monthly'))+'</span><span>'+fmtDate(last.day)+'</span></div>';
  }
})();
