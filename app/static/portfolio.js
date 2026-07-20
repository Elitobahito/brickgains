function money(v){ return v==null?'-':'$'+Math.round(v).toLocaleString('en-US'); }

// account state: ME=null => local (localStorage) mode; ME set => server (DB) mode
let ME = null;
function lload(){ try{return JSON.parse(localStorage.getItem('bb_pf')||'[]')}catch(e){return[]} }
function lsave(a){ localStorage.setItem('bb_pf', JSON.stringify(a)); }

async function initPortfolio(){
  try{ ME = (await fetch('/api/me').then(r=>r.json())).user || null; }catch(e){ ME=null; }
  const note = document.getElementById('syncNote');
  if(ME){
    note.textContent = '✓ Synced to your account ('+ME.email+')';
    document.getElementById('shareBar').style.display='flex';
    if(ME.share_id) showShareLink(ME.share_id);
    // one-time migration of any device portfolio into the account
    const local = lload();
    if(local.length){
      for(const it of local){
        try{ await fetch('/api/portfolio/add',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({set:it.set,paid:it.paid,condition:it.condition||'sealed'})}); }catch(e){}
      }
      localStorage.removeItem('bb_pf');
    }
  } else {
    note.textContent = 'Saved on this device. Log in to sync across devices.';
  }
  render();
  applyGating();
}

function applyGating(){
  if(isPaid()) return;
  var eb = document.querySelector('#panel-ebay .ebay-calc');
  if(eb) eb.outerHTML = upsellHTML('eBay profit calculator is a Pro feature','Know your exact profit after eBay fees and shipping before you sell - included in Pro.');
}

// returns unified list [{key, set, paid, condition, sid(server id|null)}]
async function getPF(){
  if(ME){
    try{
      const items = (await fetch('/api/portfolio').then(r=>r.json())).items||[];
      return items.map(r=>({sid:r.id, set:r.set_num, paid:r.paid, condition:r.condition||'sealed', qty:r.qty||1, sold:(r.sold_price==null?null:r.sold_price), soldDate:r.sold_date||null}));
    }catch(e){ return []; }
  }
  return lload().map(it=>({sid:null, set:it.set, paid:it.paid, condition:it.condition||'sealed', qty:1}));
}

async function addSet(){
  const set = document.getElementById('pset').value.trim();
  const price = parseFloat(document.getElementById('pprice').value);
  const cond = document.getElementById('pcond').value;
  if(!set) return;
  const paid = isNaN(price)?null:price;
  var qi=document.getElementById('pqty'); var qty=qi?Math.max(1,parseInt(qi.value)||1):1;
  if(ME){
    const r = await fetch('/api/portfolio/add',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({set,paid,condition:cond,qty})});
    const d = await r.json().catch(()=>({}));
    if(d && d.limit){ alert(d.error||'Free plan limit reached. Upgrade to Pro for unlimited.'); location.href='/pricing'; return; }
  } else { const pf=lload(); pf.push({set,paid,condition:cond}); lsave(pf); }
  if(qi) qi.value='1';
  document.getElementById('pset').value=''; document.getElementById('pprice').value='';
  render();
}

async function removeSet(sid, set){
  if(ME && sid){ await fetch('/api/portfolio/remove',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:sid})}); }
  else { const pf=lload(); const i=pf.findIndex(x=>x.set===set); if(i>=0){pf.splice(i,1); lsave(pf);} }
  render();
}

function toggleImport(){ const b=document.getElementById('importBox'); b.style.display = b.style.display==='none'?'block':'none'; }
async function doImport(){
  const raw = document.getElementById('importRaw').value.trim();
  if(!raw) return;
  if(ME){ const r = await fetch('/api/portfolio/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raw})}); const d = await r.json().catch(()=>({})); if(d && d.limit){ alert(d.error||'Free plan limit reached. Upgrade to Pro for unlimited.'); } }
  else {
    const pf=lload(); const seen=new Set(pf.map(x=>x.set));
    raw.split(/[\s,;\n]+/).forEach(t=>{const s=t.trim().replace('-1',''); if(s&&!seen.has(s)){seen.add(s); pf.push({set:s,paid:null,condition:'sealed'});}});
    lsave(pf);
  }
  document.getElementById('importRaw').value=''; toggleImport(); render();
}

// ---- Public sharing ----
function showShareLink(sid){
  const url = location.origin + '/u/' + sid;
  document.getElementById('shareLink').value = url;
  document.getElementById('shareLinkBox').style.display = 'flex';
  document.getElementById('shareToggle').style.display = 'none';
}
async function toggleShare(){
  const r = await fetch('/api/portfolio/share',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({on:true})}).then(x=>x.json());
  if(r.ok && r.share_id) showShareLink(r.share_id);
}
async function unshare(){
  await fetch('/api/portfolio/share',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({on:false})});
  document.getElementById('shareLinkBox').style.display='none';
  document.getElementById('shareToggle').style.display='';
}
function copyShare(){
  const i=document.getElementById('shareLink'); i.select();
  navigator.clipboard.writeText(i.value).then(()=>{const b=event.target;const t=b.textContent;b.textContent='Copied!';setTimeout(()=>b.textContent=t,1400);});
}

