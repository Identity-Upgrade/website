// Identity Upgrade – Build-Skript ohne Abhängigkeiten.
// Liest die Texte aus src/content/<sprache>.json und erzeugt statische Seiten in dist/.
// Aufruf: node build.mjs   (Cloudflare Pages: Build-Befehl "node build.mjs", Ausgabeordner "dist")

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = dirname(new URL(import.meta.url).pathname);
const DIST = join(ROOT, "dist");
const lies = (p) => JSON.parse(readFileSync(join(ROOT, "src/content", p), "utf8"));
const cfg = lies("config.json");
const T = { de: lies("de.json"), en: lies("en.json") };
const VERSION = Date.now().toString(36);
import { createHash } from "node:crypto";
const imgV = (datei) => { try { return createHash("md5").update(readFileSync(new URL("./src/assets/img/" + datei, import.meta.url))).digest("hex").slice(0, 8); } catch { return VERSION; } };
const imgUrl = (datei) => `/assets/img/${datei}?v=${imgV(datei)}`;

// Pfade je Seite und Sprache
const PFADE = {
  freebie: { de: "/de/freebie/", en: "/en/freebie/" },
  buch: { de: "/de/escape-self-sabotage/", en: "/en/escape-self-sabotage/" },
  danke: { de: "/de/danke/", en: "/en/thank-you/" },
  impressum: { de: "/de/impressum/", en: null }, // Englisch: kein Impressum, nur Privacy
  privacy: { de: "/de/datenschutz/", en: "/en/privacy/" },
};

const istPlatzhalter = (s) => typeof s === "string" && /^\[.*\]$/.test(s.trim());
const VORSCHAU = JSON.stringify(cfg).includes("[") || JSON.stringify(T).includes("[");

// Text sicher machen und *Akzentwörter* kursiv setzen
const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const akzent = (s = "") => esc(s).replace(/\*([^*]+)\*/g, "<em>$1</em>");
const zwei = (n) => String(n).padStart(2, "0");
const liste = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const absaetze = (x, cls = "fliess") => liste(x).map((p) => `<p class="${cls}">${akzent(p).replace(/\n/g, "<br>")}</p>`).join("\n  ");
const labelP = (x) => (x ? `<p class="label">${esc(x)}</p>` : "");

const bild = (name, alt, cls = "") =>
  `<img class="${cls}" src="${imgUrl(name + "-960.webp")}" srcset="${imgUrl(name + "-480.webp")} 480w, ${imgUrl(name + "-960.webp")} 960w" sizes="(min-width: 900px) 420px, 60vw" alt="${esc(alt)}" loading="lazy" decoding="async" width="960" height="1358">`;

const IMG = {
  de: { buch: "buch-cover-de", freebie: "freebie-cover-de", raum1: "freebie-raum1-de", spur: "buch-seite-spur-de", fund: "buch-seite-fund-de" },
  en: { buch: "book-cover-en", freebie: "freebie-cover-en", raum1: "freebie-room1-en", spur: "book-page-clue-en", fund: "book-page-find-en" },
};

function kopf(lang, seite, { kaufen = false } = {}) {
  const t = T[lang];
  const sprache = `<nav class="sprache" aria-label="${esc(t.ui.sprache)}">${
    lang === "de"
      ? `<span class="aktiv" aria-current="true">DE</span><a href="${PFADE[seite].en || PFADE.privacy.en}" hreflang="en" lang="en">EN</a>`
      : `<a href="${PFADE[seite].de}" hreflang="de" lang="de">DE</a><span class="aktiv" aria-current="true">EN</span>`
  }</nav>`;
  const kauf = kaufen ? `<a class="button button-rot button-klein" href="#preis">${esc(t.ui.kaufen)}</a>` : "";
  return `${VORSCHAU ? `<div class="vorschau-band">${esc(t.ui.vorschau)}</div>` : ""}
<header class="kopf"><div class="huelle">
  <a class="wortmarke" href="${PFADE.freebie[lang]}">Identity <em>Upgrade</em><sup>™</sup></a>
  <div class="kopf-rechts">${kauf}${sprache}</div>
</div></header>`;
}

