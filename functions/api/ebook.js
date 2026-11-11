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
//
// Englisches Buch über Stripe (seit 11.11.2026):
// - Der Stripe-Zahlungslink leitet auf die Danke-Seite mit ?session_id=cs_… weiter.
// - Der Pförtner fragt Stripe, ob diese Sitzung bezahlt ist (Geheimwert STRIPE_SECRET_KEY,
//   eingeschränkter Schlüssel mit Lesezugriff auf Checkout Sessions). Danach gelten dieselben Regeln.

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
    ohneDaten: "We couldn't find your purchase details on this page.\nEmail us at hello@identity-upgrade.com and we'll send you your e-book.",
    fehler: "Something went wrong just now.\nPlease try again in a moment or email us at hello@identity-upgrade.com.",
  },
};

// Digistore24-Signatur nachbilden (SHA-512 über sortierte „schlüssel=wertPASSWORT“-Paare),
// wie in der offiziellen Funktion digistore_signature(): wahlweise mit Schlüsseln in Großbuchstaben
// und wahlweise mit dekodierten HTML-Zeichen (&amp; usw.).
async function signatur(paare, passwort, grossbuchstaben, htmlDekodieren) {
  const liste = paare
    .filter(([k]) => k !== "sha_sign" && k !== "SHASIGN" && k !== "action" && k !== "notice")
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

// Bei einem Download-Problem zurück auf die Danke-Seite; dort erscheint die Meldung in der Mitte.
function zurueck(url, lang, fehler) {
  const q = new URLSearchParams(url.search);
  q.delete("action");
  q.delete("notice");
  if (fehler) q.set("notice", "error");
  const ziel = `/${lang === "de" ? "de" : "en"}/escape-self-sabotage-l1-thanks/?${q.toString()}`;
  return new Response(null, { status: 303, headers: { Location: ziel, "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
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

// Gemeinsamer Teil: Notiz anlegen, Stand prüfen, PDF ausliefern
async function ausliefern({ url, params, env, aktion, lang, t, produkt, orderId, produktNr }) {
  const jetzt = Date.now();
  const notizKey = `bestellungen/${orderId}.json`;
  const vorhanden = await env.EBOOKS.get(notizKey);
  let notiz = vorhanden ? await vorhanden.json() : null;
  if (!notiz) {
    notiz = { bestellnummer: orderId, produkt: produktNr, erstAufruf: jetzt, downloads: [] };
    await env.EBOOKS.put(notizKey, JSON.stringify(notiz, null, 2), { httpMetadata: { contentType: "application/json" } });
  }

  const s = stand(notiz, jetzt);
  if (aktion !== "download" && params.get("notice") === "error") return json({ stand: "fehler", text: t.fehler });
  if (aktion !== "download") {
    return json({ stand: s, text: s === "abgelaufen" ? t.abgelaufen : "" });
  }
  if (s !== "bereit") return zurueck(url, lang, false);

  const pdf = await env.EBOOKS.get(produkt.datei);
  if (!pdf) return zurueck(url, lang, true);

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
}

// Englisches Buch über Stripe: Sitzung bei Stripe prüfen, dann wie gewohnt ausliefern
async function stripeAbwickeln({ url, params, env, aktion, sessionId }) {
  const lang = "en";
  const t = TEXTE.en;
  const produkt = PRODUKTE["761745"];
  try {
    if (!env.EBOOKS || !env.STRIPE_SECRET_KEY) {
      return aktion === "download" ? zurueck(url, lang, true) : json({ stand: "fehler", text: t.fehler }, 503);
    }
    let grund = "";
    if (!sessionId.startsWith("cs_")) grund = "ungültige Stripe-Sitzung";
    else {
      const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      });
      if (r.status >= 500) throw new Error("Stripe nicht erreichbar");
      if (r.status !== 200) grund = `Stripe-Sitzung unbekannt (${r.status})`;
      else {
        const sitzung = await r.json();
        if (sitzung.payment_status !== "paid") grund = "Stripe-Sitzung nicht bezahlt";
      }
    }
    if (grund) {
      await abweisungNotieren(env, grund, params, sessionId.slice(-24), aktion);
      return aktion === "download" ? zurueck(url, lang, false) : json({ stand: "ungueltig", text: t.ungueltig }, 403);
    }
    return await ausliefern({ url, params, env, aktion, lang, t, produkt, orderId: sessionId, produktNr: "stripe-en" });
  } catch (e) {
    return aktion === "download" ? zurueck(url, lang, true) : json({ stand: "fehler", text: t.fehler }, 500);
  }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const aktion = params.get("action") || "status";
  const sessionId = (params.get("session_id") || "").replace(/[^A-Za-z0-9_]/g, "");
  if (sessionId) return stripeAbwickeln({ url, params, env, aktion, sessionId });
  const produkt = PRODUKTE[params.get("product_id") || ""];
  const lang = produkt ? produkt.lang : (params.get("buyer_language") || params.get("page")) === "de" ? "de" : "en";
  const t = TEXTE[lang];
  const orderId = (params.get("order_id") || "").replace(/[^A-Za-z0-9_-]/g, "");

  try {
    if (!env.EBOOKS || !env.DS24_THANKYOU_KEY) {
      return aktion === "download" ? zurueck(url, lang, true) : json({ stand: "fehler", text: t.fehler }, 503);
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
      return aktion === "download" ? zurueck(url, lang, false) : json({ stand: "ungueltig", text }, 403);
    }

    return await ausliefern({ url, params, env, aktion, lang, t, produkt, orderId, produktNr: params.get("product_id") });
  } catch (e) {
    return aktion === "download" ? zurueck(url, lang, true) : json({ stand: "fehler", text: t.fehler }, 500);
  }
}