async function render(){
  const pf = await getPF();
  const wrap = document.getElementById('tableWrap');
  document.getElementById('stCount').textContent = pf.length;
  if(!pf.length){
    wrap.innerHTML = '<div class="empty">No sets yet. Add your first set above to see its value.</div>';
    document.getElementById('stPaid').textContent='$0';
    document.getElementById('stValue').textContent='$0';
    document.getElementById('stRoi').textContent='0%';
    return;
  }
  var inv = ME && ME.plan==='investor';
  wrap.innerHTML = `<table class="pf"><thead><tr>
    <th>Set</th><th>Condition</th><th>Status</th>${inv?'<th style="text-align:center">Qty</th>':''}<th style="text-align:right">Paid</th>
    <th style="text-align:right">Value (new)</th><th style="text-align:right">Gain</th><th></th>
    </tr></thead><tbody id="tb">
    ${pf.map((_,i)=>`<tr id="r${i}"><td colspan="${inv?8:7}" style="color:#999">Loading…</td></tr>`).join('')}
    </tbody></table>`;

  let paidTot=0, valTot=0, realizedPL=0, soldCount=0; PF_LAST=[];
  for(let i=0;i<pf.length;i++){
    const item = pf[i];
    let d={};
    try{ d = await fetch('/api/value?set='+encodeURIComponent(item.set)).then(r=>r.json()); }catch(e){ d={error:1}; }
    // used value applies when the set is opened
    const val = item.condition==='opened' ? (d.usedAvg||d.newAvg) : d.newAvg;
    const paid = item.paid;
    const q = item.qty||1;
    const sold = item.sold!=null;
    if(!sold && paid) paidTot += paid*q;
    if(!sold && val) valTot += val*q;
    PF_LAST.push({set:item.set, name:(d.name||''), condition:item.condition, qty:q, paid:(paid==null?'':paid), value:(val==null?'':Math.round(val)), retired:(d.retired?'retired':'available')});
    let gain='-', gcls='';
    if(sold){
      const pl=(item.sold-(paid||0))*q; gain=(pl>=0?'+':'')+money(pl); gcls=pl>=0?'up-t':'down-t';
      realizedPL+=pl; soldCount++;
    } else if(paid && val){ const g=(val-paid)*q; gain=(g>=0?'+':'')+money(g); gcls=g>=0?'up-t':'down-t'; }
    const status = sold ? `<span class="chip sold">Sold${item.soldDate?' · '+item.soldDate:''}</span>`
                        : (d.retired ? `<span class="chip ret">Retired</span>` : `<span class="chip av">Available</span>`);
    const cond = `<span class="cond ${item.condition}">${item.condition==='opened'?'Opened':'Sealed'}</span>`;
    const rm = `removeSet(${item.sid?item.sid:'null'},'${item.set}')`;
    const sellBtn = (inv && item.sid) ? `<button class="del sell" title="${sold?'Edit sale price':'Mark as sold'}" onclick="sellSet(${item.sid},${sold?item.sold:''})">💰</button>` : '';
    const valCell = sold ? `${money(item.sold)} <span style="color:#999;font-size:11px">sold</span>` : money(val);
    const qtyCell = inv ? `<td class="num" style="text-align:center">${item.sid?`<span class="qty-step"><button onclick="setQty(${item.sid},${q-1})">−</button><b>${q}</b><button onclick="setQty(${item.sid},${q+1})">+</button></span>`:q}</td>` : '';
    const row = document.getElementById('r'+i);
    if(row) row.innerHTML = (d.error||!d.name)
      ? `<td>${item.set}</td><td colspan="${inv?6:5}" style="color:#999">Not found</td><td><button class="del" onclick="${rm}">✕</button></td>`
      : `<td><b>${d.name}</b><br><span style="color:#999;font-size:13px">${d.set}</span></td>
         <td>${cond}</td>
         <td>${status}</td>
         ${qtyCell}
         <td class="num">${money(paid)}</td>
         <td class="num">${valCell}</td>
         <td class="num ${gcls}">${gain}</td>
         <td style="white-space:nowrap">${sellBtn}<button class="del" onclick="${rm}">✕</button></td>`;
  }
  document.getElementById('stPaid').textContent = money(paidTot);
  document.getElementById('stValue').textContent = money(valTot);
  const roiEl = document.getElementById('stRoi');
  if(paidTot>0){
    const roi = Math.round((valTot-paidTot)/paidTot*100);
    roiEl.textContent = (roi>=0?'+':'')+roi+'%';
    roiEl.className = 'v '+(roi>=0?'up-t':'down-t');
  } else roiEl.textContent='0%';
  if(inv && soldCount>0){
    wrap.insertAdjacentHTML('beforeend', '<div class="realized-row">💰 Realized P&L on '+soldCount+' sold set'+(soldCount>1?'s':'')+': <b class="'+(realizedPL>=0?'up-t':'down-t')+'">'+(realizedPL>=0?'+':'')+money(realizedPL)+'</b></div>');
  }
  loadPortfolioChart();
  applyExportGate();
}

