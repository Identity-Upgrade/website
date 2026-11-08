// Pförtner für das E-Book „Escape Self-Sabotage – Stockwerk 1“
//
// Ablauf:
// 1. Digistore24 leitet nach dem Kauf auf die Danke-Seite weiter und hängt die Bestelldaten
//    samt digitaler Unterschrift (sha_sign, erzeugt mit dem Danke-Seiten-Schlüssel) an.
// 2. Die Danke-Seite fragt hier den Stand ab (?action=status) und zeigt den Download-Button.
// 3. Der Download (?action=download) liefert das PDF aus dem R2-Lagerraum aus.
//
// Regeln (festgelegt mit Heike, 07.11.2026):
// - Gültig 30 Tage ab dem ersten Aufruf der Danke-Seite, solange noch nicht heruntergeladen wurde.
// - Nach dem ersten Download bleiben 15 Minuten Nachfrist für höchstens einen weiteren Download
//   (insgesamt maximal 2), danach ist die Bestellung gesperrt.
// - Pro Bestellung liegt eine Notiz im Lagerraum: bestellungen/<Bestellnummer>.json
//   (nur Bestellnummer, Produkt und Zeitpunkte – keine E-Mail-Adresse).
// - Freischalten im Einzelfall: Notiz im Lagerraum löschen.
// - Abgewiesene Aufrufe werden notiert: abgewiesen/<Zeitpunkt>-<Bestellnummer>.json
//   (Grund, Bestellnummer, Produkt, Namen der mitgeschickten Felder – keine Werte, keine Kundendaten).
//
// Benötigt in Cloudflare (Production und Preview):
// - R2-Bindung EBOOKS → identity-upgrade-ebooks
// - Geheimwert DS24_THANKYOU_KEY = Danke-Seiten-Schlüssel aus Digistore24

const GUELTIG_MS = 30 * 24 * 60 * 60 * 1000;
const NACHFRIST_MS = 15 * 60 * 1000;
const MAX_DOWNLOADS = 2;

const PRODUKTE = {
  "761708": { datei: "Escape-Self-Sabotage_DE_L1.pdf", lang: "de" },
  "761745": { datei: "Escape-Self-Sabotage_EN_L1.pdf", lang: "en" },
};

const TEXTE = {
  de: {
    abgelaufen: "Dieser Download-Link ist abgelaufen.\nSchreib uns an hello@identity-upgrade.com, wir helfen dir weiter.",
    ungueltig: "Wir konnten deinen Kauf nicht bestätigen.\nSchreib uns an hello@identity-upgrade.com, wir helfen dir weiter.",
    ohneDaten: "Den Download-Link findest du auch in deiner Bestellbestätigung von Digistore24.\nFalls etwas nicht klappt, schreib uns an hello@identity-upgrade.com.",
    fehler: "Gerade ist etwas schiefgelaufen.\nBitte versuch es gleich noch einmal oder schreib uns an hello@identity-upgrade.com.",
  },
  en: {
    abgelaufen: "This download link has expired.\nEmail us at hello@identity-upgrade.com and we'll help you out.",
    ungueltig: "We couldn't confirm your purchase.\nEmail us at hello@identity-upgrade.com and we'll help you out.",
    ohneDaten: "You'll also find the download link in your order confirmation from Digistore24.\nIf anything doesn't work, email us at hello@identity-upgrade.com.",
    fehler: "Something went wrong just now.\nPlease try again in a moment or email us at hello@identity-upgrade.com.",
  },
};