function fuss(lang) {
  const t = T[lang];
  return `<footer class="fuss"><div class="huelle">
  <span class="wortmarke">Identity <em>Upgrade</em><sup>™</sup></span>
  <small>© ${new Date().getFullYear()} ${esc(cfg.anbieter.name)}</small>
  <span class="recht">${PFADE.impressum[lang] ? `<a href="${PFADE.impressum[lang]}">${esc(t.ui.footerImpressum)}</a> · ` : ""}<a href="${PFADE.privacy[lang]}">${esc(t.ui.footerDatenschutz)}</a></span>
</div></footer>`;
}

function laufband(lang) {
  const items = T[lang].laufband.map((x) => `<span>${esc(x)}</span>`).join("");
  return `<div class="laufband" aria-hidden="true"><div class="laufband-spur">${items}${items}${items}${items}</div></div>`;
}

function wiedererkennen(w, farbe = "weiss") {
  return `<section class="abschnitt ${farbe} mitte wiedererkennen"><div class="huelle">
  ${labelP(w.label)}
  <h2 class="titel t-gross">${akzent(w.titel)}</h2>
  ${absaetze(w.text)}
  <div class="karten">${w.karten.map((k) => `<article class="karte"><h3 class="label">${esc(k.label)}</h3>${[].concat(k.text).map((x) => `<p>${esc(x)}</p>`).join("")}</article>`).join("")}</div>
  ${w.abschluss ? `<p class="notiz notiz-c wieder-frage">${esc(w.abschluss)}</p>` : ""}
</div></section>`;
}

const SYMBOLE = [
  // Haus
  '<path d="M4 11.5 12 4.5l8 7"/><path d="M6.5 9.8V19.5h11V9.8"/><path d="M10.2 19.5v-5h3.6v5"/>',
  // Lift
  '<rect x="5" y="3.5" width="14" height="17" rx="1.5"/><path d="M12 3.5v17"/><path d="M7.4 10.2 8.7 8.6l1.3 1.6"/><path d="M14 13.8l1.3 1.6 1.3-1.6"/>',
  // Stockwerke
  '<path d="M22.50 15.68 L12.00 21.56 L1.50 15.68"/><path d="M22.50 11.88 L12.00 17.76 L1.50 11.88"/><path d="M12.00 2.20 L22.50 8.08 L12.00 13.96 L1.50 8.08 Z"/><path d="M16.20 4.55 L10.74 7.61" stroke-width="0.95"/><path d="M8.85 8.67 L5.70 10.43" stroke-width="0.95"/><path d="M10.95 7.49 L13.26 8.79" stroke-width="0.95"/><path d="M14.94 9.73 L17.25 11.02" stroke-width="0.95"/><path d="M7.80 4.55 L10.32 5.96" stroke-width="0.95"/><path d="M14.10 9.26 L11.58 10.67" stroke-width="0.95"/><path d="M10.11 11.49 L8.85 12.20" stroke-width="0.95"/><path d="M7.07 6.02 L9.27 7.26" stroke-width="0.95"/><path d="M6.02 6.61 L8.22 7.84" stroke-width="0.95"/><path d="M4.97 7.20 L7.17 8.43" stroke-width="0.95"/><path d="M3.92 7.79 L6.12 9.02" stroke-width="0.95"/>',
  // Räume (Tür)
  '<path d="M6.5 20.5V4.5h11v16"/><path d="M4.5 20.5h15"/><circle cx="14.6" cy="12.8" r=".9" fill="currentColor" stroke="none"/>',
  // Spuren (Lupe)
  '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m14.6 14.6 5 5"/>',
];
const symbol = (i) => `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SYMBOLE[i] || ""}</svg>`;

function soFunktionierts(lang, farbe = "creme", daten) {
  const s = daten || T[lang].gemeinsam.sofunktionierts;
  return `<section class="abschnitt ${farbe} mitte sofunktionierts"><div class="huelle">
  ${labelP(s.label)}
  <h2 class="titel t-gross">${akzent(s.titel)}</h2>
  ${absaetze(s.text)}
  <ol class="stationen">${s.stationen.map((st, i) => `<li class="station"><div class="station-zahl" aria-hidden="true">${SYMBOLE[i] ? symbol(i) : i + 1}</div><h3>${esc(st.titel)}</h3><p>${esc(st.text)}</p></li>`).join("")}</ol>
  <p class="notiz notiz-b">${esc(s.notiz)}</p>
  ${s.button ? `<a class="button button-rot" href="#anmeldung">${esc(s.button)} <span aria-hidden="true">→</span></a>` : ""}
</div></section>`;
}