async function sellSet(id, current){
  if(!(ME && ME.plan==='investor')){ location.href='/pricing'; return; }
  var v = prompt('Sale price ($) — leave empty to un-mark as sold:', (current===''||current==null)?'':current);
  if(v===null) return;
  v = String(v).trim();
  var price = (v==='') ? null : parseFloat(v);
  if(v!=='' && !(price>=0)){ alert('Enter a valid sale price.'); return; }
  await fetch('/api/portfolio/sell',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id, sold_price:price})});
  render();
}
window.sellSet = sellSet;

let PF_LAST=[];

function applyExportGate(){
  var inv = ME && ME.plan==='investor';
  var b=document.getElementById('csvBtn'); if(b) b.style.display = inv ? '' : 'none';
  var p=document.getElementById('pdfBtn'); if(p) p.style.display = inv ? '' : 'none';
  var q=document.getElementById('pqtyWrap'); if(q) q.style.display = inv ? '' : 'none';
}

async function setQty(id, qty){
  if(qty<1) return;
  await fetch('/api/portfolio/qty',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id,qty:qty})});
  render();
}

function pdfReport(){
  if(!(ME && ME.plan==='investor')){ location.href='/pricing'; return; }
  if(!PF_LAST.length){ alert('Add sets first.'); return; }
  var paidT=0,valT=0,rows='';
  PF_LAST.forEach(function(r){
    var q=r.qty||1; var pv=(r.paid||0)*q, vv=(r.value||0)*q; paidT+=pv; valT+=vv;
    rows+='<tr><td>'+r.set+'</td><td>'+r.name+'</td><td>'+r.condition+'</td><td style="text-align:center">'+q+'</td><td style="text-align:right">'+(r.value?'$'+r.value.toLocaleString('en-US'):'-')+'</td><td style="text-align:right">'+(vv?'$'+vv.toLocaleString('en-US'):'-')+'</td></tr>';
  });
  var today=new Date().toISOString().slice(0,10);
  var html='<html><head><title>BrickGains insurance report</title><style>'
    +'body{font-family:Arial,sans-serif;color:#141414;padding:30px;max-width:820px;margin:0 auto}'
    +'h1{color:#E3000B;margin:0 0 4px}.sub{color:#666;margin:0 0 20px}'
    +'table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #ddd;padding:8px}th{text-align:left;background:#f6f4ec}'
    +'.tot{font-size:18px;font-weight:800;margin-top:18px}.foot{color:#999;font-size:11px;margin-top:24px}</style></head><body>'
    +'<h1>BrickGains</h1><p class="sub">LEGO collection valuation - insurance report · '+today+'</p>'
    +'<table><thead><tr><th>Set</th><th>Name</th><th>Condition</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit value</th><th style="text-align:right">Line value</th></tr></thead><tbody>'+rows+'</tbody></table>'
    +'<p class="tot">Total estimated market value: $'+Math.round(valT).toLocaleString('en-US')+'</p>'
    +'<p class="foot">Values are estimates from live BrickLink marketplace data on '+today+'. For insurance reference only.</p>'
    +'<script>window.onload=function(){window.print();}<\/script></body></html>';
  var w=window.open('','_blank'); w.document.write(html); w.document.close();
}

