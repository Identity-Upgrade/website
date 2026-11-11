/* Identity Upgrade – kleine Helfer, ohne Cookies und ohne Speicherung im Browser.
   1. Herkunft (Quelle/Kampagne) aus dem Link lesen und an das Kit-Formular geben.
   2. Die Kennung an interne Links weiterreichen, damit sie beim Seitenwechsel erhalten bleibt.
   3. Formular pruefen; ohne Kit-Formular-ID nur Vorschaumodus (Weiterleitung zur Danke-Seite). */
(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var quelle = params.get("quelle") || params.get("utm_source") || "";
  var kampagne = params.get("kampagne") || params.get("utm_campaign") || "";

  // Ohne Kennung: verweisende Seite (nur fremde Domains), soweit der Browser sie mitliefert.
  if (!quelle && document.referrer) {
    try {
      var ref = new URL(document.referrer);
      if (ref.hostname && ref.hostname !== window.location.hostname) {
        quelle = "verweis:" + ref.hostname.replace(/^www\./, "");
      }
    } catch (e) { /* ungueltiger Referrer – ignorieren */ }
  }
  if (!quelle) quelle = "direkt";

  // Versteckte Felder fuellen
  document.querySelectorAll("input[data-feld='quelle']").forEach(function (el) { el.value = quelle.slice(0, 120); });
  document.querySelectorAll("input[data-feld='kampagne']").forEach(function (el) { el.value = kampagne.slice(0, 120); });

  // Kennung an interne Links anhaengen (nur wenn sie aus dem Link kam)
  var kennung = params.get("quelle") || params.get("utm_source");
  if (kennung) {
    document.querySelectorAll("a[href^='/']").forEach(function (a) {
      try {
        var u = new URL(a.getAttribute("href"), window.location.origin);
        if (!u.searchParams.has("quelle")) u.searchParams.set("quelle", kennung);
        if (kampagne && !u.searchParams.has("kampagne")) u.searchParams.set("kampagne", kampagne);
        a.setAttribute("href", u.pathname + u.search + u.hash);
      } catch (e) { /* Link unveraendert lassen */ }
    });
  }


  // Rückmeldung nach fehlgeschlagener Anmeldung (?error=1)
  if (params.get("error")) {
    document.querySelectorAll("form[data-formular]").forEach(function (f) {
      var el = f.querySelector(".formular-fehler");
      if (el) el.textContent = f.getAttribute("data-sendefehler") || "";
    });
  }

  // Warteliste: Auswahl aus dem Link (?for=book|course) vorbelegen, passende Karte zeigen
  var wl = document.querySelector("form[data-waitlist]");
  if (wl) {
    // Käufer (Link von der Seite nach dem Kauf): Eintrag geht an das Käufer-Formular in Kit
    if (params.get("from") === "buyer") { var kf = wl.querySelector("[data-kaeufer]"); if (kf) kf.value = "1"; }
    var fuer = params.get("for");
    if (fuer) {
      wl.querySelectorAll("input[data-fuer]").forEach(function (el) { if (el.getAttribute("data-fuer") === fuer) el.checked = true; });
    }
    if (params.get("subscribed")) {
      var erfolg = document.querySelector("[data-erfolg]");
      if (erfolg) { erfolg.hidden = false; wl.hidden = true; var ab = document.getElementById("signup"); if (ab) ab.scrollIntoView(); }
    }
    wl.addEventListener("submit", function (ev) {
      if (!wl.querySelector("input[data-fuer]:checked")) {
        ev.preventDefault(); ev.stopImmediatePropagation();
        var f = wl.querySelector(".formular-fehler"); if (f) f.textContent = wl.getAttribute("data-fehler-auswahl") || wl.getAttribute("data-fehler");
      }
    }, true);
  }


  // Kauf-Button in der Kopfleiste: erscheint, sobald das Laufband oben an der Leiste ankommt
  var kk = document.querySelector("[data-kopf-kauf]"), lb = document.querySelector(".laufband"), kopf = document.querySelector(".kopf");
  if (kk && lb && kopf) {
    var pruefe = function () {
      var an = lb.getBoundingClientRect().top <= kopf.getBoundingClientRect().bottom + 1;
      kk.classList.toggle("sichtbar", an);
      if (an) { kk.removeAttribute("tabindex"); kk.removeAttribute("aria-hidden"); } else { kk.setAttribute("tabindex", "-1"); kk.setAttribute("aria-hidden", "true"); }
    };
    window.addEventListener("scroll", pruefe, { passive: true });
    window.addEventListener("resize", pruefe);
    pruefe();
  }


  // Newsletter-Seite: Warteliste-Hinweis ausblenden, wenn jemand von der Warteliste kommt
  // from=waitlist: Stockwerk-1-Hinweis statt Warteliste; from=waitlist-buyer: keiner von beiden
  var von = params.get("from");
  if (von === "waitlist" || von === "waitlist-buyer") {
    var nlw = document.querySelector("[data-nl-warteliste]");
    if (nlw) nlw.hidden = true;
    var nl1 = document.querySelector("[data-nl-level1]");
    if (nl1 && von === "waitlist") nl1.hidden = false;
  }

  // Meldung in Zeilen setzen, E-Mail-Adresse anklickbar machen (ohne innerHTML)
  function meldungSetzen(el, text) {
    el.textContent = "";
    text.split("\n").forEach(function (zeile, i) {
      if (i) el.appendChild(document.createElement("br"));
      zeile.split(/(hello@identity-upgrade\.com)/).forEach(function (teil) {
        if (teil === "hello@identity-upgrade.com") {
          var a = document.createElement("a"); a.href = "mailto:" + teil; a.textContent = teil; a.className = "ebook-mail"; el.appendChild(a);
        } else if (teil) el.appendChild(document.createTextNode(teil));
      });
    });
  }

  // E-Book-Download auf der Danke-Seite nach dem Kauf (Pförtner: /api/ebook)
  var eb = document.querySelector("[data-ebook]");
  if (eb) {
    eb.hidden = false;
    var q = window.location.search.replace(/^\?/, "");
    // Ohne Bestelldaten: Pförtner trotzdem fragen (er notiert den Aufruf und liefert den Hinweistext)
    if (!params.get("sha_sign") && !params.get("SHASIGN") && !params.get("session_id")) q = "page=" + (document.documentElement.lang || "en").slice(0, 2);
    var btn = eb.querySelector("[data-ebook-button]"), laden = eb.querySelector("[data-ebook-laden]");
    var meldung = eb.querySelector("[data-ebook-meldung]"), hinweis = eb.querySelector("[data-ebook-hinweis]");
    fetch("/api/ebook?action=status&" + q, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        laden.hidden = true;
        if (d.stand === "bereit") { btn.href = "/api/ebook?action=download&" + q; btn.hidden = false; hinweis.hidden = false; }
        else { meldungSetzen(meldung, d.text || ""); meldung.hidden = false; }
      })
      .catch(function () { laden.hidden = true; meldung.textContent = "hello@identity-upgrade.com"; meldung.hidden = false; });
  }

  // Formular
  document.querySelectorAll("form[data-formular]").forEach(function (form) {
    var fehler = form.querySelector(".formular-fehler");
    form.addEventListener("submit", function (ev) {
      var ok = true;
      form.querySelectorAll("input[required], select[required], input[data-telefon]").forEach(function (el) {
        var wert = (el.value || "").trim();
        var istTelefon = el.hasAttribute("data-telefon");
        var telefonFalsch = istTelefon && wert !== "" && wert.replace(/[^0-9]/g, "").length < 6;
        if ((!wert && !istTelefon) || telefonFalsch || (el.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(wert))) {
          ok = false;
          el.setAttribute("aria-invalid", "true");
        } else {
          el.removeAttribute("aria-invalid");
        }
      });
      if (!ok) {
        ev.preventDefault();
        if (fehler) fehler.textContent = form.getAttribute("data-fehler");
        var erstes = form.querySelector("[aria-invalid='true']");
        if (erstes) erstes.focus();
        return;
      }
      if (fehler) fehler.textContent = "";
      // Telefonnummer mit Ländervorwahl zusammensetzen (führende Null entfällt)
      var vw = form.querySelector("[data-vorwahl]"), tel = form.querySelector("[data-telefon]"), ziel = form.querySelector("input[data-feld='telefon']");
      if (vw && tel && ziel) { var nr = tel.value.replace(/[^0-9]/g, "").replace(/^0+/, ""); ziel.value = nr ? vw.value + " " + nr : ""; }
      if (form.getAttribute("data-vorschau") === "ja") {
        ev.preventDefault();
        window.location.href = form.getAttribute("data-danke");
      }
    });
    form.querySelectorAll("input, select").forEach(function (el) {
      el.addEventListener(el.tagName === "SELECT" ? "change" : "input", function () {
        el.removeAttribute("aria-invalid");
        if (fehler) fehler.textContent = "";
      });
    });
  });
})();
