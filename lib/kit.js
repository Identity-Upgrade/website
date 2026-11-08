// Gemeinsame Kit-Anbindung (API v4) für Anmeldungen und Käufer
//
// Warum über die API und nicht über die Kit-Formular-Adresse:
// Kit übernimmt über die Formular-Adresse nur Felder, die im jeweiligen Kit-Formular sauber verknüpft sind.
// Über die API schreiben wir direkt in die Felder, die im Konto wirklich existieren.
// Das Kit-Formular wird danach nur noch genutzt, um die Bestätigungsmail (Double Opt-in) auszulösen.

export const FORMULARE = {
  freebie: { de: "10126010", en: "10126067" },
  waitlist: { de: "10161920", en: "10161924" },
  waitlistBuyer: { de: "10162096", en: "10162099" },
  level1: { de: "10161368", en: "10161703" },
};

// Tags: Warteliste (Buch/Kurse je Sprache) und „größtes Problem“
export const TAGS = {
  waitlist: {
    de: { book: "25592491", course: "25592498" },
    en: { book: "25592492", course: "25592501" },
  },
  problem: { finanzen: "25281528", beziehungen: "25281532", koerper: "25281536", mehrere: "25281544" },
  // Rückgabe oder Rücklastschrift bei Level 1
  refund: { de: "25598408", en: "25598428" },
};

// Wert für das Feld „Problem“ (gleicher Wortlaut wie die Tags)
export const PROBLEM_TEXT = { finanzen: "Money", beziehungen: "Relationship", koerper: "Body", mehrere: "Several" };

const API = "https://api.kit.com/v4";

export function kitKopf(apiKey) {
  return { "Content-Type": "application/json", Accept: "application/json", "X-Kit-Api-Key": apiKey };
}

// Eigene Felder im Konto nachschlagen: interner Schlüssel je Angabe (über Schlüssel oder Anzeigenamen)
export async function feldSchluessel(kopf) {
  let felder = [];
  try {
    const r = await fetch(`${API}/custom_fields?per_page=1000`, { headers: kopf });
    if (r.ok) felder = ((await r.json()).custom_fields || []).map((f) => ({ key: String(f.key || ""), label: String(f.label || "").toLowerCase().trim() }));
  } catch (e) {}
  const suche = (keys, labels) => {
    for (const k of keys) { const f = felder.find((x) => x.key === k); if (f) return f.key; }
    for (const l of labels) { const f = felder.find((x) => x.label === l); if (f) return f.key; }
    return null;
  };
  return {
    nachname: suche(["nachname", "last_name", "lastname"], ["last name", "nachname", "lastname"]),
    telefon: suche(["telephone", "phone_number", "phone", "telefon"], ["phone number", "phone", "telefon", "telefonnummer"]),
    sprache: suche(["language", "sprache"], ["language", "sprache"]),
    problem: suche(["problem"], ["problem"]),
    quelle: suche(["quelle", "source"], ["quelle", "source"]),
    kampagne: suche(["kampagne", "campaign"], ["kampagne", "campaign"]),
    anzahl: felder.length,
  };
}

const kurz = async (r) => { try { return (await r.text()).slice(0, 200); } catch (e) { return ""; } };

// Person eintragen: anlegen (unbestätigt) → Formular (löst Bestätigungsmail aus) → Tags
export async function eintragen(apiKey, { email, vorname, nachname, telefon, sprache, problem, quelle, kampagne, formId, tagIds = [] }) {
  const kopf = kitKopf(apiKey);
  const keys = await feldSchluessel(kopf);
  const fields = {};
  if (nachname && keys.nachname) fields[keys.nachname] = nachname;
  if (telefon && keys.telefon) fields[keys.telefon] = telefon;
  if (sprache && keys.sprache) fields[keys.sprache] = sprache;
  if (problem && keys.problem) fields[keys.problem] = problem;
  if (quelle && keys.quelle) fields[keys.quelle] = quelle;
  if (kampagne && keys.kampagne) fields[keys.kampagne] = kampagne;

  const anlegen = { email_address: email, state: "inactive" };
  if (vorname) anlegen.first_name = vorname;
  if (Object.keys(fields).length) anlegen.fields = fields;

  const ergebnis = {
    felderImKonto: keys.anzahl,
    feld: { nachname: keys.nachname, telefon: keys.telefon, sprache: keys.sprache, problem: keys.problem, quelle: keys.quelle, kampagne: keys.kampagne },
    geschickt: { vorname: !!vorname, nachname: !!nachname, telefon: !!telefon, sprache: sprache || null },
  };

  const r1 = await fetch(`${API}/subscribers`, { method: "POST", headers: kopf, body: JSON.stringify(anlegen) });
  ergebnis.anlegen = r1.status;
  if (r1.status >= 400) ergebnis.anlegenMeldung = await kurz(r1);

  const r2 = await fetch(`${API}/forms/${formId}/subscribers`, { method: "POST", headers: kopf, body: JSON.stringify({ email_address: email }) });
  ergebnis.formular = r2.status;
  if (r2.status >= 400) ergebnis.formularMeldung = await kurz(r2);

  ergebnis.tags = {};
  for (const id of tagIds) {
    const r3 = await fetch(`${API}/tags/${id}/subscribers`, { method: "POST", headers: kopf, body: JSON.stringify({ email_address: email }) });
    ergebnis.tags[id] = r3.status;
  }
  ergebnis.ok = r1.status < 300 && r2.status < 300 && Object.values(ergebnis.tags).every((s) => s < 300);
  return ergebnis;
}

// Protokoll in R2 (ohne E-Mail, ohne Namen, ohne Telefonnummer)
export async function protokoll(env, ordner, eintrag) {
  try {
    if (!env.EBOOKS) return;
    const zeit = new Date().toISOString();
    await env.EBOOKS.put(`${ordner}/${zeit.replace(/[:.]/g, "-")}.json`, JSON.stringify({ zeit, ...eintrag }, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });
  } catch (e) {}
}

// Bestehenden Kontakt markieren (ohne Formular, also ohne Bestätigungsmail).
// Gibt es den Kontakt noch nicht, wird er unbestätigt angelegt, damit der Tag gesetzt werden kann.
export async function markieren(apiKey, email, tagId) {
  const kopf = kitKopf(apiKey);
  let r = await fetch(`${API}/tags/${tagId}/subscribers`, { method: "POST", headers: kopf, body: JSON.stringify({ email_address: email }) });
  const ergebnis = { tag: r.status };
  if (r.status === 404 || r.status === 422) {
    const a = await fetch(`${API}/subscribers`, { method: "POST", headers: kopf, body: JSON.stringify({ email_address: email, state: "inactive" }) });
    ergebnis.angelegt = a.status;
    r = await fetch(`${API}/tags/${tagId}/subscribers`, { method: "POST", headers: kopf, body: JSON.stringify({ email_address: email }) });
    ergebnis.tag = r.status;
  }
  if (ergebnis.tag >= 400) ergebnis.meldung = await kurz(r);
  ergebnis.ok = ergebnis.tag < 300;
  return ergebnis;
}