function exportCSV(){
  if(!(ME && ME.plan==='investor')){ location.href='/pricing'; return; }
  if(!PF_LAST.length){ alert('Add sets first.'); return; }
  var head=['Set','Name','Condition','Paid','Value','Status'];
  var lines=[head.join(',')];
  PF_LAST.forEach(function(r){
    var row=[r.set, '"'+String(r.name).replace(/"/g,'""')+'"', r.condition, r.paid, r.value, r.retired];
    lines.push(row.join(','));
  });
  var blob=new Blob([lines.join('\n')],{type:'text/csv'});
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='brickgains-portfolio.csv'; a.click(); URL.revokeObjectURL(a.href);
}

// ---- Mobile barcode scanner (native BarcodeDetector, no external lib) ----
async function openScanner(){
  var input=document.getElementById('pset');
  if(!('BarcodeDetector' in window)){
    alert('Scanning works on Android Chrome. On iPhone, just type the set number - it also works.');
    if(input) input.focus();
    return;
  }
  var det;
  try{ det=new BarcodeDetector({formats:['ean_13','upc_a','ean_8','upc_e']}); }
  catch(e){ alert('Scanner not available on this device.'); return; }
  var ov=document.createElement('div'); ov.className='scan-ov';
  ov.innerHTML='<div class="scan-box"><video playsinline muted></video><div class="scan-frame"></div><div class="scan-hint">Point at the barcode on the LEGO box</div><button class="scan-close" aria-label="Close">✕</button></div>';
  document.body.appendChild(ov);
  var video=ov.querySelector('video'), stream=null, timer=null;
  function close(){ if(timer)clearInterval(timer); if(stream)stream.getTracks().forEach(function(t){t.stop();}); ov.remove(); }
  ov.querySelector('.scan-close').onclick=close;
  ov.onclick=function(e){ if(e.target===ov) close(); };
  try{ stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}); }
  catch(e){ alert('Camera access denied. Allow the camera to scan.'); close(); return; }
  video.srcObject=stream; try{ await video.play(); }catch(e){}
  var busy=false;
  timer=setInterval(async function(){
    if(busy||!video.videoWidth) return; busy=true;
    try{
      var codes=await det.detect(video);
      if(codes&&codes.length){
        var raw=codes[0].rawValue; clearInterval(timer); timer=null;
        var d={}; try{ d=await fetch('/api/scan?code='+encodeURIComponent(raw)).then(function(r){return r.json();}); }catch(e){}
        close();
        if(d&&d.ok&&d.set){ onScanResult(d.set); }
        else { alert('Barcode read ('+raw+') but this set is not in our catalog yet. Type the set number instead.'); if(input) input.focus(); }
        return;
      }
    }catch(e){}
    busy=false;
  },500);
}
function onScanResult(setnum){
  var input=document.getElementById('pset');
  if(input){ input.value=setnum; input.focus(); input.scrollIntoView({behavior:'smooth',block:'center'}); }
  var note=document.getElementById('syncNote');
  if(note){ note.textContent='✓ Scanned LEGO '+setnum+' - set the price and tap Add.'; }
}