function haltung(lang, daten) {
  const h = daten || T[lang].gemeinsam.haltung;
  return `<section class="abschnitt gruen mitte haltung"><div class="huelle">
  ${labelP(h.label)}
  <h2 class="titel t-gross">${akzent(h.titel)}</h2>
  ${absaetze(h.text)}
  ${h.button ? `<a class="button button-rot" href="#anmeldung">${esc(h.button)} <span aria-hidden="true">→</span></a>` : ""}
</div></section>`;
}

function ueber(lang, text, farbe = "creme", daten) {
  const u = daten || T[lang].gemeinsam.ueber;
  return `<section class="abschnitt ${farbe} ueber"><div class="huelle">
  <div>
    ${labelP(u.label)}
    <h2 class="titel t-gross">${akzent(u.titel)}</h2>
    ${(() => { const x = text || u.text; return Array.isArray(x) && x.length === 3
      ? `<p class="fliess u-a">${akzent(x[0])}</p>
    <div class="u-rechts"><p class="fliess u-b">${akzent(x[1])}</p> <p class="fliess u-c">${akzent(x[2])}</p></div>`
      : absaetze(x); })()}
    <p class="signatur notiz-d">${esc(u.signatur)}</p>
  </div>
</div></section>`;
}

function formular(lang) {
  const a = T[lang].freebie.anmeldung;
  const id = lang === "de" ? cfg.kit.formIdDe : cfg.kit.formIdEn;
  const vorschau = istPlatzhalter(id);
  const action = vorschau ? PFADE.danke[lang] : `https://app.kit.com/forms/${encodeURIComponent(id)}/subscriptions`;
  return `<form class="formular" data-formular method="post" action="${action}" data-vorschau="${vorschau ? "ja" : "nein"}" data-danke="${PFADE.danke[lang]}" data-fehler="${esc(a.fehler)}" novalidate>
  <div class="feld-reihe">
    <div class="feld"><label class="nur-vorlesen" for="vorname-${lang}">${esc(a.vorname)}</label><input id="vorname-${lang}" name="fields[first_name]" autocomplete="given-name" placeholder="${esc(a.vorname)}" required></div>
    <div class="feld"><label class="nur-vorlesen" for="nachname-${lang}">${esc(a.nachname)}</label><input id="nachname-${lang}" name="fields[last_name]" autocomplete="family-name" placeholder="${esc(a.nachname)}" required></div>
  </div>
  <div class="feld"><label class="nur-vorlesen" for="email-${lang}">${esc(a.email)}</label><input id="email-${lang}" name="email_address" type="email" autocomplete="email" inputmode="email" placeholder="${esc(a.email)}" required></div>
  <div class="feld"><label class="nur-vorlesen" for="telefon-${lang}">${esc(a.telefon)}</label>
    <div class="telefon-reihe">
      <select id="vorwahl-${lang}" aria-label="${esc(a.vorwahl)}" data-vorwahl>${(a.laender || []).map(([c, n, v], i) => `<option value="${esc(v)}"${i === 0 ? " selected" : ""}>${esc(c)} ${esc(v)}</option>`).join("")}</select>
      <input id="telefon-${lang}" type="tel" autocomplete="tel-national" inputmode="tel" placeholder="${esc(a.telefon)}" data-telefon>
    </div>
  </div>
  <input type="hidden" name="fields[telefon]" data-feld="telefon">
  <div class="feld"><label class="nur-vorlesen" for="situation-${lang}">${esc(a.situation)}</label>
    <select id="situation-${lang}" name="fields[situation]" required><option value="" selected disabled>${esc(a.situation)}</option>${(a.situationen || []).map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join("")}</select>
  </div>
  <input type="hidden" name="fields[quelle]" data-feld="quelle">
  <input type="hidden" name="fields[kampagne]" data-feld="kampagne">
  <p class="formular-fehler" role="alert" aria-live="polite"></p>
  <button class="button button-rot" type="submit">${esc(a.button)} <span aria-hidden="true">→</span></button>
</form>`;
}

