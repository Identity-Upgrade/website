/* Startseite: leitet nach Browsersprache weiter. Deutsch -> /de/freebie/, sonst /en/freebie/.
   Die Herkunfts-Kennung (?quelle=...) wird mitgenommen. */
(function () {
  var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"];
  var de = langs.some(function (l) { return /^de\b/i.test(l); });
  window.location.replace((de ? "/de/freebie/" : "/en/freebie/") + window.location.search);
})();
