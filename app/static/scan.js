/* BrickGains - box barcode scanner
   Uses the native BarcodeDetector API (Chrome/Android). No external library.
   Safari/iOS does not support it -> graceful fallback to manual set entry. */
(function () {
  var stream = null, detector = null, raf = 0, busy = false, lastCode = "", lastAt = 0;

  function el(id) { return document.getElementById(id); }
  function msg(t, kind) {
    var m = el("scanMsg"); if (!m) return;
    m.textContent = t;
    m.className = "scan-msg" + (kind ? " " + kind : "");
  }

  function supported() {
    return ("BarcodeDetector" in window) &&
           navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
  }

  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    var v = el("scanVideo"); if (v) v.srcObject = null;
  }

  function close() {
    stop();
    var o = el("scanOverlay"); if (o) o.style.display = "none";
  }

  async function resolve(code) {
    if (busy) return;
    // debounce identical reads within 2.5s
    var now = Date.now();
    if (code === lastCode && now - lastAt < 2500) return;
    lastCode = code; lastAt = now;
    busy = true;
    msg("Looking up " + code + "…");
    try {
      var r = await fetch("/api/scan?code=" + encodeURIComponent(code));
      var d = await r.json();
      if (d && d.ok && d.set) {
        msg("✓ " + (d.name || ("Set " + d.set)) + " (" + d.set + ")", "ok");
        if (window.pickSet) pickSet(d.set); else {
          var i = el("pset"); if (i) i.value = d.set;
        }
        setTimeout(close, 700);
        var pp = el("pprice"); if (pp) setTimeout(function () { pp.focus(); }, 750);
        return;
      }
      // known-format barcode but not in our tracked sets
      msg((d && d.error) || "Not found. Type the set number instead.", "warn");
      busy = false; // keep scanning, maybe another barcode on the box
    } catch (e) {
      msg("Network error. Try again or type the set number.", "warn");
      busy = false;
    }
  }

  async function tick() {
    var v = el("scanVideo");
    if (!v || v.readyState < 2 || busy) { raf = requestAnimationFrame(tick); return; }
    try {
      var codes = await detector.detect(v);
      if (codes && codes.length) {
        var raw = (codes[0].rawValue || "").replace(/\D/g, "");
        if (raw.length >= 8) { await resolve(raw); }
      }
    } catch (e) { /* frame decode hiccup - ignore */ }
    raf = requestAnimationFrame(tick);
  }

  async function open() {
    var o = el("scanOverlay");
    if (!supported()) {
      // Fallback: no camera scan on this browser (iOS Safari). Guide to manual entry.
      alert("Camera scanning isn't supported on this browser (e.g. iPhone Safari). " +
            "Type the set number instead - it's printed on the box near the barcode.");
      var i = el("pset"); if (i) { i.focus(); i.scrollIntoView({ behavior: "smooth", block: "center" }); }
      return;
    }
    if (o) o.style.display = "flex";
    busy = false; lastCode = "";
    msg("Point your camera at the barcode on the box.");
    try {
      var fmts = [];
      try { fmts = await window.BarcodeDetector.getSupportedFormats(); } catch (e) {}
      var want = ["ean_13", "upc_a", "ean_8", "upc_e"].filter(function (f) {
        return !fmts.length || fmts.indexOf(f) >= 0;
      });
      detector = new window.BarcodeDetector(want.length ? { formats: want } : undefined);
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } }, audio: false
      });
      var v = el("scanVideo");
      v.srcObject = stream;
      await v.play();
      raf = requestAnimationFrame(tick);
    } catch (e) {
      msg("Couldn't access the camera. Check permissions, or type the set number.", "warn");
    }
  }

  // close on backdrop click / Esc
  document.addEventListener("click", function (ev) {
    var o = el("scanOverlay");
    if (o && ev.target === o) close();
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") close();
  });

  window.BGScan = { open: open, close: close };
})();