function formularHinweis(lang) {
  const a = T[lang].freebie.anmeldung;
  return `<p class="kleingedruckt">${esc(a.hinweis)}</p>`;
}

function seitenRahmen(lang, seite, { titel, beschreibung, noindex = false, ogBild }, body) {
  const alt = { de: PFADE[seite].de, en: PFADE[seite].en };
  const url = cfg.domain + PFADE[seite][lang];
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titel)}</title>
${beschreibung ? `<meta name="description" content="${esc(beschreibung)}">` : ""}
${noindex ? `<meta name="robots" content="noindex, nofollow">` : ""}
<link rel="canonical" href="${url}">
${alt.de && alt.en ? `<link rel="alternate" hreflang="de" href="${cfg.domain}${alt.de}">
<link rel="alternate" hreflang="en" href="${cfg.domain}${alt.en}">
<link rel="alternate" hreflang="x-default" href="${cfg.domain}${alt.en}">` : ""}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(titel)}">
${beschreibung ? `<meta property="og:description" content="${esc(beschreibung)}">` : ""}
<meta property="og:url" content="${url}">
${ogBild ? `<meta property="og:image" content="${cfg.domain}/assets/img/${ogBild}-960.webp">` : ""}
<meta name="theme-color" content="#F9F6EF">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/instrument-serif-regular.woff" as="font" type="font/woff" crossorigin>
<link rel="stylesheet" href="/assets/css/site.css?v=${VERSION}">
</head>
<body>
${body}
<script src="/assets/js/site.js?v=${VERSION}" defer></script>
</body>
</html>`;
}

// ---------- Seiten ----------

function seiteFreebie(lang) {
  const t = T[lang], f = t.freebie, img = IMG[lang];
  const body = `${kopf(lang, "freebie")}
<main>
<section class="abschnitt creme hero"><div class="huelle">
  <div>
    <p class="label">${esc(f.hero.label)}</p>
    <h1 class="titel t-hero t-hero-lang">${akzent(f.hero.titel)}</h1>
    ${absaetze(f.hero.text)}
    <a class="button button-rot" href="#anmeldung">${esc(f.hero.button || t.ui.freebieButton)} <span aria-hidden="true">→</span></a>
    <p class="notiz notiz-a">${esc(f.hero.notiz)}</p>
  </div>
  <div class="faecher">${bild(img.raum1, "", "f-links")}${bild(img.fund, "", "f-rechts")}${bild(img.freebie, "Escape Self-Sabotage – Raum 1", "f-mitte")}</div>
</div></section>
${laufband(lang)}
${wiedererkennen(f.wiedererkennen, "weiss")}
${haltung(lang, f.haltung)}
${soFunktionierts(lang, "creme", f.sofunktionierts)}
${ueber(lang, null, "weiss", f.ueber)}
<section class="abschnitt beige mitte anmeldung" id="anmeldung"><div class="huelle">
  <div class="anmeldung-raster">
    <div class="anmeldung-bild-spalte">
      <div class="faecher anmeldung-faecher" aria-hidden="true">${bild(img.raum1, "", "f-links")}${bild(img.fund, "", "f-rechts")}${bild(img.freebie, "", "f-mitte")}</div>
      ${f.anmeldung.bildNotiz ? `<p class="notiz notiz-c anmeldung-notiz">${esc(f.anmeldung.bildNotiz)}</p>` : ""}
    </div>
    <div class="anmeldung-inhalt">
      ${labelP(f.anmeldung.label)}
      <h2 class="titel t-gross">${akzent(f.anmeldung.titel)}</h2>
      ${absaetze(f.anmeldung.text)}
      ${formular(lang)}
    </div>
  </div>
  ${formularHinweis(lang)}
