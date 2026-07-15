const FREE_LIMIT = 3;
const FR = (window.LANG === 'fr');
const T = FR ? {
  left:(n)=>`<b id="freeLeft">${n}</b> estimations gratuites restantes · sans inscription`,
  out:`Plus d'estimations gratuites. <span class="subLink" onclick="goPricing()">S'abonner pour l'illimité &rarr;</span>`,
  demo:`👆 Exemple : cherchez n'importe quel set pour voir le vôtre`,
  loading:`🔎 Récupération des vrais prix du marché...`,
  nodata:(q)=>`Hmm, aucune donnée pour « ${q} ». Essayez un numéro de set comme 10276.`,
  wrong:`Une erreur est survenue. Réessayez.`,
  used:`Occasion (moy)`, newavg:`Neuf (moy)`, range:`Neuf (fourchette)`,
  retail:`Prix sortie :`, retired:(d)=>`Retiré le ${d}`, avail:`Encore disponible`,
  norrp:`Pas de prix de sortie`, vs:`% vs sortie`, flat:`Stable vs sortie`,
  vRetHi:(p)=>`✅ Retiré et en hausse de ${p} %. Solide candidat à garder ou vendre.`,
  vAvail:`🟡 Encore en rayon. La valeur grimpe souvent après la retraite.`,
  vRet:`Retiré. Surveillez-le pour la meilleure fenêtre de vente.`,
  exLoading:`Chargement des exemples...`, exUnavail:`Exemples indisponibles pour l'instant.`,
  to:` à `, retailWord:`Prix sortie`
} : {
  left:(n)=>`<b id="freeLeft">${n}</b> free checks left · no signup`,
  out:`Out of free checks. <span class="subLink" onclick="goPricing()">Subscribe for unlimited &rarr;</span>`,
  demo:`👆 Example: search any set to get yours`,
  loading:`🔎 Fetching real market prices...`,
  nodata:(q)=>`Hmm, no data for "${q}". Try a set number like 10276.`,
  wrong:`Something went wrong. Try again.`,
  used:`Used (avg)`, newavg:`New (avg)`, range:`New (range)`,
  retail:`Retail:`, retired:(d)=>`Retired ${d}`, avail:`Still available`,
  norrp:`No retail data`, vs:`% vs retail`, flat:`Flat vs retail`,
  vRetHi:(p)=>`✅ Retired and up ${p}%. A strong hold or sell candidate.`,
  vAvail:`🟡 Still on shelves. Value usually climbs after retirement.`,
  vRet:`Retired. Track it for the best selling window.`,
  exLoading:`Loading live examples...`, exUnavail:`Examples unavailable right now.`,
  to:` to `, retailWord:`Retail`
};

function freeUsed(){ return parseInt(localStorage.getItem('bb_free')||'0',10); }
function setFree(n){ localStorage.setItem('bb_free', n); refreshFree(); }
function refreshFree(){
  const left = Math.max(0, FREE_LIMIT - freeUsed());
  const hint = document.getElementById('freehint');
  if(hint) hint.innerHTML = left>0 ? T.left(left) : T.out;
}
function openWall(){ document.getElementById('wall').classList.add('on'); }
function closeWall(){ document.getElementById('wall').classList.remove('on'); }
function goPricing(){ closeWall(); const p=document.getElementById('pricing'); if(p) p.scrollIntoView({behavior:'smooth'}); }

function money(v){ return v==null ? '-' : '$'+Math.round(v).toLocaleString('en-US'); }
function quick(s){ document.getElementById('setInput').value = s; doSearch(); }
function revScroll(dir){ const s=document.getElementById('revSlider'); if(s) s.scrollBy({left:dir*362,behavior:'smooth'}); }

function cardHTML(d){
  if(d.error) return `<div class="vcard"><div class="loading">${T.nodata(d.set)}</div></div>`;
  let bcls='flat', btxt=T.norrp;
  if(d.appreciation!=null){
    if(d.appreciation>0){bcls='up';btxt='+'+d.appreciation+T.vs;}
    else if(d.appreciation<0){bcls='down';btxt=d.appreciation+T.vs;}
    else {bcls='flat';btxt=T.flat;}
  }
  const retired = d.retired ? T.retired(d.retired) : T.avail;
  const verdict = d.retired && d.appreciation>15 ? T.vRetHi(d.appreciation)
    : (!d.retired ? T.vAvail : T.vRet);
  return `<div class="vcard">
    <div class="top">
      <img src="${d.image||''}" alt="" onerror="this.style.visibility='hidden'">
      <div class="meta">
        <h3>${d.name}</h3>
        <div class="tags">${d.set} · ${d.theme||''} ${d.year?'· '+d.year:''} ${d.pieces?'· '+d.pieces+' pcs':''}</div>
        <div class="tags">${T.retail} ${money(d.rrp)} · ${retired}</div>
        <span class="badge ${bcls}">${btxt}</span>
      </div>
    </div>
    <div class="grid3">
      <div class="cell"><div class="k">${T.used}</div><div class="v">${money(d.usedAvg)}</div></div>
      <div class="cell"><div class="k">${T.newavg}</div><div class="v">${money(d.newAvg)}</div></div>
      <div class="cell"><div class="k">${T.range}</div><div class="v" style="font-size:16px">${money(d.newMin)}${T.to}${money(d.newMax)}</div></div>
    </div>
    <div class="verdict ${d.retired?'retired':''}">${verdict}</div>
  </div>`;
}

async function doSearch(){
  const q = document.getElementById('setInput').value.trim();
  if(!q) return;
  if(freeUsed() >= FREE_LIMIT){ openWall(); return; }
  const box = document.getElementById('result');
  box.innerHTML = `<div class="vcard"><div class="loading">${T.loading}</div></div>`;
  try{
    const r = await fetch('/api/value?set='+encodeURIComponent(q));
    const d = await r.json();
    box.innerHTML = cardHTML(d);
    if(!d.error) setFree(freeUsed()+1);
  }catch(e){ box.innerHTML = `<div class="vcard"><div class="loading">${T.wrong}</div></div>`; }
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
        <div class="prices">${T.retailWord} ${money(d.rrp)} &rarr; ${T.newavg} ${money(d.newAvg)}</div>
        <span class="badge ${cls}" style="margin-top:12px">${d.appreciation>0?'+':''}${d.appreciation}%</span>
      </div>`;
    }).join('') || `<div class="loading">${T.exUnavail}</div>`;
  }catch(e){ wrap.innerHTML=`<div class="loading">${T.exUnavail}</div>`; }
}

async function loadDemo(){
  const box = document.getElementById('result');
  if(!box || box.innerHTML.trim()) return;
  try{
    const d = await fetch('/api/value?set=10276').then(r=>r.json());
    if(d.error) return;
    box.innerHTML = `<div class="demo-tag">${T.demo}</div>` + cardHTML(d);
  }catch(e){}
}

refreshFree();
loadExamples();
loadDemo();
