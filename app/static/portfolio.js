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
      return items.map(r=>({sid:r.id, set:r.set_num, paid:r.paid, condition:r.condition||'sealed'}));
    }catch(e){ return []; }
  }
  return lload().map(it=>({sid:null, set:it.set, paid:it.paid, condition:it.condition||'sealed'}));
}

async function addSet(){
  const set = document.getElementById('pset').value.trim();
  const price = parseFloat(document.getElementById('pprice').value);
  const cond = document.getElementById('pcond').value;
  if(!set) return;
  const paid = isNaN(price)?null:price;
  if(ME){
    const r = await fetch('/api/portfolio/add',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({set,paid,condition:cond})});
    const d = await r.json().catch(()=>({}));
    if(d && d.limit){ alert(d.error||'Free plan limit reached. Upgrade to Pro for unlimited.'); location.href='/pricing'; return; }
  } else { const pf=lload(); pf.push({set,paid,condition:cond}); lsave(pf); }
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
  wrap.innerHTML = `<table class="pf"><thead><tr>
    <th>Set</th><th>Condition</th><th>Status</th><th style="text-align:right">Paid</th>
    <th style="text-align:right">Value (new)</th><th style="text-align:right">Gain</th><th></th>
    </tr></thead><tbody id="tb">
    ${pf.map((_,i)=>`<tr id="r${i}"><td colspan="7" style="color:#999">Loading…</td></tr>`).join('')}
    </tbody></table>`;

  let paidTot=0, valTot=0;
  for(let i=0;i<pf.length;i++){
    const item = pf[i];
    let d={};
    try{ d = await fetch('/api/value?set='+encodeURIComponent(item.set)).then(r=>r.json()); }catch(e){ d={error:1}; }
    // used value applies when the set is opened
    const val = item.condition==='opened' ? (d.usedAvg||d.newAvg) : d.newAvg;
    const paid = item.paid;
    if(paid) paidTot += paid;
    if(val) valTot += val;
    let gain='-', gcls='';
    if(paid && val){ const g=val-paid; gain=(g>=0?'+':'')+money(g); gcls=g>=0?'up-t':'down-t'; }
    const status = d.retired ? `<span class="chip ret">Retired</span>` : `<span class="chip av">Available</span>`;
    const cond = `<span class="cond ${item.condition}">${item.condition==='opened'?'Opened':'Sealed'}</span>`;
    const rm = `removeSet(${item.sid?item.sid:'null'},'${item.set}')`;
    const row = document.getElementById('r'+i);
    if(row) row.innerHTML = (d.error||!d.name)
      ? `<td>${item.set}</td><td colspan="5" style="color:#999">Not found</td><td><button class="del" onclick="${rm}">✕</button></td>`
      : `<td><b>${d.name}</b><br><span style="color:#999;font-size:13px">${d.set}</span></td>
         <td>${cond}</td>
         <td>${status}</td>
         <td class="num">${money(paid)}</td>
         <td class="num">${money(val)}</td>
         <td class="num ${gcls}">${gain}</td>
         <td><button class="del" onclick="${rm}">✕</button></td>`;
  }
  document.getElementById('stPaid').textContent = money(paidTot);
  document.getElementById('stValue').textContent = money(valTot);
  const roiEl = document.getElementById('stRoi');
  if(paidTot>0){
    const roi = Math.round((valTot-paidTot)/paidTot*100);
    roiEl.textContent = (roi>=0?'+':'')+roi+'%';
    roiEl.className = 'v '+(roi>=0?'up-t':'down-t');
  } else roiEl.textContent='0%';
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

// ---- Watchlist ----
function wload(){ try{return JSON.parse(localStorage.getItem('bb_watch')||'[]')}catch(e){return[]} }
function wsave(a){ localStorage.setItem('bb_watch', JSON.stringify(a)); }
function addWatch(){
  const el=document.getElementById('wset'); const set=el.value.trim().replace('-1','');
  if(!set) return;
  const w=wload(); if(!w.includes(set)) w.push(set); wsave(w); el.value=''; renderWatch();
}
function removeWatch(set){ wsave(wload().filter(x=>x!==set)); renderWatch(); }
function verdict(d){
  // acheter / garder / vendre depuis retraite + plus-value
  const a=d.appreciation!=null?d.appreciation:(d.rrp&&d.newAvg?Math.round((d.newAvg-d.rrp)/d.rrp*100):null);
  if(d.retired){ if(a!=null&&a>=25) return['HOLD','Retired winner. Hold or sell into strength.','hold'];
                 return['HOLD','Retired. Value should climb as supply dries up.','hold']; }
  if(a!=null&&a>=10) return['BUY','Available and already above retail. Grab before retirement.','buy'];
  return['WATCH','Still at retail. Buy on a promo, then hold to retirement.','watch'];
}
async function renderWatch(){
  const w=wload(); const wrap=document.getElementById('watchWrap');
  if(!w.length){ wrap.innerHTML='<div class="empty">No sets watched yet. Add a set above to track it.</div>'; return; }
  wrap.innerHTML=`<table class="mv"><thead><tr><th>Set</th><th>Status</th><th style="text-align:right">Retail</th><th style="text-align:right">Value (new)</th><th style="text-align:right">Gain</th><th>Verdict</th><th></th></tr></thead><tbody>${w.map(s=>`<tr id="w_${s}"><td colspan="7" style="color:#999">Loading…</td></tr>`).join('')}</tbody></table>`;
  for(const s of w){
    let d={}; try{ d=await fetch('/api/value?set='+encodeURIComponent(s)).then(r=>r.json()); }catch(e){ d={error:1}; }
    const row=document.getElementById('w_'+s); if(!row) continue;
    if(d.error||!d.name){ row.innerHTML=`<td>${s}</td><td colspan="5" style="color:#999">Not found</td><td><button class="del" onclick="removeWatch('${s}')">✕</button></td>`; continue; }
    const a=d.appreciation!=null?d.appreciation:(d.rrp&&d.newAvg?Math.round((d.newAvg-d.rrp)/d.rrp*100):null);
    const st=d.retired?`<span class="mv-chip">Retired</span>`:`<span class="mv-chip av">Available</span>`;
    const[vb,,vc]=verdict(d);
    row.innerHTML=`<td class="mv-set"><img src="${d.image||''}" onerror="this.style.display='none'">${d.name}</td>
      <td>${st}</td><td class="num">${money(d.rrp)}</td><td class="num">${money(d.newAvg)}</td>
      <td class="num"><span class="mv-badge ${badgeCls(a||0)}">${a!=null?pct(a):'-'}</span></td>
      <td><span class="vbadge ${vc}">${vb}</span></td>
      <td><button class="del" onclick="removeWatch('${s}')">✕</button></td>`;
  }
}
renderWatch();

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