async function loadPortfolioChart(){
  var card=document.getElementById('pfChartCard'); if(!card) return;
  try{
    var r=await fetch('/api/portfolio/history'); var d=await r.json();
    if(d.locked || !d.points || d.points.length<2){ card.style.display='none'; return; }
    var pts=d.points;
    var W=680,H=200,pad=34;
    var vals=pts.map(function(p){return p.value;});
    var min=Math.min.apply(null,vals),max=Math.max.apply(null,vals);
    if(max===min){max=min+1;}
    var X=function(i){return pad+i*(W-2*pad)/(pts.length-1);};
    var Y=function(v){return H-pad-(v-min)*(H-2*pad)/(max-min);};
    var line=pts.map(function(p,i){return (i?'L':'M')+X(i).toFixed(1)+' '+Y(p.value).toFixed(1);}).join(' ');
    var area=line+' L'+X(pts.length-1).toFixed(1)+' '+(H-pad)+' L'+X(0).toFixed(1)+' '+(H-pad)+' Z';
    var last=pts[pts.length-1].value, first=pts[0].value;
    var chg=first>0?Math.round((last-first)/first*100):0;
    var svg='<svg viewBox="0 0 '+W+' '+H+'" width="100%" preserveAspectRatio="none" style="max-height:220px">'
      +'<path d="'+area+'" fill="rgba(10,143,60,.12)"/>'
      +'<path d="'+line+'" fill="none" stroke="#0a8f3c" stroke-width="2.5"/>'
      +'<circle cx="'+X(pts.length-1).toFixed(1)+'" cy="'+Y(last).toFixed(1)+'" r="4" fill="#0a8f3c"/></svg>';
    document.getElementById('pfChart').innerHTML=
      '<div class="pfc-top"><span class="pfc-val">'+money(last)+'</span>'
      +'<span class="pfc-chg '+(chg>=0?'up-t':'down-t')+'">'+(chg>=0?'+':'')+chg+'% since '+pts[0].day+'</span></div>'+svg;
    card.style.display='block';
  }catch(e){ card.style.display='none'; }
}

initPortfolio();

// ---- Market Movers ----
let MV = [];
function pct(a){ return (a>0?'+':'')+a+'%'; }
function badgeCls(a){ return a>0?'up':(a<0?'down':'flat'); }
function pickSet(s){ const i=document.getElementById('pset'); if(i){ i.value=s; i.focus(); i.scrollIntoView({behavior:'smooth',block:'center'}); } }
function openSet(s){ const n=String(s||'').replace('-1',''); if(n) window.open('/set/'+n, '_blank', 'noopener'); }

function isPaid(){ return ME && (ME.plan==='pro' || ME.plan==='investor'); }
function upsellHTML(title, desc){
  return '<div class="feat-lock"><div class="fl-ic">🔒</div>'
    +'<h3>'+title+'</h3><p>'+desc+'</p>'
    +'<a class="btn" href="/pricing">Upgrade to Pro - $4.99/mo</a></div>';
}
async function loadMovers(){
  try{
    const r = await fetch('/api/movers');
    const d = await r.json();
    if(d && d.locked){
      const tbl=document.getElementById('moversTable'); if(tbl) tbl.innerHTML=upsellHTML('Market Movers is a Pro feature','See the biggest LEGO gainers, laggards and retiring winners updated weekly.');
      const top=document.getElementById('moversTop'); if(top) top.innerHTML='';
      const up=document.getElementById('moversUpdated'); if(up) up.textContent='';
      const tabs=document.querySelector('.mv-tabs'); if(tabs) tabs.style.display='none';
      return;
    }
    MV = d.sets||[];
    const up = document.getElementById('moversUpdated');
    if(up && d.updated) up.textContent = 'Updated '+d.updated+' · '+MV.length+' sets';
    if(MV.length) moversView('gainers');
    else document.querySelector('.movers-sec').style.display='none';
  }catch(e){ const s=document.querySelector('.movers-sec'); if(s) s.style.display='none'; }
}

function moversView(view){
  document.querySelectorAll('.mv-tab').forEach(t=>t.classList.toggle('on', t.dataset.view===view));
  let list = MV.slice();
  if(view==='gainers') list.sort((a,b)=>b.appreciation-a.appreciation);
  else if(view==='losers') list.sort((a,b)=>a.appreciation-b.appreciation);
  else if(view==='retiring'){ list = list.filter(x=>!x.retired).sort((a,b)=>b.appreciation-a.appreciation); }

  const top = list.slice(0,4).map(d=>`
    <div class="ex" onclick="openSet('${(d.set||'').replace('-1','')}')" style="cursor:pointer">
      <img src="${d.image||''}" onerror="this.style.visibility='hidden'">
      <h4>${d.name}</h4>
      <div class="prices">Retail ${money(d.rrp)} &rarr; New ${money(d.newAvg)}</div>
      <span class="mv-badge ${badgeCls(d.appreciation)}" style="margin-top:10px;display:inline-block">${pct(d.appreciation)}</span>
    </div>`).join('');
  document.getElementById('moversTop').innerHTML = top;

  const rows = list.map(d=>{
    const st = d.retired ? `<span class="mv-chip">Retired</span>` : `<span class="mv-chip av">Available</span>`;
    return `<tr class="clik" onclick="openSet('${(d.set||'').replace('-1','')}')">
      <td class="mv-set"><img src="${d.image||''}" onerror="this.style.display='none'">${d.name}${st}</td>
      <td>${d.theme||''} ${d.year?'· '+d.year:''}</td>
      <td class="num">${money(d.rrp)}</td>
      <td class="num">${money(d.newAvg)}</td>
      <td class="num"><span class="mv-badge ${badgeCls(d.appreciation)}">${pct(d.appreciation)}</span></td>
    </tr>`;
  }).join('');
  document.getElementById('moversTable').innerHTML =
    `<table class="mv"><thead><tr><th>Set</th><th>Theme</th><th style="text-align:right">Retail</th><th style="text-align:right">Value (new)</th><th style="text-align:right">Gain vs retail</th></tr></thead><tbody>${rows}</tbody></table>`;
}

