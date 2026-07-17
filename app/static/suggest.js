/* BrickGains - autocomplete for set search inputs. Vanilla, CSP-safe. */
(function(){
  var DATA = null, loading = null;
  function load(){
    if(DATA) return Promise.resolve(DATA);
    if(loading) return loading;
    loading = fetch('/suggest.json').then(function(r){return r.json();}).then(function(j){DATA=j;return j;}).catch(function(){DATA=[];return [];});
    return loading;
  }
  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  function attach(input, onPick){
    if(!input || input.dataset.acReady) return;
    input.dataset.acReady = '1';
    input.setAttribute('autocomplete','off');
    input.setAttribute('role','combobox');
    input.setAttribute('aria-autocomplete','list');
    var box = document.createElement('div');
    box.className = 'ac-list';
    box.setAttribute('role','listbox');
    // input must sit in a positioned wrapper
    var wrap = document.createElement('div');
    wrap.className = 'ac-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    wrap.appendChild(box);
    var items = [], active = -1;

    function hide(){ box.classList.remove('on'); active = -1; }
    function pick(v){ onPick(v); hide(); }

    function render(list){
      items = list;
      if(!list.length){ hide(); return; }
      box.innerHTML = list.map(function(s,i){
        return '<div class="ac-item" role="option" data-i="'+i+'" data-n="'+esc(s.n)+'">'
             + '<span class="ac-num">'+esc(s.n)+'</span>'
             + '<span class="ac-name">'+esc(s.name)+'</span>'
             + (s.t?'<span class="ac-theme">'+esc(s.t)+'</span>':'')
             + '</div>';
      }).join('');
      active = -1;
      box.classList.add('on');
    }

    function filter(q){
      q = (q||'').trim().toLowerCase();
      if(q.length < 1){ hide(); return; }
      load().then(function(d){
        var numP = [], nameStart = [], nameIn = [];
        for(var i=0;i<d.length;i++){
          var s = d[i], n = s.n.toLowerCase(), nm = s.name.toLowerCase();
          if(n.indexOf(q)===0) { numP.push(s); }
          else if(nm.indexOf(q)===0 || nm.indexOf(' '+q)!==-1) { nameStart.push(s); }
          else if(nm.indexOf(q)!==-1) { nameIn.push(s); }
          if(numP.length>=8) break;
        }
        render(numP.concat(nameStart).concat(nameIn).slice(0,8));
      });
    }

    input.addEventListener('input', function(){ filter(input.value); });
    input.addEventListener('focus', function(){ if(input.value.trim()) filter(input.value); });
    input.addEventListener('keydown', function(e){
      if(!box.classList.contains('on')) return;
      if(e.key==='ArrowDown'){ e.preventDefault(); active=Math.min(active+1,items.length-1); paint(); }
      else if(e.key==='ArrowUp'){ e.preventDefault(); active=Math.max(active-1,0); paint(); }
      else if(e.key==='Enter'){ if(active>=0){ e.preventDefault(); pick(items[active].n); } }
      else if(e.key==='Escape'){ hide(); }
    });
    function paint(){
      var nodes = box.querySelectorAll('.ac-item');
      for(var i=0;i<nodes.length;i++){ nodes[i].classList.toggle('on', i===active); }
      if(active>=0 && nodes[active]) nodes[active].scrollIntoView({block:'nearest'});
    }
    box.addEventListener('mousedown', function(e){
      var it = e.target.closest('.ac-item'); if(it){ e.preventDefault(); pick(it.getAttribute('data-n')); }
    });
    document.addEventListener('click', function(e){ if(!wrap.contains(e.target)) hide(); });
  }

  function init(){
    // Home hero
    var hero = document.getElementById('setInput');
    if(hero) attach(hero, function(v){ hero.value=v; if(window.doSearch) window.doSearch(); });
    // App: add-to-portfolio + watchlist (fill only, user still sets price)
    var pset = document.getElementById('pset');
    if(pset) attach(pset, function(v){ pset.value=v; var p=document.getElementById('pprice'); if(p) p.focus(); });
    var wset = document.getElementById('wset');
    if(wset) attach(wset, function(v){ wset.value=v; });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
