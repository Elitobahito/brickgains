// BrickGains — auth modal (email/password + Google placeholder) + 10% discount popup
(function(){
  let me = null;

  const authHTML = `
  <div class="modal-bg" id="authWall">
    <div class="modal auth">
      <span class="x" onclick="BG.closeAuth()">✕</span>
      <div class="authlogo"><span class="studs"><i></i><i></i><i></i><i></i></span>BrickGains</div>
      <h3 id="authTitle">Welcome back</h3>
      <p id="authSub">Log in to track your collection.</p>
      <button class="gbtn" onclick="BG.google()">
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.4 21.3 7.4 24 12 24z"/><path fill="#FBBC05" d="M5.4 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.4C.5 8.3 0 10.1 0 12s.5 3.7 1.4 5.4l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.7 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>
        Continue with Google
      </button>
      <div class="ordiv"><span>or</span></div>
      <form onsubmit="BG.submit(event)">
        <input id="authEmail" type="email" placeholder="Email" autocomplete="email" required>
        <input id="authPass" type="password" placeholder="Password (8+ characters)" autocomplete="current-password" required>
        <div class="authmsg" id="authMsg"></div>
        <button class="btn lg" type="submit" id="authSubmit" style="width:100%">Log in</button>
      </form>
      <div class="authswitch">
        <span id="authSwitchTxt">New here?</span>
        <a onclick="BG.toggle()" id="authSwitchLink">Create an account</a>
      </div>
    </div>
  </div>

  <div class="modal-bg" id="acctWall">
    <div class="modal">
      <span class="x" onclick="BG.closeAcct()">✕</span>
      <div class="authlogo"><span class="studs"><i></i><i></i><i></i><i></i></span>BrickGains</div>
      <h3>Your account</h3>
      <p id="acctEmail" style="font-weight:700;color:var(--ink)"></p>
      <p id="acctPlan" style="margin-top:-6px"></p>
      <a class="btn lg" href="/app" style="width:100%;margin-bottom:10px">Open my portfolio</a>
      <a class="altlink" onclick="BG.logout()">Log out</a>
    </div>
  </div>

  <div class="popup-bg" id="promoWall">
    <div class="promo">
      <span class="x" onclick="BG.closePromo()">✕</span>
      <div class="promo-badge">🧱 Limited offer</div>
      <h3>Get <span class="hl">10% off</span> your first month</h3>
      <p>Join now and unlock unlimited checks, your portfolio dashboard and price alerts, 10% cheaper.</p>
      <form onsubmit="BG.claim(event)">
        <input id="promoEmail" type="email" placeholder="you@email.com" required>
        <button class="btn lg" type="submit" style="width:100%">Claim my 10% code</button>
      </form>
      <div class="promo-done" id="promoDone"></div>
      <div class="promo-fine">No spam. Unsubscribe anytime.</div>
    </div>
  </div>`;

  function el(id){ return document.getElementById(id); }

  const BG = {
    mode: 'login',
    openAuth(mode){ BG.mode = mode||'login'; BG.render(); el('authWall').classList.add('on'); },
    closeAuth(){ el('authWall').classList.remove('on'); },
    openAcct(){ if(me){ el('acctEmail').textContent = me.email; el('acctPlan').textContent = 'Plan: '+(me.plan||'free'); el('acctWall').classList.add('on'); } },
    closeAcct(){ el('acctWall').classList.remove('on'); },
    toggle(){ BG.mode = BG.mode==='login' ? 'signup' : 'login'; BG.render(); },
    render(){
      const login = BG.mode==='login';
      el('authTitle').textContent = login ? 'Welcome back' : 'Create your account';
      el('authSub').textContent = login ? 'Log in to track your collection.' : 'Start tracking your LEGO in seconds.';
      el('authSubmit').textContent = login ? 'Log in' : 'Create account';
      el('authPass').autocomplete = login ? 'current-password' : 'new-password';
      el('authSwitchTxt').textContent = login ? 'New here?' : 'Already have an account?';
      el('authSwitchLink').textContent = login ? 'Create an account' : 'Log in';
      el('authMsg').textContent = '';
    },
    async submit(e){
      e.preventDefault();
      const email = el('authEmail').value.trim();
      const password = el('authPass').value;
      const msg = el('authMsg'); msg.className='authmsg'; msg.textContent='Please wait...';
      const url = BG.mode==='login' ? '/api/login' : '/api/signup';
      try{
        const r = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
        const d = await r.json();
        if(d.ok){ me = d.user; msg.className='authmsg ok'; msg.textContent='✅ Success! Redirecting...';
          setTimeout(()=>{ location.href='/app'; }, 500); }
        else { msg.className='authmsg err'; msg.textContent = d.error || 'Something went wrong.'; }
      }catch(err){ msg.className='authmsg err'; msg.textContent='Network error. Try again.'; }
    },
    google(){ el('authMsg').className='authmsg'; el('authMsg').textContent='Google sign-in is being set up, use email for now.'; },
    async logout(){ try{ await fetch('/api/logout',{method:'POST'}); }catch(e){} me=null; BG.closeAcct(); BG.renderIcon(); if(location.pathname==='/app') location.href='/'; },
    renderIcon(){
      const btn = el('accountBtn'); if(!btn) return;
      btn.title = me ? (me.email) : 'Sign in';
      btn.classList.toggle('in', !!me);
    },
    async refreshMe(){ try{ const r=await fetch('/api/me'); me=(await r.json()).user; }catch(e){ me=null; } BG.renderIcon(); return me; },
    // discount popup
    closePromo(){ el('promoWall').classList.remove('on'); localStorage.setItem('bg_promo','1'); },
    async claim(e){
      e.preventDefault();
      const email = el('promoEmail').value.trim();
      const done = el('promoDone'); done.textContent='...';
      try{
        await fetch('/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,topic:'discount-10'})});
      }catch(err){}
      done.innerHTML = 'Your code: <b>BRICK10</b> &mdash; applied at checkout. <a onclick="BG.goPricing()">See plans &rarr;</a>';
      localStorage.setItem('bg_promo','1');
    },
    goPricing(){ el('promoWall').classList.remove('on'); const p=document.getElementById('pricing'); if(p) p.scrollIntoView({behavior:'smooth'}); },
    maybePromo(){
      if(localStorage.getItem('bg_promo') || me) return;
      setTimeout(()=>{ if(!me && !localStorage.getItem('bg_promo')) el('promoWall').classList.add('on'); }, 18000);
    }
  };
  window.BG = BG;

  document.addEventListener('DOMContentLoaded', async ()=>{
    document.body.insertAdjacentHTML('beforeend', authHTML);
    const btn = el('accountBtn');
    if(btn) btn.addEventListener('click', ()=> me ? BG.openAcct() : BG.openAuth('login'));
    await BG.refreshMe();
    if(document.getElementById('promoWall') && !location.pathname.startsWith('/app')) BG.maybePromo();
  });
})();
