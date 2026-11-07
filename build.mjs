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
const STAND = new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
import { createHash } from "node:crypto";
const imgV = (datei) => { try { return createHash("md5").update(readFileSync(new URL("./src/assets/img/" + datei, import.meta.url))).digest("hex").slice(0, 8); } catch { return VERSION; } };
const imgUrl = (datei) => `/assets/img/${datei}?v=${imgV(datei)}`;

// Pfade je Seite und Sprache
const PFADE = {
  freebie: { de: "/de/escape-self-sabotage-r1/", en: "/en/escape-self-sabotage-r1/" },
  danke: { de: "/de/escape-self-sabotage-r1-thanks/", en: "/en/escape-self-sabotage-r1-thanks/" },
  buch: { de: "/de/escape-self-sabotage-l1/", en: "/en/escape-self-sabotage-l1/" },
  buchDanke: { de: "/de/escape-self-sabotage-l1-thanks/", en: "/en/escape-self-sabotage-l1-thanks/" },
  waitlist: { de: "/de/waitlist/", en: "/en/waitlist/" },
  impressum: { de: "/de/impressum/", en: "/en/legal-notice/" },
  privacy: { de: "/de/privacy/", en: "/en/privacy/" },
};

const istPlatzhalter = (s) => typeof s === "string" && /^\[.*\]$/.test(s.trim());
// Vorschau-Band nur in der Vorschau, nie auf dem Live-Zweig (Cloudflare setzt CF_PAGES_BRANCH beim Build)
const IST_LIVE = process.env.CF_PAGES_BRANCH === "main";
const VORSCHAU = !IST_LIVE && (JSON.stringify(cfg).includes("[") || JSON.stringify(T).includes("["));

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
  de: { buch: "buch-cover-de", freebie: "freebie-cover-de", raum1: "freebie-raum1-de", spur: "buch-seite-spur-de", fund: "buch-seite-fund-de", eb: ["buch-seite-r5-de", "buch-seite-fund6-de", "buch-seite-merken-de", "buch-seite-deins-de"] },
  en: { buch: "book-cover-en", freebie: "freebie-cover-en", raum1: "freebie-room1-en", spur: "book-page-clue-en", fund: "book-page-find-en", eb: ["book-page-r5-en", "book-page-find6-en", "book-page-note-en", "book-page-yours-en"] },
};

function kopf(lang, seite, { kaufen = false } = {}) {
  const t = T[lang];
  const sprache = `<nav class="sprache" aria-label="${esc(t.ui.sprache)}">${
    lang === "de"
      ? `<span class="aktiv" aria-current="true">DE</span><a href="${PFADE[seite].en || PFADE.privacy.en}" hreflang="en" lang="en">EN</a>`
      : `<a href="${PFADE[seite].de}" hreflang="de" lang="de">DE</a><span class="aktiv" aria-current="true">EN</span>`
  }</nav>`;
  const kaufHref = (() => { const l = lang === "de" ? cfg.digistore.kaufLinkDe : cfg.digistore.kaufLinkEn; return istPlatzhalter(l) ? "#price" : l; })();
  const kauf = kaufen ? `<a class="button button-rot button-klein kopf-kauf" href="${esc(kaufHref)}" rel="nofollow" data-kopf-kauf tabindex="-1" aria-hidden="true">${esc(t.ui.kaufen)}</a>` : "";
  return `${VORSCHAU ? `<div class="vorschau-band">${esc(t.ui.vorschau)} · Stand ${STAND}</div>` : ""}
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
  <p class="notiz notiz-b">${esc(s.notiz).replace(/\n/g, "<br>")}</p>
  ${s.button ? `<a class="button button-rot" href="#signup">${esc(s.button)} <span aria-hidden="true">→</span></a>` : ""}
</div></section>`;
}

