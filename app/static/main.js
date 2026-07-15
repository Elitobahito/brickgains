const FREE_LIMIT = 3;

function freeUsed(){ return parseInt(localStorage.getItem('bb_free')||'0',10); }
function setFree(n){ localStorage.setItem('bb_free', n); refreshFree(); }
function refreshFree(){
  const left = Math.max(0, FREE_LIMIT - freeUsed());
  const el = document.getElementById('freeLeft'); if(el) el.textContent = left;
  const hint = document.getElementById('freehint');
  if(hint){
    hint.innerHTML = left>0
      ? `<b id="freeLeft">${left}</b> free checks left · no signup`
      : `Out of free checks. <span class="subLink" onclick="goPricing()">Subscribe for unlimited &rarr;</span>`;
  }
}
function openWall(){ document.getElementById('wall').classList.add('on'); }
function closeWall(){ document.getElementById('wall').classList.remove('on'); }
function goPricing(){ closeWall(); const p=document.getElementById('pricing'); if(p) p.scrollIntoView({behavior:'smooth'}); }

function money(v){ return v==null ? '-' : '$'+Math.round(v).toLocaleString('en-US'); }

function quick(s){ document.getElementById('setInput').value = s; doSearch(); }

function revScroll(dir){
  const s = document.getElementById('revSlider');
  if(s) s.scrollBy({left: dir*362, behavior:'smooth'});
}

async function subscribe(e){
  e.preventDefault();
  const input = document.getElementById('alertEmail');
  const msg = document.getElementById('alertMsg');
  const email = input.value.trim();
  msg.className='alertmsg'; msg.textContent='Signing you up...';
  try{
    const r = await fetch('/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email, topic:'retirement-alerts'})});
    const d = await r.json();
    if(d.ok){ msg.className='alertmsg ok'; msg.textContent='✅ You\'re in! We\'ll email you when sets move.'; input.value=''; }
    else { msg.className='alertmsg err'; msg.textContent='Please enter a valid email.'; }
  }catch(err){ msg.className='alertmsg err'; msg.textContent='Something went wrong. Try again.'; }
}

function cardHTML(d){
  if(d.error) return `<div class="vcard"><div class="loading">Hmm, no data for "${d.set}". Try a set number like 10276.</div></div>`;
  let bcls='flat', btxt='No retail data';
  if(d.appreciation!=null){
    if(d.appreciation>0){bcls='up';btxt='+'+d.appreciation+'% vs retail';}
    else if(d.appreciation<0){bcls='down';btxt=d.appreciation+'% vs retail';}
    else {bcls='flat';btxt='Flat vs retail';}
  }
  const retired = d.retired ? `Retired ${d.retired}` : 'Still available';
  const verdict = d.retired && d.appreciation>15
    ? `✅ Retired and up ${d.appreciation}%. A strong hold or sell candidate.`
    : (!d.retired ? `🟡 Still on shelves. Value usually climbs after retirement.`
    : `Retired. Track it for the best selling window.`);
  return `<div class="vcard">
    <div class="top">
      <img src="${d.image||''}" alt="" onerror="this.style.visibility='hidden'">
      <div class="meta">
        <h3>${d.name}</h3>
        <div class="tags">${d.set} · ${d.theme||''} ${d.year?'· '+d.year:''} ${d.pieces?'· '+d.pieces+' pcs':''}</div>
        <div class="tags">Retail: ${money(d.rrp)} · ${retired}</div>
        <span class="badge ${bcls}">${btxt}</span>
      </div>
    </div>
    <div class="grid3">
      <div class="cell"><div class="k">Used (avg)</div><div class="v">${money(d.usedAvg)}</div></div>
      <div class="cell"><div class="k">New (avg)</div><div class="v">${money(d.newAvg)}</div></div>
      <div class="cell"><div class="k">New (range)</div><div class="v" style="font-size:16px">${money(d.newMin)} to ${money(d.newMax)}</div></div>
    </div>
    <div class="verdict ${d.retired?'retired':''}">${verdict}</div>
  </div>`;
}

async function doSearch(){
  const q = document.getElementById('setInput').value.trim();
  if(!q) return;
  if(freeUsed() >= FREE_LIMIT){ openWall(); return; }
  const box = document.getElementById('result');
  box.innerHTML = `<div class="vcard"><div class="loading">🔎 Fetching real market prices...</div></div>`;
  try{
    const r = await fetch('/api/value?set='+encodeURIComponent(q));
    const d = await r.json();
    box.innerHTML = cardHTML(d);
    if(!d.error) setFree(freeUsed()+1);
  }catch(e){
    box.innerHTML = `<div class="vcard"><div class="loading">Something went wrong. Try again.</div></div>`;
  }
}

async function loadExamples(){
  const sets = ['10276','10265','10281'];
  const wrap = document.getElementById('exampleCards');
  try{
    const data = await Promise.all(sets.map(s=>fetch('/api/value?set='+s).then(r=>r.json())));
    wrap.innerHTML = data.map(d=>{
      if(d.error) return '';
      const cls = d.appreciation>0?'up':(d.appreciation<0?'down':'flat');
      return `<div class="ex">
        <img src="${d.image||''}" onerror="this.style.visibility='hidden'">
        <h4>${d.name}</h4>
        <div class="prices">Retail ${money(d.rrp)} &rarr; New ${money(d.newAvg)}</div>
        <span class="badge ${cls}" style="margin-top:12px">${d.appreciation>0?'+':''}${d.appreciation}%</span>
      </div>`;
    }).join('') || '<div class="loading">Examples unavailable right now.</div>';
  }catch(e){ wrap.innerHTML='<div class="loading">Examples unavailable right now.</div>'; }
}

refreshFree();
loadExamples();
