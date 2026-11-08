// Empfänger für Kauf-Benachrichtigungen (IPN) von Digistore24
//
// Ablauf:
// 1. Digistore24 schickt nach einem Kauf eine Benachrichtigung an /api/purchase –
//    eingestellt so, dass sie nur kommt, wenn der Käufer das Newsletter-Häkchen gesetzt hat.
// 2. Wir prüfen die digitale Unterschrift (sha_sign, erzeugt mit dem IPN-Passwort).
// 3. Wir tragen den Käufer in das passende Kit-Formular „Käufer Level 1“ (DE/EN) ein.
//    Kit schickt danach die Bestätigungsmail (Double Opt-in ist im Formular eingeschaltet).
//
// Der Anbieter (Digistore24) steckt nur in diesem Empfänger. Bei einem Wechsel wird nur er angepasst,
// an Kit ändert sich nichts.
//
// Benötigt in Cloudflare (Production und Preview):
// - Geheimwert DS24_IPN_KEY = IPN-Passwort aus Digistore24
// - Geheimwert KIT_API_KEY = API-Schlüssel (v4) aus Kit
// - R2-Bindung EBOOKS (Protokoll unter ipn-protokoll/, ohne Kundendaten)

import { FORMULARE, eintragen } from "../../lib/kit.js";

const PRODUKTE = {
  "761708": { lang: "de", kitForm: "10161368" },
  "761745": { lang: "en", kitForm: "10161703" },
};

function htmlDekodiert(v) {
  return v
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// Digistore24-Signatur nachbilden (wie digistore_signature(): sortierte „schlüssel=wertPASSWORT“-Paare, SHA-512)
async function signatur(paare, passwort, grossbuchstaben, htmlDekodieren) {
  const liste = paare
    .filter(([k]) => k !== "sha_sign" && k !== "SHASIGN")
    .map(([k, v]) => [grossbuchstaben ? k.toUpperCase() : k, v]);
  liste.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  let s = "";
  for (const [k, roh] of liste) {
    if (roh === null || roh === undefined || roh === "") continue;
    s += `${k}=${htmlDekodieren ? htmlDekodiert(roh) : roh}${passwort}`;
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
  const paare = [...params.entries()];
  for (const gross of [false, true]) {
    for (const html of [false, true]) {
      if (gleich(await signatur(paare, passwort, gross, html), sha)) return true;
    }
  }
  return false;
}

const antwort = (text, status = 200) =>
  new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });

// Protokoll pro Benachrichtigung (ohne E-Mail, ohne Namen)
async function notieren(env, ergebnis, params, extra = {}) {
  try {
    if (!env.EBOOKS) return;
    const zeit = new Date().toISOString();
    const bestellnummer = (params.get("order_id") || "ohne").replace(/[^A-Za-z0-9_-]/g, "");
    await env.EBOOKS.put(`ipn-protokoll/${zeit.replace(/[:.]/g, "-")}-${bestellnummer}.json`, JSON.stringify({ zeit, ergebnis, bestellnummer, produkt: params.get("product_id") || null, ereignis: params.get("event") || null, ...extra }, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });
  } catch (e) {}
}

export async function onRequestPost({ request, env }) {
  let params;
  try {
    params = new URLSearchParams(await request.text());
  } catch (e) {
    return antwort("ERROR: unreadable", 400);
  }

  if (!(await unterschriftGueltig(params, env.DS24_IPN_KEY))) {
    await notieren(env, "Unterschrift passt nicht", params);
    return antwort("ERROR: invalid sha signature", 403);
  }

  const ereignis = params.get("event") || "";
  // Verbindungstest aus Digistore24
  if (ereignis === "connection_test") { await notieren(env, "Verbindungstest", params); return antwort("OK"); }
  // Nur bei Zahlung eintragen; alle anderen Ereignisse (Rückgabe, Rückbuchung …) bestätigen wir nur
  if (ereignis !== "on_payment") { await notieren(env, "anderes Ereignis, nichts zu tun", params); return antwort("OK"); }

  const produkt = PRODUKTE[params.get("product_id") || ""];
  const email = (params.get("email") || "").trim();
  if (!produkt || !email) {
    await notieren(env, !produkt ? "unbekanntes Produkt" : "ohne E-Mail", params);
    return antwort("OK");
  }

  const vorname = params.get("address_first_name") || params.get("first_name") || "";
  const nachname = params.get("address_last_name") || params.get("last_name") || "";

  if (!env.KIT_API_KEY) {
    await notieren(env, "KIT_API_KEY fehlt in Cloudflare", params);
    return antwort("OK");
  }
  try {
    const kit = await eintragen(env.KIT_API_KEY, { email, vorname, nachname, sprache: produkt.lang, quelle: "digistore24", formId: produkt.kitForm });
    await notieren(env, kit.ok ? "in Kit eingetragen" : "Kit hat abgelehnt", params, { kit });
  } catch (e) {
    await notieren(env, "Kit nicht erreichbar", params);
  }

  // Digistore24 erwartet „OK“, sonst wiederholt es die Benachrichtigung
  return antwort("OK");
}

// Prüfseite: /api/purchase?check=1 zeigt, ob Code, Geheimwerte und R2 bereit sind (ohne Geheimnisse zu verraten)
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.searchParams.get("check") !== "1") return antwort("OK");
  let r2 = "keine Bindung";
  if (env.EBOOKS) {
    try {
      await env.EBOOKS.put("ipn-protokoll/check.json", JSON.stringify({ zeit: new Date().toISOString(), ergebnis: "Prüfseite aufgerufen" }), { httpMetadata: { contentType: "application/json" } });
      r2 = "ok";
    } catch (e) {
      r2 = "Fehler: " + String((e && e.message) || e).slice(0, 120);
    }
  }
  return antwort(`version 2 · IPN-Passwort: ${env.DS24_IPN_KEY ? "ja" : "nein"} · Kit-Schlüssel: ${env.KIT_API_KEY ? "ja" : "nein"} · R2 schreiben: ${r2}`);
}