function haltung(lang, daten) {
  const h = daten || T[lang].gemeinsam.haltung;
  return `<section class="abschnitt gruen mitte haltung"><div class="huelle">
  ${labelP(h.label)}
  <h2 class="titel t-gross">${akzent(h.titel).replace(/\n/g, "<br>")}</h2>
  ${absaetze(h.text)}
  ${h.button ? `<a class="button button-rot" href="#signup">${esc(h.button)} <span aria-hidden="true">→</span></a>` : ""}
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
    <a class="button button-rot" href="#signup">${esc(f.hero.button || t.ui.freebieButton)} <span aria-hidden="true">→</span></a>
    <p class="notiz notiz-a">${esc(f.hero.notiz)}</p>
  </div>
  <div class="faecher">${bild(img.raum1, "", "f-links")}${bild(img.fund, "", "f-rechts")}${bild(img.freebie, "Escape Self-Sabotage – Raum 1", "f-mitte")}</div>
</div></section>
${laufband(lang)}
${wiedererkennen(f.wiedererkennen, "weiss")}
${haltung(lang, f.haltung)}
${soFunktionierts(lang, "creme", f.sofunktionierts)}
${ueber(lang, null, "weiss", f.ueber)}
<section class="abschnitt beige mitte anmeldung" id="signup"><div class="huelle">
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

function faqAbschnitt(lang) {
  const b = T[lang].buch;
  return `<section class="abschnitt weiss mitte"><div class="huelle">
  <p class="label">${esc(b.faq.label)}</p>
  <h2 class="titel t-gross">${akzent(b.faq.titel)}</h2>
  <div class="faq">${b.faq.fragen.map((q) => `<details><summary>${esc(q.f)}</summary><p>${esc(q.a)}</p></details>`).join("")}</div>
</div></section>`;
}

const HAKEN = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5L19.5 7"/></svg>';
const KREUZ = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function fuerWen(lang) {
  const f = T[lang].buch.fuerwen, pr = cfg.preise[lang];
  const link = lang === "de" ? cfg.digistore.kaufLinkDe : cfg.digistore.kaufLinkEn;
  const href = istPlatzhalter(link) ? "#price" : link;
  const spalte = (x, art) => `<div class="fw-spalte fw-${art}"><p class="fw-kopf">${esc(x.kopf)}</p><ol class="fw-liste">${x.punkte.map((t, i) => `<li><span class="fw-nr" aria-hidden="true">${art === "ja" ? HAKEN : KREUZ}</span><p>${esc(t)}</p></li>`).join("")}</ol></div>`;
  return `<section class="abschnitt weiss fuerwen"><div class="huelle">
  <h2 class="titel t-gross">${akzent(f.titel)}</h2>
  <div class="fw-raster">${spalte(f.ja, "ja")}${spalte(f.nein, "nein")}</div>
  <div class="fw-notiz-reihe mit-button">${f.schlussNotiz ? `<p class="notiz notiz-a fw-schluss">${esc(f.schlussNotiz).replace(/\n/g, "<br>")}</p>` : "<span></span>"}<div class="fw-button fw-button-mitte"><a class="button button-rot" href="${esc(href)}" rel="nofollow">${esc(f.button)} · ${esc(pr.einfuehrung)} <span aria-hidden="true">→</span></a></div><span></span></div>
  </div></section>`;
}

const kaufLink = (lang) => { const l = lang === "de" ? cfg.digistore.kaufLinkDe : cfg.digistore.kaufLinkEn; return istPlatzhalter(l) ? "#price" : l; };

function preisAbschnitt(lang, { vorLabel = "", label = "", titel = "" } = {}) {
  const t = T[lang], p = t.buch.preis, pr = cfg.preise[lang], img = IMG[lang];
  const link = lang === "de" ? cfg.digistore.kaufLinkDe : cfg.digistore.kaufLinkEn;
  const href = istPlatzhalter(link) ? "#price" : link;
  return `<section class="abschnitt creme preis-abschnitt" id="price"><div class="huelle">
  ${vorLabel ? `<p class="label preis-vorlabel">${esc(vorLabel)}</p>` : ""}
  <div class="anmeldung-raster">
    <div class="anmeldung-bild-spalte">
      <div class="faecher faecher-vier preis-faecher" aria-hidden="true">${img.eb.map((n, i) => bild(n, "", "f-s" + (i + 1))).join("")}${bild(img.buch, "", "f-mitte")}</div>
      ${p.bildNotiz ? `<p class="notiz notiz-c anmeldung-notiz">${esc(p.bildNotiz)}</p>` : ""}
    </div>
    <div class="anmeldung-inhalt preis-inhalt">
      ${labelP(label || p.label)}
      <h2 class="titel t-gross">${akzent(titel || p.titel).replace(/\n/g, "<br>")}</h2>
      ${absaetze(p.text)}
      <div class="preis-zeile"><p class="preis-zahl">${esc(pr.einfuehrung)}</p><p class="notiz preis-notiz">${esc(p.danach)} ${esc(pr.regulaer)}</p></div>
      <ul class="preis-punkte">${p.punkte.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <a class="button button-rot" href="${esc(href)}" rel="nofollow">${esc(p.button)} <span aria-hidden="true">→</span></a>
    </div>
  </div>
</div></section>`;
}

function preisbox(lang) {
  const t = T[lang], p = t.buch.preis, pr = cfg.preise[lang];
  const link = lang === "de" ? cfg.digistore.kaufLinkDe : cfg.digistore.kaufLinkEn;
  const href = istPlatzhalter(link) ? "#price" : link;
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

const SCHLOSS = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.1" fill="currentColor" stroke="none"/></svg>';
const SCHLUESSEL = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.5" cy="12" r="4"/><path d="M11.5 12h9.5"/><path d="M18 12v3"/><path d="M21 12v2.2"/></svg>';

const MESSING_SCHLOSS = '<svg viewBox="0 0 34 40" aria-hidden="true"><defs><linearGradient id="ms" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F1D58A"/><stop offset=".5" stop-color="#C99A3E"/><stop offset="1" stop-color="#8E6A24"/></linearGradient></defs><path d="M9 18V12a8 8 0 0 1 16 0v6" fill="none" stroke="url(#ms)" stroke-width="3.6"/><rect x="3" y="17" width="28" height="21" rx="3" fill="url(#ms)" stroke="#7A5A1D" stroke-width=".8"/><circle cx="17" cy="25.5" r="2.8" fill="#3A2A0E"/><path d="M15.8 27h2.4l.8 6h-4z" fill="#3A2A0E"/></svg>';

function hausZeichnung(h) {
  return `<div class="haus-bild haus-breit haus-stein" role="img" aria-label="${esc(h.s1)} · ${esc(h.skOffen)}; ${esc(h.s2)}, ${esc(h.s3)} · ${esc(h.skFolgt)}">
  <img src="${imgUrl("haus-stein-1200.webp")}" srcset="${imgUrl("haus-stein-600.webp")} 600w, ${imgUrl("haus-stein-1200.webp")} 1200w" sizes="(min-width: 900px) 460px, 90vw" alt="" loading="lazy" decoding="async">
  <p class="hz-notiz hz-schloss hz-l3">${MESSING_SCHLOSS}</p>
  <p class="hz-notiz hz-schloss hz-l2">${MESSING_SCHLOSS}</p>
  <p class="hz-notiz hz-n1"><span>${esc(h.s1)} · ${esc(h.skOffen)}</span></p>
  <p class="hz-notiz hz-neg"><span>${esc(h.eg)}</span></p>
</div>`;
}

function hausAbschnitt(hs, stil = hs.stil, preisText = "", kaufHref = "#price") {
  return `<section class="abschnitt beige haus-abschnitt"><div class="huelle">
  <div class="mitte">
    ${hs.label ? `<p class="label">${esc(hs.label)}</p>` : ""}
    <h2 class="titel t-gross">${akzent(hs.titel)}</h2>
  </div>
  <div class="haus-raster">
    <div class="raum-liste">
      ${hs.kopf ? `<p class="raum-kopf">${esc(hs.kopf)}</p>` : ""}
      <div class="raum-toggles">${hs.raeume.map((r, i) => `<details class="raum-toggle"><summary><span class="raum-nr"><small>${esc(hs.raumWort)}</small>${zwei(i + 1)}</span><h3>${esc(r.t)}</h3><span class="raum-plus" aria-hidden="true"></span></summary><p>${esc(r.x)}</p></details>`).join("")}</div>
      ${hs.notiz ? `<p class="notiz notiz-a haus-notiz">${esc(hs.notiz)}</p>` : ""}
    </div>
    ${hausZeichnung(hs.haus)}
  </div>
  ${hs.button ? `<div class="mitte haus-button-zeile"><a class="button button-rot" href="${esc(kaufHref)}" rel="nofollow">${esc(hs.button)}${preisText ? ` · ${esc(preisText)}` : ""} <span aria-hidden="true">→</span></a></div>` : ""}
</div></section>`;
}

function seiteBuch(lang) {
  const t = T[lang], b = t.buch, img = IMG[lang], pr = cfg.preise[lang];
  const body = `${kopf(lang, "buch", { kaufen: true })}
<main>
<section class="abschnitt creme hero"><div class="huelle">
  <div>
    <p class="label">${esc(b.hero.label)}</p>
    <h1 class="titel t-hero t-hero-lang">${akzent(b.hero.titel)}</h1>
    ${absaetze(b.hero.text)}
    <a class="button button-rot" href="${esc(kaufLink(lang))}" rel="nofollow">${esc(b.hero.button || b.preis.button)} · ${esc(pr.einfuehrung)} <span aria-hidden="true">→</span></a>
    <p class="notiz notiz-a">${esc(b.hero.notiz)}</p>
  </div>
  <div class="faecher faecher-vier">${img.eb.map((n, i) => bild(n, "", "f-s" + (i + 1))).join("")}${bild(img.buch, "Escape Self-Sabotage – E-Book", "f-mitte")}</div>
</div></section>
${laufband(lang)}
${wiedererkennen(b.wiedererkennen, "weiss")}
${soFunktionierts(lang, "creme", b.sofunktionierts)}
${hausAbschnitt(b.haus, "foto", pr.einfuehrung, kaufLink(lang))}
${haltung(lang, b.haltung)}
${ueber(lang, null, "weiss", b.ueber)}
${preisAbschnitt(lang)}
<section class="abschnitt beige mitte linie-oben linie-unten"><div class="huelle">
  <p class="notiz notiz-c">${esc(b.rueckweg.notiz)}</p>
  <h2 class="titel t-mittel">${akzent(b.rueckweg.titel)}</h2>
  <a class="button button-dunkel" href="${PFADE.freebie[lang]}">${esc(b.rueckweg.button)} <span aria-hidden="true">→</span></a>
</div></section>
${b.fuerwen ? fuerWen(lang) : faqAbschnitt(lang)}
<section class="abschnitt weiss stimmen" hidden aria-hidden="true"><div class="huelle"><!-- Platz für echte Kundenstimmen --></div></section>
</main>
${fuss(lang)}`;
  return seitenRahmen(lang, "buch", { titel: b.seo.titel, beschreibung: b.seo.beschreibung, ogBild: img.buch }, body);
}

function seiteDanke(lang) {
  const t = T[lang], d = t.danke;
  const body = `${kopf(lang, "danke", { kaufen: true })}
<main>
<section class="abschnitt creme mitte"><div class="huelle">
  <p class="label">${esc(d.label)}</p>
  <h1 class="titel t-gross">${akzent(d.titel)}</h1>
  <p class="fliess">${esc(d.text)}</p>
</div></section>
${laufband(lang)}
${preisAbschnitt(lang, { label: d.angebotLabel, titel: d.angebotTitel })}
${fuerWen(lang)}
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

function seiteBuchDanke(lang) {
  const d = T[lang].buchDanke;
  const body = `${kopf(lang, "buchDanke")}
<main class="voll-main">
<section class="abschnitt creme mitte danke-schlicht"><div class="huelle">
  ${labelP(d.label)}
  <h1 class="titel t-gross">${akzent(d.titel)}</h1>
  ${absaetze(d.text)}
  <div class="ebook-download" data-ebook hidden>
    <p class="ebook-laden" data-ebook-laden>${esc(d.download.laden)}</p>
    <a class="button button-rot" data-ebook-button href="#" hidden>${esc(d.download.button)} <span aria-hidden="true">↓</span></a>
    <p class="ebook-hinweis" data-ebook-hinweis hidden>${esc(d.download.hinweis)}</p>
    <p class="ebook-meldung" data-ebook-meldung role="status" hidden></p>
  </div>
  ${d.notiz ? `<p class="notiz notiz-c">${esc(d.notiz)}</p>` : ""}
</div></section>
</main>
${fuss(lang)}`;
  return seitenRahmen(lang, "buchDanke", { titel: d.seo.titel, noindex: true }, body);
}

function waitlistFormular(lang) {
  const w = T[lang].waitlist, a = T[lang].freebie.anmeldung;
  const id = cfg.kit.waitlistFormId;
  const vorschau = istPlatzhalter(id);
  const action = vorschau ? PFADE.waitlist[lang] + "#danke" : `https://app.kit.com/forms/${encodeURIComponent(id)}/subscriptions`;
  const tag = (k) => (cfg.kit.waitlistTags && !istPlatzhalter(cfg.kit.waitlistTags[k]) ? cfg.kit.waitlistTags[k] : k);
  return `<form class="formular wl-formular" data-formular data-waitlist method="post" action="${action}" data-vorschau="${vorschau ? "ja" : "nein"}" data-danke="${PFADE.waitlist[lang]}?eingetragen=1" data-fehler="${esc(w.fehler)}" novalidate>
  <fieldset class="wl-auswahl" data-auswahl><legend class="wl-legende">${esc(w.auswahlFrage)}</legend>
    ${w.optionen.map((o) => `<label class="wl-option"><input type="checkbox" name="tags[]" value="${esc(tag(o.key))}" data-fuer="${esc(o.key)}"><span>${esc(o.text)}</span></label>`).join("")}
  </fieldset>
  <div class="feld-reihe">
    <div class="feld"><label class="nur-vorlesen" for="wl-vorname-${lang}">${esc(a.vorname)}</label><input id="wl-vorname-${lang}" name="fields[first_name]" autocomplete="given-name" placeholder="${esc(a.vorname)}" required></div>
    <div class="feld"><label class="nur-vorlesen" for="wl-nachname-${lang}">${esc(a.nachname)}</label><input id="wl-nachname-${lang}" name="fields[last_name]" autocomplete="family-name" placeholder="${esc(a.nachname)}" required></div>
  </div>
  <div class="feld"><label class="nur-vorlesen" for="wl-email-${lang}">${esc(a.email)}</label><input id="wl-email-${lang}" name="email_address" type="email" autocomplete="email" inputmode="email" placeholder="${esc(a.email)}" required></div>
  <input type="hidden" name="fields[quelle]" data-feld="quelle">
  <input type="hidden" name="fields[kampagne]" data-feld="kampagne">
  <p class="formular-fehler" role="alert" aria-live="polite"></p>
  <button class="button button-rot" type="submit">${esc(w.button)} <span aria-hidden="true">→</span></button>
</form>`;
}

function seiteWaitlist(lang) {
  const w = T[lang].waitlist;
  const body = `${kopf(lang, "waitlist")}
<main>
<section class="abschnitt creme mitte wl-kopf"><div class="huelle">
  ${labelP(w.label)}
  <h1 class="titel t-gross">${akzent(w.titel)}</h1>
  ${absaetze(w.text)}
</div></section>
<section class="abschnitt weiss mitte wl-produkte"><div class="huelle">
  <div class="karten wl-karten">${w.optionen.map((o) => `<div class="karte" data-produkt="${esc(o.key)}"><h3 class="label">${esc(o.kartenTitel)}</h3><p>${esc(o.kartenText)}</p></div>`).join("")}</div>
</div></section>
<section class="abschnitt beige mitte wl-anmeldung" id="signup"><div class="huelle">
  <h2 class="titel t-mittel">${akzent(w.formTitel)}</h2>
  <div class="wl-erfolg" data-erfolg hidden><p class="notiz notiz-c">${esc(w.erfolg)}</p></div>
  ${waitlistFormular(lang)}
  <p class="kleingedruckt">${esc(w.hinweis)}</p>
</div></section>
</main>
${fuss(lang)}`;
  return seitenRahmen(lang, "waitlist", { titel: w.seo.titel, beschreibung: w.seo.beschreibung }, body);
}

function startseite() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Identity Upgrade</title>
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/css/site.css?v=${VERSION}">
</head>
<body class="startseite">
<main class="start-flaeche"><h1 class="wortmarke start-wortmarke">Identity <em>Upgrade</em><sup>™</sup></h1></main>
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
  schreibe(PFADE.buchDanke[lang], seiteBuchDanke(lang));
  schreibe(PFADE.waitlist[lang], seiteWaitlist(lang));
  if (PFADE.impressum[lang]) schreibe(PFADE.impressum[lang], seiteImpressum(lang));
  schreibe(PFADE.privacy[lang], seitePrivacy(lang));
}
schreibe("/", startseite());
schreibe("/404.html", seite404());

const indexierbar = ["freebie", "buch", "waitlist", "impressum", "privacy"].flatMap((s) => ["de", "en"].filter((l) => PFADE[s][l]).map((l) => cfg.domain + PFADE[s][l]));
schreibe("/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexierbar.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>
`);

console.log(`Fertig: dist/ (${VORSCHAU ? "Vorschaumodus – Platzhalter vorhanden" : "ohne Platzhalter"})`);