</div></section>
</main>
${fuss(lang)}`;
  return seitenRahmen(lang, "freebie", { titel: f.seo.titel, beschreibung: f.seo.beschreibung, ogBild: img.freebie }, body);
}

function preisbox(lang) {
  const t = T[lang], p = t.buch.preis, pr = cfg.preise[lang];
  const link = lang === "de" ? cfg.digistore.kaufLinkDe : cfg.digistore.kaufLinkEn;
  const href = istPlatzhalter(link) ? "#preis" : link;
  return `<div class="preisbox">
  <p class="label">${esc(p.label)}</p>
  <p class="preis-produkt">${esc(p.produkt)}</p>
  <p class="preis-zahl">${esc(pr.einfuehrung)}</p>
  <p class="preis-danach">${esc(p.danach)} ${esc(pr.regulaer)} · ${esc(p.format)}</p>
  <ul class="preis-punkte">${p.punkte.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
  <a class="button button-rot" href="${esc(href)}" rel="nofollow">${esc(p.button)} <span aria-hidden="true">→</span></a>
  <p class="preis-sicher">${esc(p.sicher)}</p>
</div>`;
}

function seiteBuch(lang) {
  const t = T[lang], b = t.buch, img = IMG[lang], pr = cfg.preise[lang];
  const body = `${kopf(lang, "buch", { kaufen: true })}
<main>
<section class="abschnitt creme hero"><div class="huelle">
  <div>
    <p class="label">${esc(b.hero.label)}</p>
    <h1 class="titel t-hero">${akzent(b.hero.titel)}</h1>
    <p class="fliess">${esc(b.hero.text)}</p>
    <a class="button button-rot" href="#preis">${esc(b.preis.button)} · ${esc(pr.einfuehrung)} <span aria-hidden="true">→</span></a>
    <p class="notiz notiz-a">${esc(b.hero.notiz)}</p>
  </div>
  <div class="mockup">${bild(img.buch, "Escape Self-Sabotage – E-Book", "buch")}${bild(img.fund, "", "seite")}</div>
</div></section>
${laufband(lang)}
${wiedererkennen(b.wiedererkennen, "weiss")}
${soFunktionierts(lang, "creme", b.sofunktionierts)}
<section class="abschnitt weiss"><div class="huelle">
  <div class="mitte">
    <p class="label">${esc(b.haus.label)}</p>
    <h2 class="titel t-gross">${akzent(b.haus.titel)}</h2>
  </div>
  <div class="haus-raster">
    <div>
      <p class="unterzeile">${esc(b.haus.stockwerk1)}</p>
      <ol class="liste">${b.haus.raeume.map((r, i) => `<li><span class="nr">${esc(b.haus.raumWort)} ${zwei(i + 1)}</span><span>${esc(r)}</span></li>`).join("")}</ol>
    </div>
    <div class="stockwerke">${b.haus.stockwerke.map((s) => `<div class="stockwerk ${s.offen ? "offen" : "zu"}"><p class="label">${esc(s.name)}</p><span>${esc(s.status)}</span></div>`).join("")}</div>
  </div>
</div></section>
${haltung(lang)}
${ueber(lang, null, "weiss", b.ueber)}
<section class="abschnitt creme" id="preis"><div class="huelle">${preisbox(lang)}</div></section>
<section class="abschnitt beige mitte linie-oben linie-unten"><div class="huelle">
  <p class="notiz notiz-c">${esc(b.rueckweg.notiz)}</p>
  <h2 class="titel t-mittel">${akzent(b.rueckweg.titel)}</h2>
  <a class="button button-dunkel" href="${PFADE.freebie[lang]}">${esc(b.rueckweg.button)} <span aria-hidden="true">→</span></a>
</div></section>
<section class="abschnitt weiss mitte"><div class="huelle">
  <p class="label">${esc(b.faq.label)}</p>
  <h2 class="titel t-gross">${akzent(b.faq.titel)}</h2>
  <div class="faq">${b.faq.fragen.map((q) => `<details><summary>${esc(q.f)}</summary><p>${esc(q.a)}</p></details>`).join("")}</div>
</div></section>
<section class="abschnitt weiss stimmen" hidden aria-hidden="true"><div class="huelle"><!-- Platz für echte Kundenstimmen --></div></section>
</main>
${fuss(lang)}`;
  return seitenRahmen(lang, "buch", { titel: b.seo.titel, beschreibung: b.seo.beschreibung, ogBild: img.buch }, body);
}

function seiteDanke(lang) {
  const t = T[lang], d = t.danke, img = IMG[lang];
  const body = `${kopf(lang, "danke")}
<main>
<section class="abschnitt creme mitte"><div class="huelle">
  <p class="label">${esc(d.label)}</p>
  <h1 class="titel t-gross">${akzent(d.titel)}</h1>
  <p class="fliess">${esc(d.text)}</p>
</div></section>
${laufband(lang)}
<section class="abschnitt weiss"><div class="huelle zwei-spalten">
  <div class="aufgeschlagen">${bild(img.buch, "Escape Self-Sabotage – E-Book")}</div>
  <div>
    <p class="label">${esc(d.angebotLabel)}</p>
    <h2 class="titel t-gross">${akzent(d.angebotTitel)}</h2>
    <p class="fliess">${esc(d.angebotText)}</p>
  </div>
</div></section>
<section class="abschnitt creme linie-oben" id="preis"><div class="huelle">${preisbox(lang)}</div></section>
</main>
${fuss(lang)}`;
  return seitenRahmen(lang, "danke", { titel: d.seo.titel, noindex: true }, body);
}

const reich = (x = "") => esc(x)
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\*([^*]+)\*/g, "<em>$1</em>")
  .replace(/\[\[EMAIL\]\]/g, `<a href="mailto:${esc(cfg.anbieter.email)}">${esc(cfg.anbieter.email)}</a>`)
  .replace(/\[\[([^\]]+@[^\]]+)\]\]/g, '<a href="mailto:$1">$1</a>');

function seitePrivacy(lang) {
  const t = T[lang], p = t.privacy;
  const teil = (x) => `${x.label ? `<h3 class="ds-label">${esc(x.label)}</h3>` : ""}
      ${[].concat(x.p || []).map((y) => `<p>${reich(y)}</p>`).join("")}
      ${x.liste ? `<ul class="ds-liste">${x.liste.map((y) => `<li>${reich(y)}</li>`).join("")}</ul>` : ""}
      ${x.tabelle ? `<div class="ds-tabelle-huelle"><table class="ds-tabelle"><thead><tr>${x.tabelle.kopf.map((k) => `<th>${esc(k)}</th>`).join("")}</tr></thead><tbody>${x.tabelle.zeilen.map((z) => `<tr>${z.map((c) => `<td>${reich(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}
      ${x.adresse ? `<address class="ds-adresse">${x.adresse.map(esc).join("<br>")}</address>` : ""}`;
  const body = `${kopf(lang, "privacy")}
<main class="ds">
<section class="abschnitt weiss ds-kopf"><div class="huelle">
  <p class="label">${esc(p.label)}</p>
  <h1 class="titel t-gross">${akzent(p.titel)}</h1>
  <p class="ds-stand">${esc(p.stand)}</p>
  <div class="ds-kurz"><p class="ds-label">${esc(p.kurzLabel)}</p><p>${reich(p.kurz)}</p></div>
</div></section>
<section class="abschnitt weiss ds-haupt"><div class="huelle ds-raster">
  <nav class="ds-inhalt" aria-label="${esc(p.inhaltLabel)}"><p class="ds-label">${esc(p.inhaltLabel)}</p>
    <ol>${p.abschnitte.map((a) => `<li><a href="#${a.id}">${esc(a.nav)}</a></li>`).join("")}</ol></nav>
  <div class="ds-text">
    ${p.abschnitte.map((a) => `<section class="ds-abschnitt${a.box ? " ds-box" : ""}" id="${a.id}"><h2>${akzent(a.t)}</h2>${a.teile.map(teil).join("")}</section>`).join("\n    ")}
  </div>
</div></section>
<section class="abschnitt butter mitte ds-schluss"><div class="huelle">
  <p class="ds-schluss-satz">${akzent(p.schluss)}</p>
  <p class="notiz">${esc(p.schlussNotiz)}</p>
</div></section>
</main>
${fuss(lang)}`;
  return seitenRahmen(lang, "privacy", { titel: p.seo.titel }, body);
}


function seiteImpressum(lang) {
  const im = T[lang].impressum;
  const teil = (x) => `${x.label ? `<h3 class="ds-label">${esc(x.label)}</h3>` : ""}${[].concat(x.p || []).map((y) => `<p>${reich(y)}</p>`).join("")}`;
  const body = `${kopf(lang, "impressum")}
<main class="ds">
<section class="abschnitt weiss ds-kopf"><div class="huelle">
  <p class="label">${esc(im.label)}</p>
  <h1 class="titel t-gross">${akzent(im.titel)}</h1>
  <dl class="ds-kurz im-angaben">${im.angaben.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${reich(v).replace(/\n/g, "<br>")}</dd>`).join("")}</dl>
</div></section>
<section class="abschnitt weiss ds-haupt"><div class="huelle"><div class="ds-text im-text">
  ${im.abschnitte.map((a) => `<section class="ds-abschnitt" id="${a.id}"><h2>${akzent(a.t)}</h2>${a.teile.map(teil).join("")}</section>`).join("\n  ")}
</div></div></section>
</main>
${fuss(lang)}`;
  return seitenRahmen(lang, "impressum", { titel: im.seo.titel }, body);
}

function startseite() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Identity Upgrade</title>
<link rel="alternate" hreflang="de" href="${cfg.domain}${PFADE.freebie.de}">
<link rel="alternate" hreflang="en" href="${cfg.domain}${PFADE.freebie.en}">
<link rel="alternate" hreflang="x-default" href="${cfg.domain}${PFADE.freebie.en}">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/css/site.css?v=${VERSION}">
<script src="/assets/js/sprache.js"></script>
</head>
<body>
<main class="abschnitt creme mitte"><div class="huelle">
  <p class="wortmarke" style="font-size:40px">Identity <em>Upgrade</em><sup>™</sup></p>
  <p style="margin-top:32px"><a class="button button-leer" href="${PFADE.freebie.de}" hreflang="de">Deutsch</a> <a class="button button-leer" href="${PFADE.freebie.en}" hreflang="en">English</a></p>
</div></main>
</body>
</html>`;
}

function seite404() {
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Seite nicht gefunden | Identity Upgrade</title><meta name="robots" content="noindex">
<link rel="stylesheet" href="/assets/css/site.css?v=${VERSION}"></head>
<body><main class="abschnitt creme mitte"><div class="huelle">
<p class="label">404</p><h1 class="titel t-gross">Diese Tür ist <em>verschlossen.</em></h1>
<p class="fliess">This door is locked.</p>
<p><a class="button button-leer" href="${PFADE.freebie.de}">Deutsch</a> <a class="button button-leer" href="${PFADE.freebie.en}">English</a></p>
</div></main></body></html>`;
}

// ---------- Ausgabe ----------

function schreibe(pfad, inhalt) {
  const ziel = join(DIST, pfad.endsWith("/") ? pfad + "index.html" : pfad);
  mkdirSync(dirname(ziel), { recursive: true });
  writeFileSync(ziel, inhalt);
}

if (existsSync(DIST)) rmSync(DIST, { recursive: true });
mkdirSync(DIST, { recursive: true });
cpSync(join(ROOT, "src/assets"), join(DIST, "assets"), { recursive: true });
cpSync(join(ROOT, "src/static"), DIST, { recursive: true });

for (const lang of ["de", "en"]) {
  schreibe(PFADE.freebie[lang], seiteFreebie(lang));
  schreibe(PFADE.buch[lang], seiteBuch(lang));
  schreibe(PFADE.danke[lang], seiteDanke(lang));
  if (PFADE.impressum[lang]) schreibe(PFADE.impressum[lang], seiteImpressum(lang));
  schreibe(PFADE.privacy[lang], seitePrivacy(lang));
}
schreibe("/", startseite());
schreibe("/404.html", seite404());

const indexierbar = ["freebie", "buch", "impressum", "privacy"].flatMap((s) => ["de", "en"].filter((l) => PFADE[s][l]).map((l) => cfg.domain + PFADE[s][l]));
schreibe("/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexierbar.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>
`);

console.log(`Fertig: dist/ (${VORSCHAU ? "Vorschaumodus – Platzhalter vorhanden" : "ohne Platzhalter"})`);
