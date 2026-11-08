// Anmeldungen von der Website (Freebie und Warteliste) → Kit
//
// Das Formular auf der Website schickt hierher. Wir tragen die Person über die Kit-API ein
// (Felder, Sprache, Tags) und lösen über das Kit-Formular die Bestätigungsmail aus.
// Danach geht es auf die passende Danke-Seite.
//
// Benötigt in Cloudflare: Geheimwert KIT_API_KEY, R2-Bindung EBOOKS (Protokoll unter anmeldung-protokoll/)

import { FORMULARE, TAGS, PROBLEM_TEXT, eintragen, protokoll } from "../../lib/kit.js";

const ZIEL = {
  freebie: { de: "/de/escape-self-sabotage-r1-thanks/", en: "/en/escape-self-sabotage-r1-thanks/" },
  waitlist: { de: "/de/waitlist/?subscribed=1", en: "/en/waitlist/?subscribed=1" },
};
const ZURUECK = {
  freebie: { de: "/de/escape-self-sabotage-r1/?error=1#signup", en: "/en/escape-self-sabotage-r1/?error=1#signup" },
  waitlist: { de: "/de/waitlist/?error=1#signup", en: "/en/waitlist/?error=1#signup" },
};

const weiter = (pfad) => new Response(null, { status: 303, headers: { Location: pfad, "Cache-Control": "no-store" } });
const sauber = (v, max = 120) => String(v || "").trim().slice(0, max);

export async function onRequestPost({ request, env }) {
  let p;
  try {
    p = new URLSearchParams(await request.text());
  } catch (e) {
    return weiter("/");
  }

  const art = p.get("form") === "waitlist" ? "waitlist" : p.get("form") === "freebie" ? "freebie" : null;
  const lang = p.get("lang") === "en" ? "en" : "de";
  if (!art) return weiter("/");

  // Spamschutz: verstecktes Feld muss leer bleiben
  if (p.get("website")) return weiter(ZIEL[art][lang]);

  const email = sauber(p.get("email_address"), 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return weiter(ZURUECK[art][lang]);

  const kaeufer = art === "waitlist" && p.get("buyer") === "1";
  const formId = art === "waitlist" ? (kaeufer ? FORMULARE.waitlistBuyer[lang] : FORMULARE.waitlist[lang]) : FORMULARE.freebie[lang];

  // Tags nur aus fester Liste (keine beliebigen Tags von außen)
  const tagIds = [];
  const problem = p.get("problem");
  if (problem && TAGS.problem[problem]) tagIds.push(TAGS.problem[problem]);
  if (art === "waitlist") {
    for (const k of p.getAll("interest")) if (TAGS.waitlist[lang][k] && !tagIds.includes(TAGS.waitlist[lang][k])) tagIds.push(TAGS.waitlist[lang][k]);
  }

  if (!env.KIT_API_KEY) {
    await protokoll(env, "anmeldung-protokoll", { art, lang, ergebnis: "KIT_API_KEY fehlt" });
    return weiter(ZURUECK[art][lang]);
  }

  try {
    const e = await eintragen(env.KIT_API_KEY, {
      email,
      vorname: sauber(p.get("first_name")),
      nachname: sauber(p.get("last_name")),
      telefon: sauber(p.get("phone"), 40),
      sprache: lang,
      problem: PROBLEM_TEXT[problem] || "",
      quelle: sauber(p.get("source")),
      kampagne: sauber(p.get("campaign")),
      formId,
      tagIds,
    });
    await protokoll(env, "anmeldung-protokoll", { art, lang, kaeufer, formular: formId, problem: problem || null, ...e });
    return weiter(e.formular < 300 ? ZIEL[art][lang] : ZURUECK[art][lang]);
  } catch (err) {
    await protokoll(env, "anmeldung-protokoll", { art, lang, ergebnis: "Kit nicht erreichbar" });
    return weiter(ZURUECK[art][lang]);
  }
}

export async function onRequestGet() {
  return weiter("/");
}
