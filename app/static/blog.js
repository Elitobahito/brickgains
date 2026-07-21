/* BrickGains blog: search + suggestions + pagination (index) and a 10s product popup (all blog pages). */
(function () {
  var path = location.pathname;
  if (path.indexOf("/blog") < 0) return;

  var m = path.match(/^\/(fr|de|es|it|nl|sv|da)\//);
  var lang = m ? m[1] : "en";
  var base = lang === "en" ? "" : "/" + lang;

  var STR = {
    en: { ph: "Search articles…", no: "No article matches your search.", prev: "‹ Prev", next: "Next ›",
      ptitle: "Know what your LEGO is really worth", psub: "Track your whole collection, get live BrickLink values and sell-now alerts. Free to start.",
      pc1: "See plans", pc2: "Try it free", later: "Maybe later" },
    fr: { ph: "Rechercher un article…", no: "Aucun article ne correspond à votre recherche.", prev: "‹ Préc.", next: "Suiv. ›",
      ptitle: "Savez-vous ce que valent vraiment vos LEGO ?", psub: "Suivez toute votre collection, prix BrickLink en direct et alertes de revente. Gratuit pour commencer.",
      pc1: "Voir les tarifs", pc2: "Essayer gratuitement", later: "Plus tard" },
    de: { ph: "Artikel suchen…", no: "Kein Artikel passt zu deiner Suche.", prev: "‹ Zurück", next: "Weiter ›",
      ptitle: "Weißt du, was dein LEGO wirklich wert ist?", psub: "Verfolge deine ganze Sammlung, erhalte Live-BrickLink-Werte und Verkaufs-Alerts. Kostenlos starten.",
      pc1: "Preise ansehen", pc2: "Kostenlos testen", later: "Später" },
    es: { ph: "Buscar artículos…", no: "Ningún artículo coincide con tu búsqueda.", prev: "‹ Ant.", next: "Sig. ›",
      ptitle: "¿Sabes cuánto valen de verdad tus LEGO?", psub: "Controla toda tu colección, precios de BrickLink en vivo y alertas de venta. Gratis para empezar.",
      pc1: "Ver planes", pc2: "Probar gratis", later: "Quizá luego" },
    it: { ph: "Cerca articoli…", no: "Nessun articolo corrisponde alla ricerca.", prev: "‹ Prec.", next: "Succ. ›",
      ptitle: "Sai quanto valgono davvero i tuoi LEGO?", psub: "Monitora tutta la collezione, prezzi BrickLink live e avvisi di vendita. Gratis per iniziare.",
      pc1: "Vedi i piani", pc2: "Prova gratis", later: "Più tardi" },
    nl: { ph: "Artikelen zoeken…", no: "Geen artikel komt overeen met je zoekopdracht.", prev: "‹ Vorige", next: "Volgende ›",
      ptitle: "Weet je wat je LEGO echt waard is?", psub: "Volg je hele collectie, live BrickLink-waardes en verkoopmeldingen. Gratis om te starten.",
      pc1: "Bekijk plannen", pc2: "Gratis proberen", later: "Later" },
    sv: { ph: "Sök artiklar…", no: "Ingen artikel matchar din sökning.", prev: "‹ Föreg.", next: "Nästa ›",
      ptitle: "Vet du vad dina LEGO verkligen är värda?", psub: "Följ hela din samling, live BrickLink-värden och säljvarningar. Gratis att börja.",
      pc1: "Se planer", pc2: "Prova gratis", later: "Senare" },
    da: { ph: "Søg artikler…", no: "Ingen artikel matcher din søgning.", prev: "‹ Forrige", next: "Næste ›",
      ptitle: "Ved du, hvad dine LEGO virkelig er værd?", psub: "Følg hele din samling, live BrickLink-værdier og salgsalarmer. Gratis at starte.",
      pc1: "Se planer", pc2: "Prøv gratis", later: "Senere" }
  };
  var T = STR[lang] || STR.en;

  /* Blog popup: replaced by the site-wide email+promo-code popup (auth.js maybePromo, now enabled on /blog). */

  /* ---------- index only: search + suggestions + pagination ---------- */
  var grid = document.querySelector(".bloggrid:not(.rel-grid)");
  if (!grid) return;

  var data = [].slice.call(grid.querySelectorAll(".blogcard")).map(function (c) {
    return { el: c, t: (c.querySelector("h3") || {}).textContent || "", x: (c.querySelector("p") || {}).textContent || "", href: c.getAttribute("href") };
  });
  if (!data.length) return;

  var PER = 9, page = 1, filtered = data.slice();

  var box = document.createElement("div");
  box.className = "blogsearch";
  box.innerHTML = '<input type="text" id="blogQ" placeholder="' + T.ph + '" autocomplete="off" aria-label="' + T.ph + '"><div class="blog-sug" id="blogSug"></div>';
  grid.parentNode.insertBefore(box, grid);

  var nores = document.createElement("div");
  nores.className = "blog-nores";
  nores.textContent = T.no;
  grid.parentNode.insertBefore(nores, grid.nextSibling);

  var pager = document.createElement("div");
  pager.className = "blogpage";
  grid.parentNode.insertBefore(pager, nores.nextSibling);

  function norm(s) { return (s || "").toLowerCase(); }
  function toTop() { box.scrollIntoView({ behavior: "smooth", block: "start" }); }

  function draw() {
    data.forEach(function (d) { d.el.style.display = "none"; });
    var pages = Math.max(1, Math.ceil(filtered.length / PER));
    if (page > pages) page = pages;
    filtered.slice((page - 1) * PER, page * PER).forEach(function (d) { d.el.style.display = ""; });
    nores.style.display = filtered.length ? "none" : "block";
    pager.innerHTML = "";
    if (pages > 1) {
      var prev = document.createElement("button"); prev.textContent = T.prev; prev.disabled = page === 1;
      prev.onclick = function () { page--; draw(); toTop(); }; pager.appendChild(prev);
      for (var i = 1; i <= pages; i++) (function (i) {
        var b = document.createElement("button"); b.textContent = i; if (i === page) b.className = "on";
        b.onclick = function () { page = i; draw(); toTop(); }; pager.appendChild(b);
      })(i);
      var next = document.createElement("button"); next.textContent = T.next; next.disabled = page === pages;
      next.onclick = function () { page++; draw(); toTop(); }; pager.appendChild(next);
    }
  }

  var q = box.querySelector("#blogQ"), sug = box.querySelector("#blogSug");
  q.addEventListener("input", function () {
    var v = norm(q.value.trim());
    filtered = v ? data.filter(function (d) { return norm(d.t).indexOf(v) >= 0 || norm(d.x).indexOf(v) >= 0; }) : data.slice();
    page = 1; draw();
    if (v) {
      var s = data.filter(function (d) { return norm(d.t).indexOf(v) >= 0; }).slice(0, 6);
      sug.innerHTML = s.map(function (d) { return '<a href="' + d.href + '">' + d.t + "</a>"; }).join("");
      sug.className = "blog-sug" + (s.length ? " on" : "");
    } else sug.className = "blog-sug";
  });
  q.addEventListener("blur", function () { setTimeout(function () { sug.className = "blog-sug"; }, 150); });
  q.addEventListener("focus", function () { if (q.value.trim() && sug.innerHTML) sug.className = "blog-sug on"; });

  draw();
})();
