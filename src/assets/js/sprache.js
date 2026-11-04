/* Startseite: leitet nach Browsersprache weiter. Deutsch -> /de/escape-self-sabotage-r1/, sonst /en/escape-self-sabotage-r1/.
   Die Herkunfts-Kennung (?quelle=...) wird mitgenommen. */
(function () {
  var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"];
  var de = langs.some(function (l) { return /^de\b/i.test(l); });
  window.location.replace((de ? "/de/escape-self-sabotage-r1/" : "/en/escape-self-sabotage-r1/") + window.location.search);
})();
