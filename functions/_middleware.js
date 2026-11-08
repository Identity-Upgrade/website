// Weiterleitung von der Cloudflare-Adresse auf die eigene Domain
//
// identity-upgrade.pages.dev zeigt dieselben Inhalte wie identity-upgrade.com.
// Damit Google keine doppelten Seiten findet, leiten wir dauerhaft (301) auf die Domain um.
// Vorschau-Adressen (z. B. vorschau-aktuell.identity-upgrade.pages.dev) bleiben erreichbar,
// werden aber für Suchmaschinen gesperrt.

const PAGES_DEV = "identity-upgrade.pages.dev";
const DOMAIN = "https://identity-upgrade.com";

export async function onRequest({ request, next }) {
  const url = new URL(request.url);

  if (url.hostname === PAGES_DEV) {
    return new Response(null, { status: 301, headers: { Location: DOMAIN + url.pathname + url.search } });
  }

  const antwort = await next();
  if (url.hostname.endsWith("." + PAGES_DEV)) {
    const kopie = new Response(antwort.body, antwort);
    kopie.headers.set("X-Robots-Tag", "noindex, nofollow");
    return kopie;
  }
  return antwort;
}
