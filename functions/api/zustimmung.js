// Zustimmung vor dem Stripe-Checkout (englisches Buch) speichern – als Nachweis im Streitfall
//
// Ablauf:
// 1. Der Käufer setzt im Fenster „One last step“ das Häkchen und klickt „Continue to checkout“.
// 2. Die Seite schickt hierher eine zufällige Kennung, die Sprache und den genauen Wortlaut des Häkchentextes.
// 3. Wir legen im Lagerraum die Notiz zustimmungen/<Kennung>.json an (Zeitpunkt, Sprache, Wortlaut, Seite).
//    Keine E-Mail-Adresse, kein Name, keine IP-Adresse.
// 4. Dieselbe Kennung geht als client_reference_id an Stripe. Nach dem Kauf ergänzt /api/stripe die Notiz
//    um die Stripe-Bestellnummer, den Zahlungsvorgang und den Zeitpunkt der Zahlung.
//
// Benötigt: R2-Bindung EBOOKS

export async function onRequestPost({ request, env }) {
  try {
    const d = await request.json();
    const id = String(d.id || "");
    const text = String(d.text || "").replace(/\s+/g, " ").trim();
    if (!/^[A-Za-z0-9]{16,64}$/.test(id) || !text || text.length > 600 || !env.EBOOKS) return new Response(null, { status: 400 });
    const key = `zustimmungen/${id}.json`;
    if (await env.EBOOKS.head(key)) return new Response(null, { status: 204 });
    const zeit = new Date().toISOString();
    const notiz = {
      kennung: id,
      zeitpunkt: zeit,
      sprache: d.lang === "de" ? "de" : "en",
      seite: String(d.seite || "").slice(0, 200),
      wortlaut: text,
    };
    await env.EBOOKS.put(key, JSON.stringify(notiz, null, 2), { httpMetadata: { contentType: "application/json" } });
    return new Response(null, { status: 204 });
  } catch (e) {
    return new Response(null, { status: 400 });
  }
}
