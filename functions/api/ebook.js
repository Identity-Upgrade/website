// Pförtner für das E-Book „Escape Self-Sabotage – Stockwerk 1“
//
// Ablauf:
// 1. Digistore24 leitet nach dem Kauf auf die Danke-Seite weiter und hängt die Bestelldaten
//    samt digitaler Unterschrift (sha_sign, erzeugt mit dem Danke-Seiten-Schlüssel) an.
// 2. Die Danke-Seite fragt hier den Stand ab (?aktion=status) und zeigt den Download-Button.
// 3. Der Download (?aktion=download) liefert das PDF aus dem R2-Lagerraum aus.
//
// Regeln (festgelegt mit Heike, 07.11.2026):
// - Gültig 30 Tage ab dem ersten Aufruf der Danke-Seite, solange noch nicht heruntergeladen wurde.
// - Nach dem ersten Download bleiben 15 Minuten Nachfrist, danach ist die Bestellung gesperrt.
// - Pro Bestellung liegt eine Notiz im Lagerraum: bestellungen/<Bestellnummer>.json
//   (nur Bestellnummer, Produkt und Zeitpunkte – keine E-Mail-Adresse).
// - Freischalten im Einzelfall: Notiz im Lagerraum löschen.
//
// Benötigt in Cloudflare (Production und Preview):
// - R2-Bindung EBOOKS → identity-upgrade-ebooks
// - Geheimwert DS24_THANKYOU_KEY = Danke-Seiten-Schlüssel aus Digistore24

const GUELTIG_MS = 30 * 24 * 60 * 60 * 1000;
const NACHFRIST_MS = 15 * 60 * 1000;

const PRODUKTE = {
  "761708": { datei: "Escape-Self-Sabotage_DE_L1.pdf", lang: "de" },
  "761745": { datei: "Escape-Self-Sabotage_EN_L1.pdf", lang: "en" },
};

const TEXTE = {
  de: {
    abgelaufen: "Dieser Download-Link ist abgelaufen. Schreib uns an hello@identity-upgrade.com, wir helfen dir weiter.",
    ungueltig: "Wir konnten deinen Kauf nicht bestätigen. Schreib uns an hello@identity-upgrade.com, wir helfen dir weiter.",
    fehler: "Gerade ist etwas schiefgelaufen. Bitte versuch es gleich noch einmal oder schreib uns an hello@identity-upgrade.com.",
  },
  en: {
    abgelaufen: "This download link has expired. Email us at hello@identity-upgrade.com and we'll help you out.",
    ungueltig: "We couldn't confirm your purchase. Email us at hello@identity-upgrade.com and we'll help you out.",
    fehler: "Something went wrong just now. Please try again in a moment or email us at hello@identity-upgrade.com.",
  },
};

// Digistore24-Signatur nachbilden (SHA-512 über sortierte „schlüssel=wertPASSWORT“-Paare).
async function signatur(params, passwort, grossbuchstaben) {
  const keys = [...params.keys()].filter((k) => k !== "sha_sign" && k !== "SHASIGN" && k !== "aktion");
  const sortKey = (k) => (grossbuchstaben ? k.toUpperCase() : k);
  keys.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));
  let s = "";
  for (const k of keys) {
    const v = params.get(k);
    if (v === null || v === "") continue;
    s += `${grossbuchstaben ? k.toUpperCase() : k}=${v}${passwort}`;
  }
  const hash = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(s));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function gleich(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function unterschriftGueltig(params, passwort) {
  const sha = (params.get("sha_sign") || params.get("SHASIGN") || "").toUpperCase();
  if (!sha || !passwort) return false;
  for (const gross of [false, true]) {
    if (gleich(await signatur(params, passwort, gross), sha)) return true;
  }
  return false;
}

function json(daten, status = 200) {
  return new Response(JSON.stringify(daten), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}

function hinweisSeite(text, lang, status) {
  const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Identity Upgrade</title><link rel="stylesheet" href="/assets/css/site.css"></head><body class="startseite"><main class="start-flaeche"><p style="color:#fff;font-size:20px;line-height:1.5;max-width:560px;text-align:center;margin:0">${text}</p></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}

// Stand einer Bestellung berechnen
function stand(notiz, jetzt) {
  const downloads = notiz.downloads || [];
  if (downloads.length === 0) {
    return jetzt - notiz.erstAufruf <= GUELTIG_MS ? "bereit" : "abgelaufen";
  }
  return jetzt - downloads[0] <= NACHFRIST_MS ? "bereit" : "abgelaufen";
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const aktion = params.get("aktion") || "status";
  const produkt = PRODUKTE[params.get("product_id") || ""];
  const lang = produkt ? produkt.lang : params.get("buyer_language") === "de" ? "de" : "en";
  const t = TEXTE[lang];
  const orderId = (params.get("order_id") || "").replace(/[^A-Za-z0-9_-]/g, "");

  try {
    if (!env.EBOOKS || !env.DS24_THANKYOU_KEY) {
      return aktion === "download" ? hinweisSeite(t.fehler, lang, 503) : json({ stand: "fehler", text: t.fehler }, 503);
    }
    if (!produkt || !orderId || !(await unterschriftGueltig(params, env.DS24_THANKYOU_KEY))) {
      return aktion === "download" ? hinweisSeite(t.ungueltig, lang, 403) : json({ stand: "ungueltig", text: t.ungueltig }, 403);
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
