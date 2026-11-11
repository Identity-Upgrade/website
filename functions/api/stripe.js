// Empfänger für Stripe-Benachrichtigungen (Webhook) – englisches Buch „Escape Self-Sabotage – Level 1“
//
// Ablauf:
// 1. Stripe schickt nach einem Kauf, einer Erstattung oder einer Rückbuchung eine Benachrichtigung an /api/stripe.
// 2. Wir prüfen die digitale Unterschrift (Kopfzeile Stripe-Signature, HMAC-SHA256 mit dem Webhook-Geheimwert).
// 3. Kauf bezahlt → Käufer in das Kit-Formular „Käufer Level 1 EN“ eintragen.
//    Kit schickt danach die Bestätigungsmail (Double Opt-in ist im Formular eingeschaltet).
// 4. Ist eine Zustimmung gespeichert (client_reference_id), wird sie mit der Bestellung verknüpft.
// 5. Erstattung oder Rückbuchung → Kontakt in Kit mit dem Refund-Tag (EN) markieren.
//
// Benötigt in Cloudflare (Production und Preview):
// - Geheimwert STRIPE_WEBHOOK_SECRET = Signaturgeheimnis des Webhooks (whsec_…)
// - Geheimwert STRIPE_SECRET_KEY = eingeschränkter Schlüssel (Checkout Sessions: Lesen)
// - Geheimwert KIT_API_KEY = API-Schlüssel (v4) aus Kit
// - R2-Bindung EBOOKS (Protokoll unter stripe-protokoll/, ohne Kundendaten)

import { FORMULARE, TAGS, eintragen, markieren, protokoll } from "../../lib/kit.js";

const TOLERANZ_S = 5 * 60;

function gleich(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function unterschriftGueltig(kopfzeile, roh, geheim) {
  if (!kopfzeile || !geheim) return false;
  let t = "";
  const v1 = [];
  for (const teil of kopfzeile.split(",")) {
    const [k, v] = teil.split("=");
    if (k === "t") t = v;
    if (k === "v1" && v) v1.push(v);
  }
  if (!t || !v1.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > TOLERANZ_S) return false;
  const schluessel = await crypto.subtle.importKey("raw", new TextEncoder().encode(geheim), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", schluessel, new TextEncoder().encode(`${t}.${roh}`));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return v1.some((s) => gleich(s, hex));
}

function antwort(daten, status = 200) {
  return new Response(JSON.stringify(daten), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function namenTeilen(name) {
  const teile = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!teile.length) return { vorname: "", nachname: "" };
  return { vorname: teile[0], nachname: teile.slice(1).join(" ") };
}

// E-Mail zu einer Zahlung finden (für Erstattung und Rückbuchung)
async function emailZurZahlung(env, paymentIntent, ersatz) {
  if (ersatz) return ersatz;
  if (!paymentIntent || !env.STRIPE_SECRET_KEY) return "";
  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions?payment_intent=${encodeURIComponent(paymentIntent)}&limit=1`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  if (r.status !== 200) return "";
  const d = await r.json();
  const s = (d.data || [])[0];
  return (s && ((s.customer_details && s.customer_details.email) || s.customer_email)) || "";
}

// Gespeicherte Zustimmung (aus /api/zustimmung) mit der Bestellung verknüpfen
async function zustimmungVerknuepfen(env, sitzung) {
  try {
    const id = String(sitzung.client_reference_id || "").replace(/[^A-Za-z0-9]/g, "");
    if (!id || !env.EBOOKS) return "ohne Kennung";
    const key = `zustimmungen/${id}.json`;
    const obj = await env.EBOOKS.get(key);
    if (!obj) return "Kennung nicht gefunden";
    const notiz = await obj.json();
    notiz.bestellung = {
      stripeSitzung: sitzung.id || null,
      zahlung: sitzung.payment_intent || null,
      bezahltUm: new Date((sitzung.created || Date.now() / 1000) * 1000).toISOString(),
    };
    await env.EBOOKS.put(key, JSON.stringify(notiz, null, 2), { httpMetadata: { contentType: "application/json" } });
    return "verknüpft";
  } catch (e) {
    return "Fehler";
  }
}

export async function onRequestPost({ request, env }) {
  const roh = await request.text();
  if (!(await unterschriftGueltig(request.headers.get("Stripe-Signature"), roh, env.STRIPE_WEBHOOK_SECRET))) {
    await protokoll(env, "stripe-protokoll", { ergebnis: "Unterschrift passt nicht" });
    return antwort({ ok: false }, 400);
  }

  let ereignis;
  try { ereignis = JSON.parse(roh); } catch (e) { return antwort({ ok: false }, 400); }
  const typ = ereignis.type;
  const obj = (ereignis.data && ereignis.data.object) || {};
  const eintrag = { ereignis: typ, id: ereignis.id, livemode: !!ereignis.livemode };

  try {
    if (!env.KIT_API_KEY) throw new Error("KIT_API_KEY fehlt");

    if (typ === "checkout.session.completed" || typ === "checkout.session.async_payment_succeeded") {
      if (obj.payment_status !== "paid") {
        eintrag.ergebnis = "noch nicht bezahlt";
      } else {
        const email = (obj.customer_details && obj.customer_details.email) || obj.customer_email || "";
        if (!email) eintrag.ergebnis = "ohne E-Mail";
        else {
          const { vorname, nachname } = namenTeilen(obj.customer_details && obj.customer_details.name);
          const kit = await eintragen(env.KIT_API_KEY, { email, vorname, nachname, sprache: "en", quelle: "stripe", formId: FORMULARE.level1.en });
          eintrag.ergebnis = kit.ok ? "in Kit eingetragen" : "Kit-Fehler";
          eintrag.kit = { anlegen: kit.anlegen, formular: kit.formular, meldung: kit.anlegenMeldung || kit.formularMeldung };
        }
        eintrag.zustimmung = await zustimmungVerknuepfen(env, obj);
      }
    } else if (typ === "charge.refunded" || typ === "charge.dispute.created") {
      const paymentIntent = obj.payment_intent;
      const email = await emailZurZahlung(env, paymentIntent, obj.billing_details && obj.billing_details.email);
      if (!email) eintrag.ergebnis = "E-Mail nicht gefunden";
      else {
        const kit = await markieren(env.KIT_API_KEY, email, TAGS.refund.en);
        eintrag.ergebnis = kit.ok ? "Refund-Tag gesetzt" : "Kit-Fehler";
        eintrag.kit = { tag: kit.tag, meldung: kit.meldung };
      }
    } else {
      eintrag.ergebnis = "ignoriert";
    }
  } catch (e) {
    eintrag.ergebnis = "Fehler";
    eintrag.fehler = String(e && e.message || e).slice(0, 200);
    await protokoll(env, "stripe-protokoll", eintrag);
    return antwort({ ok: false }, 500);
  }

  await protokoll(env, "stripe-protokoll", eintrag);
  return antwort({ ok: true });
}

export async function onRequestGet() {
  return antwort({ ok: true, hinweis: "Stripe-Empfänger bereit" });
}
