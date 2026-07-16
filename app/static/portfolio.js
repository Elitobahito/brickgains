function load(){ try{return JSON.parse(localStorage.getItem('bb_pf')||'[]')}catch(e){return[]} }
function save(a){ localStorage.setItem('bb_pf', JSON.stringify(a)); }
function money(v){ return v==null?'-':'$'+Math.round(v).toLocaleString('en-US'); }

async function addSet(){
  const set = document.getElementById('pset').value.trim();
  const price = parseFloat(document.getElementById('pprice').value);
  if(!set) return;
  const pf = load();
  pf.push({set, paid: isNaN(price)?null:price});
  save(pf);
  document.getElementById('pset').value=''; document.getElementById('pprice').value='';
  render();
}

function removeSet(i){ const pf=load(); pf.splice(i,1); save(pf); render(); }

async function render(){
  const pf = load();
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
    <th>Set</th><th>Status</th><th style="text-align:right">Paid</th>
    <th style="text-align:right">Value (new)</th><th style="text-align:right">Gain</th><th></th>
    </tr></thead><tbody id="tb">
    ${pf.map((_,i)=>`<tr id="r${i}"><td colspan="6" style="color:#999">Loading…</td></tr>`).join('')}
    </tbody></table>`;

  let paidTot=0, valTot=0;
  for(let i=0;i<pf.length;i++){
    const item = pf[i];
    let d={};
    try{ d = await fetch('/api/value?set='+encodeURIComponent(item.set)).then(r=>r.json()); }catch(e){ d={error:1}; }
    const val = d.newAvg;
    const paid = item.paid;
    if(paid) paidTot += paid;
    if(val) valTot += val;
    let gain='-', gcls='';
    if(paid && val){ const g=val-paid; gain=(g>=0?'+':'')+money(g); gcls=g>=0?'up-t':'down-t'; }
    const status = d.retired ? `<span class="chip ret">Retired</span>` : `<span class="chip av">Available</span>`;
    const row = document.getElementById('r'+i);
    if(row) row.innerHTML = d.error
      ? `<td>${item.set}</td><td colspan="4" style="color:#999">Not found</td><td><button class="del" onclick="removeSet(${i})">✕</button></td>`
      : `<td><b>${d.name}</b><br><span style="color:#999;font-size:13px">${d.set}</span></td>
         <td>${status}</td>
         <td class="num">${money(paid)}</td>
         <td class="num">${money(val)}</td>
         <td class="num ${gcls}">${gain}</td>
         <td><button class="del" onclick="removeSet(${i})">✕</button></td>`;
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

render();

// ---- Market Movers ----
let MV = [];
function pct(a){ return (a>0?'+':'')+a+'%'; }
function badgeCls(a){ return a>0?'up':(a<0?'down':'flat'); }
function pickSet(s){ const i=document.getElementById('pset'); if(i){ i.value=s; i.focus(); i.scrollIntoView({behavior:'smooth',block:'center'}); } }

async function loadMovers(){
  try{
    const d = await fetch('/api/movers').then(r=>r.json());
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
    <div class="ex" onclick="pickSet('${(d.set||'').replace('-1','')}')" style="cursor:pointer">
      <img src="${d.image||''}" onerror="this.style.visibility='hidden'">
      <h4>${d.name}</h4>
      <div class="prices">Retail ${money(d.rrp)} &rarr; New ${money(d.newAvg)}</div>
      <span class="mv-badge ${badgeCls(d.appreciation)}" style="margin-top:10px;display:inline-block">${pct(d.appreciation)}</span>
    </div>`).join('');
  document.getElementById('moversTop').innerHTML = top;

  const rows = list.map(d=>{
    const st = d.retired ? `<span class="mv-chip">Retired</span>` : `<span class="mv-chip av">Available</span>`;
    return `<tr class="clik" onclick="pickSet('${(d.set||'').replace('-1','')}')">
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
