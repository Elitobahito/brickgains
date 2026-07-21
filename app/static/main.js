const FREE_LIMIT = 3;
const STR = {
fr: {
  left:(n)=>`<b id="freeLeft">${n}</b> estimations gratuites restantes · sans inscription`,
  out:`Plus d'estimations gratuites. <span class="subLink" onclick="goPricing()">S'abonner pour l'illimité &rarr;</span>`,
  demo:`Exemple : cherchez n'importe quel set pour voir le vôtre`,
  loading:`Récupération des vrais prix du marché...`,
  nodata:(q)=>`Hmm, aucune donnée pour « ${q} ». Essayez un numéro de set comme 10276.`,
  wrong:`Une erreur est survenue. Réessayez.`,
  used:`Occasion (moy)`, newavg:`Neuf (moy)`, range:`Neuf (fourchette)`,
  retail:`Prix sortie :`, retired:(d)=>`Retiré le ${d}`, avail:`Encore disponible`,
  norrp:`Pas de prix de sortie`, vs:`% vs sortie`, flat:`Stable vs sortie`,
  vRetHi:(p)=>`Retiré et en hausse de ${p} %. Solide candidat à garder ou vendre.`,
  vAvail:`Encore en rayon. La valeur grimpe souvent après la retraite.`,
  vRet:`Retiré. Surveillez-le pour la meilleure fenêtre de vente.`,
  exLoading:`Chargement des exemples...`, exUnavail:`Exemples indisponibles pour l'instant.`,
  to:` à `, retailWord:`Prix sortie`,
  track:`Suivre ce set`, full:`Voir l'analyse complète →`
},
en: {
  left:(n)=>`<b id="freeLeft">${n}</b> free checks left · no signup`,
  out:`Out of free checks. <span class="subLink" onclick="goPricing()">Subscribe for unlimited &rarr;</span>`,
  demo:`Example: search any set to get yours`,
  loading:`Fetching real market prices...`,
  nodata:(q)=>`Hmm, no data for "${q}". Try a set number like 10276.`,
  wrong:`Something went wrong. Try again.`,
  used:`Used (avg)`, newavg:`New (avg)`, range:`New (range)`,
  retail:`Retail:`, retired:(d)=>`Retired ${d}`, avail:`Still available`,
  norrp:`No retail data`, vs:`% vs retail`, flat:`Flat vs retail`,
  vRetHi:(p)=>`Retired and up ${p}%. A strong hold or sell candidate.`,
  vAvail:`Still on shelves. Value usually climbs after retirement.`,
  vRet:`Retired. Track it for the best selling window.`,
  exLoading:`Loading live examples...`, exUnavail:`Examples unavailable right now.`,
  to:` to `, retailWord:`Retail`,
  track:`Track this set`, full:`See full analysis →`
},
de: {
  left:(n)=>`<b id="freeLeft">${n}</b> kostenlose Abfragen übrig · ohne Anmeldung`,
  out:`Keine kostenlosen Abfragen mehr. <span class="subLink" onclick="goPricing()">Abonnieren für unbegrenzt &rarr;</span>`,
  demo:`Beispiel: Suche ein beliebiges Set, um dein eigenes zu sehen`,
  loading:`Echte Marktpreise werden abgerufen...`,
  nodata:(q)=>`Hmm, keine Daten für „${q}". Versuche eine Set-Nummer wie 10276.`,
  wrong:`Etwas ist schiefgelaufen. Bitte erneut versuchen.`,
  used:`Gebraucht (Ø)`, newavg:`Neu (Ø)`, range:`Neu (Spanne)`,
  retail:`UVP:`, retired:(d)=>`EOL am ${d}`, avail:`Noch erhältlich`,
  norrp:`Kein UVP verfügbar`, vs:`% vs. UVP`, flat:`Stabil vs. UVP`,
  vRetHi:(p)=>`Aus dem Handel und ${p}% im Plus. Ein starker Kandidat zum Halten oder Verkaufen.`,
  vAvail:`Noch im Handel. Der Wert steigt oft nach dem EOL.`,
  vRet:`Aus dem Handel. Behalte es für das beste Verkaufsfenster im Blick.`,
  exLoading:`Live-Beispiele werden geladen...`, exUnavail:`Beispiele derzeit nicht verfügbar.`,
  to:` bis `, retailWord:`UVP`,
  track:`Set verfolgen`, full:`Vollständige Analyse →`
},
es: {
  left:(n)=>`<b id="freeLeft">${n}</b> consultas gratis restantes · sin registro`,
  out:`Se acabaron las consultas gratis. <span class="subLink" onclick="goPricing()">Suscríbete para ilimitado &rarr;</span>`,
  demo:`Ejemplo: busca cualquier set para ver el tuyo`,
  loading:`Obteniendo precios reales del mercado...`,
  nodata:(q)=>`Vaya, no hay datos para «${q}». Prueba con un número de set como 10276.`,
  wrong:`Algo salió mal. Inténtalo de nuevo.`,
  used:`Usado (prom.)`, newavg:`Nuevo (prom.)`, range:`Nuevo (rango)`,
  retail:`Precio de salida:`, retired:(d)=>`Descatalogado el ${d}`, avail:`Aún disponible`,
  norrp:`Sin precio de salida`, vs:`% vs. precio de salida`, flat:`Estable vs. precio de salida`,
  vRetHi:(p)=>`Descatalogado y con una subida del ${p}%. Un firme candidato para conservar o vender.`,
  vAvail:`Todavía en tiendas. El valor suele subir tras su retirada.`,
  vRet:`Descatalogado. Vigílalo para encontrar la mejor ventana de venta.`,
  exLoading:`Cargando ejemplos en vivo...`, exUnavail:`Ejemplos no disponibles ahora mismo.`,
  to:` a `, retailWord:`Precio de salida`,
  track:`Seguir este set`, full:`Ver análisis completo →`
},
it: {
  left:(n)=>`<b id="freeLeft">${n}</b> ricerche gratuite rimaste · senza registrazione`,
  out:`Ricerche gratuite esaurite. <span class="subLink" onclick="goPricing()">Abbonati per l'illimitato &rarr;</span>`,
  demo:`Esempio: cerca un set qualsiasi per vedere il tuo`,
  loading:`Recupero dei prezzi reali di mercato...`,
  nodata:(q)=>`Mmm, nessun dato per «${q}». Prova con un numero di set come 10276.`,
  wrong:`Qualcosa è andato storto. Riprova.`,
  used:`Usato (media)`, newavg:`Nuovo (media)`, range:`Nuovo (fascia)`,
  retail:`Prezzo di listino:`, retired:(d)=>`Ritirato il ${d}`, avail:`Ancora disponibile`,
  norrp:`Nessun prezzo di listino`, vs:`% vs. listino`, flat:`Stabile vs. listino`,
  vRetHi:(p)=>`Ritirato e in crescita del ${p}%. Un ottimo candidato da tenere o vendere.`,
  vAvail:`Ancora in vendita. Il valore di solito sale dopo il ritiro.`,
  vRet:`Ritirato. Tienilo d'occhio per la migliore finestra di vendita.`,
  exLoading:`Caricamento esempi in tempo reale...`, exUnavail:`Esempi non disponibili al momento.`,
  to:` a `, retailWord:`Prezzo di listino`,
  track:`Segui questo set`, full:`Vedi analisi completa →`
},
nl: {
  left:(n)=>`<b id="freeLeft">${n}</b> gratis checks over · zonder registratie`,
  out:`Geen gratis checks meer. <span class="subLink" onclick="goPricing()">Abonneer voor onbeperkt &rarr;</span>`,
  demo:`Voorbeeld: zoek een willekeurige set om die van jou te zien`,
  loading:`Echte marktprijzen ophalen...`,
  nodata:(q)=>`Hmm, geen gegevens voor "${q}". Probeer een setnummer zoals 10276.`,
  wrong:`Er ging iets mis. Probeer het opnieuw.`,
  used:`Gebruikt (gem.)`, newavg:`Nieuw (gem.)`, range:`Nieuw (bereik)`,
  retail:`Adviesprijs:`, retired:(d)=>`Uit productie op ${d}`, avail:`Nog verkrijgbaar`,
  norrp:`Geen adviesprijs`, vs:`% t.o.v. adviesprijs`, flat:`Stabiel t.o.v. adviesprijs`,
  vRetHi:(p)=>`Uit productie en ${p}% gestegen. Een sterke kandidaat om te houden of te verkopen.`,
  vAvail:`Nog in de winkel. De waarde stijgt meestal na het uit productie gaan.`,
  vRet:`Uit productie. Houd hem in de gaten voor het beste verkoopmoment.`,
  exLoading:`Live voorbeelden laden...`, exUnavail:`Voorbeelden momenteel niet beschikbaar.`,
  to:` tot `, retailWord:`Adviesprijs`,
  track:`Volg deze set`, full:`Bekijk volledige analyse →`
},
sv: {
  left:(n)=>`<b id="freeLeft">${n}</b> gratis koll kvar · utan registrering`,
  out:`Slut på gratis koll. <span class="subLink" onclick="goPricing()">Prenumerera för obegränsat &rarr;</span>`,
  demo:`Exempel: sök på valfritt set för att se ditt eget`,
  loading:`Hämtar riktiga marknadspriser...`,
  nodata:(q)=>`Hmm, ingen data för "${q}". Testa ett setnummer som 10276.`,
  wrong:`Något gick fel. Försök igen.`,
  used:`Begagnat (snitt)`, newavg:`Nytt (snitt)`, range:`Nytt (spann)`,
  retail:`Nypris:`, retired:(d)=>`Utgått ${d}`, avail:`Fortfarande tillgängligt`,
  norrp:`Inget nypris`, vs:`% mot nypris`, flat:`Oförändrat mot nypris`,
  vRetHi:(p)=>`Utgått och upp ${p}%. En stark kandidat att behålla eller sälja.`,
  vAvail:`Fortfarande i butik. Värdet stiger ofta efter att setet utgått.`,
  vRet:`Utgått. Håll koll på det för bästa säljläget.`,
  exLoading:`Laddar liveexempel...`, exUnavail:`Exempel är inte tillgängliga just nu.`,
  to:` till `, retailWord:`Nypris`,
  track:`Följ detta set`, full:`Se fullständig analys →`
},
da: {
  left:(n)=>`<b id="freeLeft">${n}</b> gratis tjek tilbage · uden oprettelse`,
  out:`Ikke flere gratis tjek. <span class="subLink" onclick="goPricing()">Abonnér for ubegrænset &rarr;</span>`,
  demo:`Eksempel: søg på et vilkårligt sæt for at se dit eget`,
  loading:`Henter rigtige markedspriser...`,
  nodata:(q)=>`Hmm, ingen data for "${q}". Prøv et sætnummer som 10276.`,
  wrong:`Noget gik galt. Prøv igen.`,
  used:`Brugt (gns.)`, newavg:`Ny (gns.)`, range:`Ny (interval)`,
  retail:`Vejl. pris:`, retired:(d)=>`Udgået ${d}`, avail:`Stadig tilgængelig`,
  norrp:`Ingen vejl. pris`, vs:`% ift. vejl. pris`, flat:`Uændret ift. vejl. pris`,
  vRetHi:(p)=>`Udgået og steget ${p}%. En stærk kandidat at beholde eller sælge.`,
  vAvail:`Stadig i butikkerne. Værdien stiger ofte, efter sættet udgår.`,
  vRet:`Udgået. Hold øje med det for det bedste salgstidspunkt.`,
  exLoading:`Indlæser live-eksempler...`, exUnavail:`Eksempler er ikke tilgængelige lige nu.`,
  to:` til `, retailWord:`Vejl. pris`,
  track:`Følg dette sæt`, full:`Se fuld analyse →`
}
};
const T = STR[window.LANG] || STR.en;

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
    <div class="localbox" data-set="${String(d.set||'').replace('-1','')}"></div>
    <div class="verdict ${d.retired?'retired':''}">${verdict}</div>
    <div class="vcta">
      <a class="btn" href="/app?add=${encodeURIComponent(String(d.set||'').replace('-1',''))}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" style="flex-shrink:0"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>${T.track}</a>
      <a class="vcta-link" href="/set/${encodeURIComponent(String(d.set||'').replace('-1',''))}">${T.full}</a>
    </div>
  </div>`;
}

// ---- Pro: "value in your country" (real BrickLink prices, local currency) ----
var LP_CO=[["US","US United States"],["GB","GB United Kingdom"],["DE","DE Germany"],["FR","FR France"],["IT","IT Italy"],["ES","ES Spain"],["NL","NL Netherlands"],["BE","BE Belgium"],["SE","SE Sweden"],["DK","DK Denmark"],["NO","NO Norway"],["CH","CH Switzerland"],["PL","PL Poland"],["AT","AT Austria"],["IE","IE Ireland"],["PT","PT Portugal"],["FI","FI Finland"],["CA","CA Canada"],["AU","AU Australia"],["JP","JP Japan"]];
var LP_T={
  en:{t:'Value in your country',nw:'New',us:'Used',none:'No recent sales in',lock:'Value in your country'},
  fr:{t:'Valeur dans ton pays',nw:'Neuf',us:'Occasion',none:'Aucune vente récente en',lock:'Valeur dans ton pays'},
  de:{t:'Wert in deinem Land',nw:'Neu',us:'Gebraucht',none:'Keine Verkäufe in',lock:'Wert in deinem Land'},
  es:{t:'Valor en tu país',nw:'Nuevo',us:'Usado',none:'Sin ventas recientes en',lock:'Valor en tu país'},
  it:{t:'Valore nel tuo paese',nw:'Nuovo',us:'Usato',none:'Nessuna vendita in',lock:'Valore nel tuo paese'},
  nl:{t:'Waarde in jouw land',nw:'Nieuw',us:'Gebruikt',none:'Geen verkopen in',lock:'Waarde in jouw land'},
  sv:{t:'Värde i ditt land',nw:'Nytt',us:'Begagnat',none:'Inga försäljningar i',lock:'Värde i ditt land'},
  da:{t:'Værdi i dit land',nw:'Ny',us:'Brugt',none:'Ingen salg i',lock:'Værdi i dit land'}
};
function lpL(){ var l=(document.documentElement.getAttribute('lang')||'en').slice(0,2); return LP_T[l]||LP_T.en; }
function lpName(cc){ var m=LP_CO.filter(function(c){return c[0]===cc;})[0]; return m?m[1].slice(3):cc; }
function lpFmt(v,cur){ if(v==null) return '—'; try{ return new Intl.NumberFormat(undefined,{style:'currency',currency:cur,maximumFractionDigits:0}).format(v); }catch(e){ return Math.round(v)+' '+cur; } }
function localHTML(d){
  var L=lpL();
  var opts=LP_CO.map(function(c){return '<option value="'+c[0]+'"'+(c[0]===d.country?' selected':'')+'>'+c[1]+'</option>';}).join('');
  var body;
  if(d.newAvg==null && d.usedAvg==null){ body='<div class="lp-none">'+L.none+' '+lpName(d.country)+'</div>'; }
  else { body='<div class="lp-vals"><div><span>'+L.nw+'</span><b>'+lpFmt(d.newAvg,d.currency)+'</b></div><div><span>'+L.us+'</span><b>'+lpFmt(d.usedAvg,d.currency)+'</b></div></div>'; }
  return '<div class="lp-head"><span class="lp-ttl">'+L.t+'</span>'+
    '<select class="lp-sel" aria-label="Country" onchange="loadLocal(this.closest(\'.localbox\').getAttribute(\'data-set\'),this.value)">'+opts+'</select></div>'+body;
}
function lockedHTML(){
  var L=lpL();
  return '<a class="lp-lock" href="#pricing"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg><span class="lp-txt">'+L.lock+'</span><span class="lp-pro">Pro</span></a>';
}
function loadLocal(sn,cc){
  var box=document.querySelector('.localbox[data-set="'+sn+'"]'); if(!box) return;
  if(!cc) box.innerHTML='<div class="lp-load">…</div>';
  fetch('/api/local-price?set='+encodeURIComponent(sn)+(cc?'&cc='+encodeURIComponent(cc):''))
    .then(function(r){return r.json();})
    .then(function(d){ if(!box) return; if(d&&d.locked){box.innerHTML=lockedHTML();} else if(d&&!d.error){box.innerHTML=localHTML(d);} else {box.innerHTML='';} })
    .catch(function(){ if(box) box.innerHTML=''; });
}
function initLocalbox(){ var b=document.querySelector('.localbox[data-set]:not([data-done])'); if(b){ b.setAttribute('data-done','1'); loadLocal(b.getAttribute('data-set'),''); } }
window.loadLocal=loadLocal;

function skeletonHTML(){
  return `<div class="vcard skloading" aria-busy="true" aria-label="Loading">
    <div class="bg-bar"><div class="bg-bar-fill" id="bgProg"></div></div>
    <div class="lbl"><span class="dot"></span>${T.loading}</div>
    <div class="skrow">
      <div class="sk sk-img"></div>
      <div class="sk-lines">
        <div class="sk sk-l" style="width:62%;height:23px"></div>
        <div class="sk sk-l" style="width:46%"></div>
        <div class="sk sk-l" style="width:34%"></div>
        <div class="sk sk-l" style="width:26%;height:27px;border-radius:99px;margin-top:5px"></div>
      </div>
    </div>
    <div class="sk-grid"><div class="sk sk-cell"></div><div class="sk sk-cell"></div><div class="sk sk-cell"></div></div>
  </div>`;
}

async function doSearch(){
  const q = document.getElementById('setInput').value.trim();
  if(!q) return;
  if(freeUsed() >= FREE_LIMIT){ openWall(); return; }
  const box = document.getElementById('result');
  const btn = document.querySelector('button.btn[onclick*="doSearch"]');
  const btnHTML = btn ? btn.innerHTML : '';
  if(btn){ btn.classList.add('loading'); btn.innerHTML = '<span class="spin"></span>'+btnHTML; }
  box.innerHTML = skeletonHTML();
  const fill = document.getElementById('bgProg');
  let p = 8;
  const timer = setInterval(function(){ p += (92-p)*0.13; if(fill) fill.style.width = p.toFixed(1)+'%'; }, 220);
  let finished = false;
  function done(){ if(finished) return; finished = true; clearInterval(timer); if(fill) fill.style.width='100%';
    if(btn){ btn.classList.remove('loading'); btn.innerHTML = btnHTML; } }
  try{
    const r = await fetch('/api/value?u=1&set='+encodeURIComponent(q));
    if(r.status===429){ done(); box.innerHTML=''; setFree(FREE_LIMIT); openWall(); return; }
    const d = await r.json();
    if(d.limit){ done(); box.innerHTML=''; setFree(FREE_LIMIT); openWall(); return; }
    done();
    setTimeout(function(){ box.innerHTML = cardHTML(d); initLocalbox(); }, 200); // let the bar visibly complete, then swap
    if(!d.error) setFree(freeUsed()+1);
  }catch(e){ done(); box.innerHTML = `<div class="vcard"><div class="loading">${T.wrong}</div></div>`; }
}

async function loadExamples(){
  const sets = ['10276','10265','10281'];
  const wrap = document.getElementById('exampleCards');
  if(wrap) wrap.innerHTML = Array(3).fill(
    '<div class="ex" aria-busy="true">'+
      '<div class="sk" style="width:100%;height:140px;border-radius:10px"></div>'+
      '<div class="sk" style="width:60%;height:16px;margin:16px auto 0"></div>'+
      '<div class="sk" style="width:82%;height:12px;margin:11px auto 0"></div>'+
      '<div class="sk" style="width:42%;height:24px;border-radius:99px;margin:15px auto 0"></div>'+
    '</div>').join('');
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
    initLocalbox();
  }catch(e){}
}

refreshFree();
loadExamples();
loadDemo();