loadMovers();

// ---- Watchlist (server-backed when logged in, with optional price target) ----
function wloadLocal(){ try{ return (JSON.parse(localStorage.getItem('bb_watch')||'[]')).map(x=> typeof x==='string'?{set:x,target:null}:x); }catch(e){ return []; } }
function wsaveLocal(a){ localStorage.setItem('bb_watch', JSON.stringify(a)); }
async function getWatch(){
  if(ME){
    try{ return ((await fetch('/api/watchlist').then(r=>r.json())).items||[]).map(r=>({set:r.set_num, target:r.target})); }catch(e){ return []; }
  }
  return wloadLocal();
}
async function addWatch(){
  const el=document.getElementById('wset'); const set=el.value.trim().replace('-1','');
  const te=document.getElementById('wtarget'); let target=te?parseFloat(te.value):NaN; if(isNaN(target)) target=null;
  if(!set) return;
  if(ME){ await fetch('/api/watchlist/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({set,target})}); }
  else { const w=wloadLocal(); const ex=w.find(x=>x.set===set); if(ex){ex.target=target;} else {w.push({set,target});} wsaveLocal(w); }
  el.value=''; if(te) te.value=''; renderWatch();
}
async function removeWatch(set){
  if(ME){ await fetch('/api/watchlist/remove',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({set})}); }
  else { wsaveLocal(wloadLocal().filter(x=>x.set!==set)); }
  renderWatch();
}
function verdict(d){
  const a=d.appreciation!=null?d.appreciation:(d.rrp&&d.newAvg?Math.round((d.newAvg-d.rrp)/d.rrp*100):null);
  if(d.retired){ if(a!=null&&a>=25) return['HOLD','Retired winner. Hold or sell into strength.','hold'];
                 return['HOLD','Retired. Value should climb as supply dries up.','hold']; }
  if(a!=null&&a>=10) return['BUY','Available and already above retail. Grab before retirement.','buy'];
  return['WATCH','Still at retail. Buy on a promo, then hold to retirement.','watch'];
}
async function renderWatch(){
  const w=await getWatch(); const wrap=document.getElementById('watchWrap');
  if(!w.length){ wrap.innerHTML='<div class="empty">No sets watched yet. Add a set above to track it.</div>'; return; }
  wrap.innerHTML=`<table class="mv"><thead><tr><th>Set</th><th>Status</th><th style="text-align:right">Value (new)</th><th style="text-align:right">Target</th><th>Verdict</th><th></th></tr></thead><tbody>${w.map(it=>`<tr id="w_${it.set}"><td colspan="6" style="color:#999">Loading…</td></tr>`).join('')}</tbody></table>`;
  for(const it of w){
    const s=it.set;
    let d={}; try{ d=await fetch('/api/value?set='+encodeURIComponent(s)).then(r=>r.json()); }catch(e){ d={error:1}; }
    const row=document.getElementById('w_'+s); if(!row) continue;
    if(d.error||!d.name){ row.innerHTML=`<td>${s}</td><td colspan="4" style="color:#999">Not found</td><td><button class="del" onclick="removeWatch('${s}')">✕</button></td>`; continue; }
    const st=d.retired?`<span class="mv-chip">Retired</span>`:`<span class="mv-chip av">Available</span>`;
    const[vb,,vc]=verdict(d);
    let tgt='<span style="color:#bbb">-</span>';
    if(it.target!=null){ const hit=d.newAvg!=null && d.newAvg<=it.target; tgt=money(it.target)+(hit?' <span class="mv-chip av">🎯 hit</span>':''); }
    row.innerHTML=`<td class="mv-set"><img src="${d.image||''}" onerror="this.style.display='none'">${d.name}</td>
      <td>${st}</td><td class="num">${money(d.newAvg)}</td>
      <td class="num">${tgt}</td>
      <td><span class="vbadge ${vc}">${vb}</span></td>
      <td><button class="del" onclick="removeWatch('${s}')">✕</button></td>`;
  }
}
renderWatch();

// ---- Compare two sets ----
async function compareSets(){
  var a=(document.getElementById('cmpA').value||'').trim().replace('-1','');
  var b=(document.getElementById('cmpB').value||'').trim().replace('-1','');
  var out=document.getElementById('cmpOut');
  if(!a||!b){ out.innerHTML='<div class="empty">Enter two set numbers.</div>'; return; }
  out.innerHTML='<div class="empty">Loading…</div>';
  async function val(s){ try{ return await fetch('/api/value?set='+encodeURIComponent(s)).then(r=>r.json()); }catch(e){ return {error:1}; } }
  var da=await val(a), db=await val(b);
  if(da.error||!da.name){ out.innerHTML='<div class="empty">Set '+a+' not found.</div>'; return; }
  if(db.error||!db.name){ out.innerHTML='<div class="empty">Set '+b+' not found.</div>'; return; }
  function ppp(d){ return (d.newAvg&&d.pieces)?('$'+(d.newAvg/d.pieces).toFixed(2)):'-'; }
  function appr(d){ var x=d.appreciation!=null?d.appreciation:(d.rrp&&d.newAvg?Math.round((d.newAvg-d.rrp)/d.rrp*100):null); return x; }
  function col(d){
    return '<div class="cmp-col"><img src="'+(d.image||'')+'" onerror="this.style.display=\'none\'">'
      +'<h4>'+d.name+'</h4><span class="cmp-num">'+d.set+'</span>'
      +(d.retired?'<span class="mv-chip">Retired</span>':'<span class="mv-chip av">Available</span>')+'</div>';
  }
  function rowM(label,va,vb,hi){
    return '<tr><td class="cmp-k">'+label+'</td><td class="'+(hi==='a'?'cmp-win':'')+'">'+va+'</td><td class="'+(hi==='b'?'cmp-win':'')+'">'+vb+'</td></tr>';
  }
  var aa=appr(da), ab=appr(db);
  out.innerHTML='<div class="cmp-heads">'+col(da)+col(db)+'</div>'
    +'<table class="mv cmp-tbl"><tbody>'
    +rowM('Value (new)', money(da.newAvg), money(db.newAvg), (da.newAvg||0)>(db.newAvg||0)?'a':'b')
    +rowM('Appreciation', aa!=null?pct(aa):'-', ab!=null?pct(ab):'-', (aa||-999)>(ab||-999)?'a':'b')
    +rowM('Original RRP', money(da.rrp), money(db.rrp))
    +rowM('Pieces', da.pieces||'-', db.pieces||'-')
    +rowM('Price / piece', ppp(da), ppp(db))
    +rowM('Year', da.year||'-', db.year||'-')
    +'</tbody></table>';
}

// ---- eBay profit calculator ----
function ebayCalc(){
  const n=id=>parseFloat(document.getElementById(id).value)||0;
  const sell=n('ecSell'), cost=n('ecCost'), shipIn=n('ecShipIn'), shipOut=n('ecShipOut'), fee=n('ecFee');
  const gross=sell+shipIn;
  const fees=gross*(fee/100)+0.30;           // eBay final value fee + $0.30 per order
  const net=gross-fees-shipOut;
  const profit=net-cost;
  const margin=sell>0?Math.round(profit/sell*100):0;
  const m=v=>(v<0?'-$':'$')+Math.abs(Math.round(v)).toLocaleString('en-US');
  document.getElementById('ecFees').textContent=m(fees);
  document.getElementById('ecNet').textContent=m(net);
  const pe=document.getElementById('ecProfit'); pe.textContent=m(profit); pe.className=profit>=0?'up-t':'down-t';
  document.getElementById('ecMargin').textContent=margin+'%';
}
ebayCalc();
