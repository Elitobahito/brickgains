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