// Digistore24-Signatur nachbilden (SHA-512 über sortierte „schlüssel=wertPASSWORT“-Paare),
// wie in der offiziellen Funktion digistore_signature(): wahlweise mit Schlüsseln in Großbuchstaben
// und wahlweise mit dekodierten HTML-Zeichen (&amp; usw.).
async function signatur(paare, passwort, grossbuchstaben, htmlDekodieren) {
  const liste = paare
    .filter(([k]) => k !== "sha_sign" && k !== "SHASIGN" && k !== "action")
    .map(([k, v]) => [grossbuchstaben ? k.toUpperCase() : k, v]);
  liste.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  let s = "";
  for (const [k, roh] of liste) {
    if (roh === null || roh === undefined || roh === "") continue;
    const v = htmlDekodieren ? htmlDekodiert(roh) : roh;
    s += `${k}=${v}${passwort}`;
  }
  const hash = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(s));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function htmlDekodiert(v) {
  return v
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// Abfrage-Text in Paare zerlegen. Zwei Lesarten: „+“ als Leerzeichen (üblich) und „+“ als Pluszeichen.
function paareAus(suche, plusAlsLeerzeichen) {
  const roh = suche.replace(/^\?/, "");
  if (!roh) return [];
  return roh.split("&").filter(Boolean).map((teil) => {
    const i = teil.indexOf("=");
    const k = i < 0 ? teil : teil.slice(0, i);
    const v = i < 0 ? "" : teil.slice(i + 1);
    const dek = (x) => {
      const y = plusAlsLeerzeichen ? x.replace(/\+/g, " ") : x;
      try { return decodeURIComponent(y); } catch { return y; }
    };
    return [dek(k), dek(v)];
  });
}

function gleich(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function unterschriftGueltig(suche, params, passwort) {
  const sha = (params.get("sha_sign") || params.get("SHASIGN") || "").toUpperCase();
  if (!sha || !passwort) return false;
  for (const plus of [true, false]) {
    const paare = paareAus(suche, plus);
    for (const gross of [false, true]) {
      for (const html of [false, true]) {
        if (gleich(await signatur(paare, passwort, gross, html), sha)) return true;
      }
    }
  }
  return false;
}

// Abgewiesenen Aufruf notieren (ohne Werte, damit keine Kundendaten im Lagerraum landen)
async function abweisungNotieren(env, grund, params, orderId, aktion) {
  try {
    const zeit = new Date().toISOString();
    const notiz = {
      zeit,
      grund,
      aktion,
      bestellnummer: orderId || null,
      produkt: params.get("product_id") || null,
      felder: [...new Set(params.keys())].sort(),
    };
    await env.EBOOKS.put(`abgewiesen/${zeit.replace(/[:.]/g, "-")}-${orderId || "ohne"}.json`, JSON.stringify(notiz, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });
  } catch (e) {}
}

function json(daten, status = 200) {
  return new Response(JSON.stringify(daten), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}

function hinweisSeite(text, lang, status) {
  const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Identity Upgrade</title><link rel="stylesheet" href="/assets/css/site.css"></head><body class="startseite"><main class="start-flaeche"><p style="color:#fff;font-size:20px;line-height:1.5;max-width:560px;text-align:center;margin:0">${text.split("\n").map((z) => z.replace(/(hello@identity-upgrade\.com)/g, '<a href="mailto:$1" style="color:#fff;white-space:nowrap">$1</a>')).join("<br>")}</p></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}

// Stand einer Bestellung berechnen
function stand(notiz, jetzt) {
  const downloads = notiz.downloads || [];
  if (downloads.length === 0) {
    return jetzt - notiz.erstAufruf <= GUELTIG_MS ? "bereit" : "abgelaufen";
  }
  if (downloads.length >= MAX_DOWNLOADS) return "abgelaufen";
  return jetzt - downloads[0] <= NACHFRIST_MS ? "bereit" : "abgelaufen";
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const aktion = params.get("action") || "status";
  const produkt = PRODUKTE[params.get("product_id") || ""];
  const lang = produkt ? produkt.lang : (params.get("buyer_language") || params.get("page")) === "de" ? "de" : "en";
  const t = TEXTE[lang];
  const orderId = (params.get("order_id") || "").replace(/[^A-Za-z0-9_-]/g, "");

  try {
    if (!env.EBOOKS || !env.DS24_THANKYOU_KEY) {
      return aktion === "download" ? hinweisSeite(t.fehler, lang, 503) : json({ stand: "fehler", text: t.fehler }, 503);
    }
    const hatUnterschrift = !!(params.get("sha_sign") || params.get("SHASIGN"));
    let grund = "";
    if (!hatUnterschrift) grund = "ohne Bestelldaten";
    else if (!produkt) grund = "unbekanntes Produkt";
    else if (!orderId) grund = "ohne Bestellnummer";
    else if (!(await unterschriftGueltig(url.search, params, env.DS24_THANKYOU_KEY))) grund = "Unterschrift passt nicht";
    if (grund) {
      await abweisungNotieren(env, grund, params, orderId, aktion);
      const text = hatUnterschrift ? t.ungueltig : t.ohneDaten;
      return aktion === "download" ? hinweisSeite(text, lang, 403) : json({ stand: "ungueltig", text }, 403);
    }

    const jetzt = Date.now();
    const notizKey = `bestellungen/${orderId}.json`;
    const vorhanden = await env.EBOOKS.get(notizKey);
    let notiz = vorhanden ? await vorhanden.json() : null;
    if (!notiz) {
      notiz = { bestellnummer: orderId, produkt: params.get("product_id"), erstAufruf: jetzt, downloads: [] };
      await env.EBOOKS.put(notizKey, JSON.stringify(notiz, null, 2), { httpMetadata: { contentType: "application/json" } });
    }

    const s = stand(notiz, jetzt);
    if (aktion !== "download") {
      return json({ stand: s, text: s === "abgelaufen" ? t.abgelaufen : "" });
    }
    if (s !== "bereit") return hinweisSeite(t.abgelaufen, lang, 410);

    const pdf = await env.EBOOKS.get(produkt.datei);
    if (!pdf) return hinweisSeite(t.fehler, lang, 503);

    notiz.downloads = [...(notiz.downloads || []), jetzt];
    notiz.downloadsLesbar = notiz.downloads.map((d) => new Date(d).toISOString());
    notiz.erstAufrufLesbar = new Date(notiz.erstAufruf).toISOString();
    await env.EBOOKS.put(notizKey, JSON.stringify(notiz, null, 2), { httpMetadata: { contentType: "application/json" } });

    return new Response(pdf.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${produkt.datei}"`,
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (e) {
    return aktion === "download" ? hinweisSeite(t.fehler, lang, 500) : json({ stand: "fehler", text: t.fehler }, 500);
  }
}
