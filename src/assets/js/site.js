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

  // Formular
  document.querySelectorAll("form[data-formular]").forEach(function (form) {
    var fehler = form.querySelector(".formular-fehler");
    form.addEventListener("submit", function (ev) {
      var ok = true;
      form.querySelectorAll("input[required], select[required]").forEach(function (el) {
        var wert = (el.value || "").trim();
        var telefonFalsch = el.hasAttribute("data-telefon") && wert.replace(/[^0-9]/g, "").length < 6;
        if (!wert || telefonFalsch || (el.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(wert))) {
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
      if (vw && tel && ziel) ziel.value = vw.value + " " + tel.value.replace(/[^0-9]/g, "").replace(/^0+/, "");
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
