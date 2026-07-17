// BrickGains — auth modal (email/password + Google placeholder) + 10% discount popup
(function(){
  let me = null;
  const FRA = (window.LANG === 'fr');
  const LANG = window.LANG || 'en';
  const HOME = (LANG && LANG !== 'en') ? '/' + LANG : '/';
  const SP = {
  fr: {
    welcome:"Bon retour", loginSub:"Connectez-vous pour suivre votre collection.",
    createTitle:"Créez votre compte", createSub:"Commencez à suivre vos LEGO en quelques secondes.",
    google:"Continuer avec Google", or:"ou", email:"Email", pass:"Mot de passe (8+ caractères)",
    login:"Se connecter", create:"Créer un compte", newHere:"Nouveau ici ?", already:"Déjà un compte ?",
    doCreate:"Créer un compte", doLogin:"Se connecter",
    acct:"Votre compte", openPf:"Ouvrir mon portefeuille", logout:"Se déconnecter", manage:"Gérer l'abonnement",
    plan:"Offre : ", wait:"Veuillez patienter...", success:"✅ Réussi ! Redirection...",
    err:"Une erreur est survenue.", net:"Erreur réseau. Réessayez.",
    gsoon:"La connexion Google est en cours de mise en place, utilisez l'email pour l'instant.",
    limited:"🧱 Offre limitée", off10a:"Obtenez", off10b:"10 % de réduction", off10c:"sur votre premier mois",
    promoP:"Inscrivez-vous et débloquez estimations illimitées, tableau de bord et alertes de prix, 10 % moins cher.",
    claim:"Obtenir mon code -10 %", code:(c)=>`Votre code : <b>${c}</b>, appliqué au paiement. <a onclick="BG.goPricing()">Voir les tarifs &rarr;</a>`,
    nospam:"Pas de spam. Désinscription à tout moment.", seePlans:"Voir les tarifs &amp; s'abonner"
  },
  en: {
    welcome:"Welcome back", loginSub:"Log in to track your collection.",
    createTitle:"Create your account", createSub:"Start tracking your LEGO in seconds.",
    google:"Continue with Google", or:"or", email:"Email", pass:"Password (8+ characters)",
    login:"Log in", create:"Create account", newHere:"New here?", already:"Already have an account?",
    doCreate:"Create an account", doLogin:"Log in",
    acct:"Your account", openPf:"Open my portfolio", logout:"Log out", manage:"Manage subscription",
    plan:"Plan: ", wait:"Please wait...", success:"✅ Success! Redirecting...",
    err:"Something went wrong.", net:"Network error. Try again.",
    gsoon:"Google sign-in is being set up, use email for now.",
    limited:"🧱 Limited offer", off10a:"Get", off10b:"10% off", off10c:"your first month",
    promoP:"Join now and unlock unlimited checks, your portfolio dashboard and price alerts, 10% cheaper.",
    claim:"Claim my 10% code", code:(c)=>`Your code: <b>${c}</b>, applied at checkout. <a onclick="BG.goPricing()">See plans &rarr;</a>`,
    nospam:"No spam. Unsubscribe anytime.", seePlans:"See plans &amp; subscribe"
  },
  de: {
    welcome:"Willkommen zurück", loginSub:"Melde dich an, um deine Sammlung zu verfolgen.",
    createTitle:"Konto erstellen", createSub:"Verfolge deine LEGO in Sekunden.",
    google:"Mit Google fortfahren", or:"oder", email:"E-Mail", pass:"Passwort (8+ Zeichen)",
    login:"Anmelden", create:"Konto erstellen", newHere:"Neu hier?", already:"Schon ein Konto?",
    doCreate:"Konto erstellen", doLogin:"Anmelden",
    acct:"Dein Konto", openPf:"Mein Portfolio öffnen", logout:"Abmelden", manage:"Abo verwalten",
    plan:"Tarif: ", wait:"Bitte warten...", success:"✅ Erfolg! Weiterleitung...",
    err:"Etwas ist schiefgelaufen.", net:"Netzwerkfehler. Bitte erneut versuchen.",
    gsoon:"Die Google-Anmeldung wird eingerichtet, nutze vorerst die E-Mail.",
    limited:"🧱 Begrenztes Angebot", off10a:"Erhalte", off10b:"10 % Rabatt", off10c:"im ersten Monat",
    promoP:"Jetzt registrieren und unbegrenzte Checks, dein Portfolio-Dashboard und Preisalarme freischalten, 10 % günstiger.",
    claim:"Meinen 10-%-Code sichern", code:(c)=>`Dein Code: <b>${c}</b>, wird an der Kasse angewendet. <a onclick="BG.goPricing()">Tarife ansehen &rarr;</a>`,
    nospam:"Kein Spam. Jederzeit abmelden.", seePlans:"Tarife ansehen &amp; abonnieren"
  },
  es: {
    welcome:"Bienvenido de nuevo", loginSub:"Inicia sesión para seguir tu colección.",
    createTitle:"Crea tu cuenta", createSub:"Empieza a seguir tus LEGO en segundos.",
    google:"Continuar con Google", or:"o", email:"Correo electrónico", pass:"Contraseña (8+ caracteres)",
    login:"Iniciar sesión", create:"Crear cuenta", newHere:"¿Nuevo por aquí?", already:"¿Ya tienes una cuenta?",
    doCreate:"Crear una cuenta", doLogin:"Iniciar sesión",
    acct:"Tu cuenta", openPf:"Abrir mi cartera", logout:"Cerrar sesión", manage:"Gestionar suscripción",
    plan:"Plan: ", wait:"Espera un momento...", success:"✅ ¡Listo! Redirigiendo...",
    err:"Algo salió mal.", net:"Error de red. Inténtalo de nuevo.",
    gsoon:"El inicio de sesión con Google se está configurando, usa el correo por ahora.",
    limited:"🧱 Oferta limitada", off10a:"Consigue un", off10b:"10 % de descuento", off10c:"en tu primer mes",
    promoP:"Únete ahora y desbloquea estimaciones ilimitadas, tu panel de cartera y alertas de precios, 10 % más barato.",
    claim:"Conseguir mi código -10 %", code:(c)=>`Tu código: <b>${c}</b>, aplicado al pagar. <a onclick="BG.goPricing()">Ver planes &rarr;</a>`,
    nospam:"Sin spam. Cancela cuando quieras.", seePlans:"Ver planes &amp; suscribirse"
  },
  it: {
    welcome:"Bentornato", loginSub:"Accedi per seguire la tua collezione.",
    createTitle:"Crea il tuo account", createSub:"Inizia a seguire i tuoi LEGO in pochi secondi.",
    google:"Continua con Google", or:"o", email:"Email", pass:"Password (8+ caratteri)",
    login:"Accedi", create:"Crea account", newHere:"Nuovo qui?", already:"Hai già un account?",
    doCreate:"Crea un account", doLogin:"Accedi",
    acct:"Il tuo account", openPf:"Apri il mio portafoglio", logout:"Esci", manage:"Gestisci abbonamento",
    plan:"Piano: ", wait:"Attendi...", success:"✅ Fatto! Reindirizzamento...",
    err:"Qualcosa è andato storto.", net:"Errore di rete. Riprova.",
    gsoon:"L'accesso con Google è in fase di configurazione, per ora usa l'email.",
    limited:"🧱 Offerta limitata", off10a:"Ottieni il", off10b:"10% di sconto", off10c:"sul tuo primo mese",
    promoP:"Iscriviti ora e sblocca stime illimitate, la dashboard del tuo portafoglio e gli avvisi sui prezzi, 10% in meno.",
    claim:"Ottieni il mio codice -10%", code:(c)=>`Il tuo codice: <b>${c}</b>, applicato al pagamento. <a onclick="BG.goPricing()">Vedi i piani &rarr;</a>`,
    nospam:"Niente spam. Disiscriviti quando vuoi.", seePlans:"Vedi i piani &amp; abbonati"
  },
  nl: {
    welcome:"Welkom terug", loginSub:"Log in om je collectie bij te houden.",
    createTitle:"Maak je account aan", createSub:"Begin binnen enkele seconden met het bijhouden van je LEGO.",
    google:"Doorgaan met Google", or:"of", email:"E-mail", pass:"Wachtwoord (8+ tekens)",
    login:"Inloggen", create:"Account aanmaken", newHere:"Nieuw hier?", already:"Heb je al een account?",
    doCreate:"Een account aanmaken", doLogin:"Inloggen",
    acct:"Je account", openPf:"Mijn portefeuille openen", logout:"Uitloggen", manage:"Abonnement beheren",
    plan:"Abonnement: ", wait:"Even geduld...", success:"✅ Gelukt! Doorsturen...",
    err:"Er ging iets mis.", net:"Netwerkfout. Probeer opnieuw.",
    gsoon:"Google-inloggen wordt ingesteld, gebruik voorlopig e-mail.",
    limited:"🧱 Beperkte aanbieding", off10a:"Krijg", off10b:"10% korting", off10c:"op je eerste maand",
    promoP:"Meld je nu aan en ontgrendel onbeperkte checks, je portefeuille-dashboard en prijsmeldingen, 10% goedkoper.",
    claim:"Mijn code van -10% claimen", code:(c)=>`Je code: <b>${c}</b>, toegepast bij het afrekenen. <a onclick="BG.goPricing()">Bekijk abonnementen &rarr;</a>`,
    nospam:"Geen spam. Altijd uit te schrijven.", seePlans:"Bekijk abonnementen &amp; abonneer"
  },
  sv: {
    welcome:"Välkommen tillbaka", loginSub:"Logga in för att följa din samling.",
    createTitle:"Skapa ditt konto", createSub:"Börja följa dina LEGO på några sekunder.",
    google:"Fortsätt med Google", or:"eller", email:"E-post", pass:"Lösenord (8+ tecken)",
    login:"Logga in", create:"Skapa konto", newHere:"Ny här?", already:"Har du redan ett konto?",
    doCreate:"Skapa ett konto", doLogin:"Logga in",
    acct:"Ditt konto", openPf:"Öppna min portfölj", logout:"Logga ut", manage:"Hantera prenumeration",
    plan:"Plan: ", wait:"Vänta...", success:"✅ Klart! Omdirigerar...",
    err:"Något gick fel.", net:"Nätverksfel. Försök igen.",
    gsoon:"Google-inloggning håller på att ställas in, använd e-post tills vidare.",
    limited:"🧱 Begränsat erbjudande", off10a:"Få", off10b:"10 % rabatt", off10c:"på din första månad",
    promoP:"Gå med nu och lås upp obegränsade kontroller, din portföljöversikt och prisvarningar, 10 % billigare.",
    claim:"Hämta min 10 %-kod", code:(c)=>`Din kod: <b>${c}</b>, tillämpas i kassan. <a onclick="BG.goPricing()">Se planer &rarr;</a>`,
    nospam:"Ingen spam. Avsluta när som helst.", seePlans:"Se planer &amp; prenumerera"
  },
  da: {
    welcome:"Velkommen tilbage", loginSub:"Log ind for at følge din samling.",
    createTitle:"Opret din konto", createSub:"Begynd at følge dine LEGO på få sekunder.",
    google:"Fortsæt med Google", or:"eller", email:"E-mail", pass:"Adgangskode (8+ tegn)",
    login:"Log ind", create:"Opret konto", newHere:"Ny her?", already:"Har du allerede en konto?",
    doCreate:"Opret en konto", doLogin:"Log ind",
    acct:"Din konto", openPf:"Åbn min portefølje", logout:"Log ud", manage:"Administrer abonnement",
    plan:"Abonnement: ", wait:"Vent venligst...", success:"✅ Færdig! Omdirigerer...",
    err:"Noget gik galt.", net:"Netværksfejl. Prøv igen.",
    gsoon:"Google-login er ved at blive sat op, brug e-mail indtil videre.",
    limited:"🧱 Begrænset tilbud", off10a:"Få", off10b:"10 % rabat", off10c:"på din første måned",
    promoP:"Tilmeld dig nu og lås op for ubegrænsede tjek, dit porteføljeoverblik og prisadvarsler, 10 % billigere.",
    claim:"Hent min 10 %-kode", code:(c)=>`Din kode: <b>${c}</b>, anvendes ved betaling. <a onclick="BG.goPricing()">Se abonnementer &rarr;</a>`,
    nospam:"Ingen spam. Afmeld når som helst.", seePlans:"Se abonnementer &amp; abonnér"
  }
  };
  const S = SP[LANG] || SP.en;

  const authHTML = `
  <div class="modal-bg" id="authWall">
    <div class="modal auth">
      <span class="x" onclick="BG.closeAuth()">✕</span>
      <div class="authlogo"><span class="studs"><i></i><i></i><i></i><i></i></span>BrickGains</div>
      <h3 id="authTitle">${S.welcome}</h3>
      <p id="authSub">${S.loginSub}</p>
      <button class="gbtn" onclick="BG.google()">
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.4 21.3 7.4 24 12 24z"/><path fill="#FBBC05" d="M5.4 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.4C.5 8.3 0 10.1 0 12s.5 3.7 1.4 5.4l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.7 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>
        ${S.google}
      </button>
      <div class="ordiv"><span>${S.or}</span></div>
      <form onsubmit="BG.submit(event)">
        <input id="authEmail" type="email" placeholder="${S.email}" autocomplete="email" required>
        <input id="authPass" type="password" placeholder="${S.pass}" autocomplete="current-password" required>
        <div class="authmsg" id="authMsg"></div>
        <button class="btn lg" type="submit" id="authSubmit" style="width:100%">${S.login}</button>
      </form>
      <div class="authswitch">
        <span id="authSwitchTxt">${S.newHere}</span>
        <a onclick="BG.toggle()" id="authSwitchLink">${S.doCreate}</a>
      </div>
    </div>
  </div>

  <div class="modal-bg" id="acctWall">
    <div class="modal">
      <span class="x" onclick="BG.closeAcct()">✕</span>
      <div class="authlogo"><span class="studs"><i></i><i></i><i></i><i></i></span>BrickGains</div>
      <h3>${S.acct}</h3>
      <p id="acctEmail" style="font-weight:700;color:var(--ink)"></p>
      <p id="acctPlan" style="margin-top:-6px"></p>
      <a class="btn lg" href="/app" style="width:100%;margin-bottom:10px">${S.openPf}</a>
      <button class="btn ghost" style="width:100%;margin-bottom:10px" onclick="BG.billingPortal()">${S.manage}</button>
      <a class="altlink" onclick="BG.logout()">${S.logout}</a>
    </div>
  </div>

  <div class="popup-bg" id="promoWall">
    <div class="promo">
      <span class="x" onclick="BG.closePromo()">✕</span>
      <div class="promo-badge">${S.limited}</div>
      <h3>${S.off10a} <span class="hl">${S.off10b}</span> ${S.off10c}</h3>
      <p>${S.promoP}</p>
      <form onsubmit="BG.claim(event)">
        <input id="promoEmail" type="email" placeholder="you@email.com" required>
        <button class="btn lg" type="submit" style="width:100%">${S.claim}</button>
      </form>
      <div class="promo-done" id="promoDone"></div>
      <div class="promo-fine">${S.nospam}</div>
    </div>
  </div>`;

  function el(id){ return document.getElementById(id); }

  const BG = {
    mode: 'login',
    openAuth(mode){ BG.mode = mode||'login'; BG.render(); el('authWall').classList.add('on'); },
    closeAuth(){ el('authWall').classList.remove('on'); },
    openAcct(){ if(me){ el('acctEmail').textContent = me.email; el('acctPlan').textContent = S.plan+(me.plan||'free'); el('acctWall').classList.add('on'); } },
    closeAcct(){ el('acctWall').classList.remove('on'); },
    toggle(){ BG.mode = BG.mode==='login' ? 'signup' : 'login'; BG.render(); },
    render(){
      const login = BG.mode==='login';
      el('authTitle').textContent = login ? S.welcome : S.createTitle;
      el('authSub').textContent = login ? S.loginSub : S.createSub;
      el('authSubmit').textContent = login ? S.doLogin : S.create;
      el('authPass').autocomplete = login ? 'current-password' : 'new-password';
      el('authSwitchTxt').textContent = login ? S.newHere : S.already;
      el('authSwitchLink').textContent = login ? S.doCreate : S.doLogin;
      el('authMsg').textContent = '';
    },
    async submit(e){
      e.preventDefault();
      const email = el('authEmail').value.trim();
      const password = el('authPass').value;
      const msg = el('authMsg'); msg.className='authmsg'; msg.textContent=S.wait;
      const url = BG.mode==='login' ? '/api/login' : '/api/signup';
      try{
        const r = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
        const d = await r.json();
        if(d.ok){ me = d.user; msg.className='authmsg ok'; msg.textContent=S.success;
          const intent = sessionStorage.getItem('bg_intent');
          if(intent){ sessionStorage.removeItem('bg_intent'); setTimeout(()=>BG.checkout(intent), 400); }
          else { setTimeout(()=>{ location.href = '/app'; }, 500); } }
        else { msg.className='authmsg err'; msg.textContent = d.error || S.err; }
      }catch(err){ msg.className='authmsg err'; msg.textContent=S.net; }
    },
    google(){ el('authMsg').className='authmsg'; el('authMsg').textContent=S.gsoon; },
    async logout(){ try{ await fetch('/api/logout',{method:'POST'}); }catch(e){} me=null; BG.closeAcct(); BG.renderIcon(); if(location.pathname==='/app') location.href = HOME; },
    renderIcon(){
      const btn = el('accountBtn'); if(!btn) return;
      btn.title = me ? (me.email) : S.login;
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
      done.innerHTML = S.code('BRICK10');
      localStorage.setItem('bg_promo','1');
    },
    goPricing(){ el('promoWall').classList.remove('on'); const p=document.getElementById('pricing'); if(p) p.scrollIntoView({behavior:'smooth'}); },
    maybePromo(){
      if(localStorage.getItem('bg_promo') || me) return;
      setTimeout(()=>{ if(!me && !localStorage.getItem('bg_promo')) el('promoWall').classList.add('on'); }, 18000);
    }
  };
  // Stripe checkout: POST /api/checkout -> redirect to hosted page. If not logged in, open auth then resume.
  BG.checkout = async function(plan){
    try{
      const r = await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan})});
      if(r.status===401){ sessionStorage.setItem('bg_intent', plan); BG.openAuth('signup'); return; }
      const d = await r.json();
      if(d && d.ok && d.url){ location.href = d.url; }
      else { alert((d && d.error) || (FRA ? "Paiement indisponible" : "Checkout unavailable")); }
    }catch(e){ alert(FRA ? "Erreur réseau" : "Network error"); }
  };
  // Stripe billing portal: manage / cancel subscription. Free users go to pricing.
  BG.billingPortal = async function(){
    if(!me || me.plan==='free' || !me.plan){ location.href = (LANG && LANG!=='en' ? '/'+LANG : '')+'/pricing'; return; }
    try{
      var r = await fetch('/api/billing-portal',{method:'POST'});
      var d = await r.json();
      if(d && d.ok && d.url){ location.href = d.url; }
      else { alert((d && d.error) || (FRA?"Portail indisponible":"Billing portal unavailable")); }
    }catch(e){ alert(FRA?"Erreur réseau":"Network error"); }
  };
  window.BG = BG;

  document.addEventListener('DOMContentLoaded', async ()=>{
    document.body.insertAdjacentHTML('beforeend', authHTML);
    const btn = el('accountBtn');
    if(btn) btn.addEventListener('click', ()=> me ? BG.openAcct() : BG.openAuth('login'));
    document.addEventListener('click', function(e){
      const a = e.target.closest('[data-plan]');
      if(a){ e.preventDefault(); BG.checkout(a.getAttribute('data-plan')); }
    });
    await BG.refreshMe();
    if(document.getElementById('promoWall') && !location.pathname.startsWith('/app')) BG.maybePromo();
  });
})();
