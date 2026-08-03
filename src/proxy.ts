import { NextRequest, NextResponse } from "next/server";
import { isPrivateAreaPath } from "@/lib/private-areas";

// Local dev and GitHub Codespaces need to reach a local/forwarded Supabase
// instance; production never does. Next.js sets NODE_ENV to "development"
// only for `next dev` and to "production" for every built/deployed run
// (including Vercel), so these origins never ship to real users.
const DEV_ONLY_CONNECT_SRC =
  process.env.NODE_ENV === "production" ? "" : " http://127.0.0.1:54321 ws://127.0.0.1:54321 https://*.app.github.dev wss://*.app.github.dev";

// Le regole di sicurezza vietano qualsiasi codice che non arrivi da noi: e'
// il motivo per cui incollare un pixel di misurazione non avrebbe funzionato,
// e senza accorgersene -- il browser lo blocca in silenzio e i dati non
// arrivano mai.
//
// Il permesso si apre solo se lo strumento e' stato davvero configurato: senza
// identificativo non si carica niente, e allargare le regole "per quando
// servira'" sarebbe una porta lasciata aperta per nessuno.
const MEASUREMENT_CONFIGURED = String(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "").trim().length > 0;

const MEASUREMENT_SCRIPT_SRC = MEASUREMENT_CONFIGURED ? " https://www.googletagmanager.com" : "";
const MEASUREMENT_CONNECT_SRC = MEASUREMENT_CONFIGURED
  ? " https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com"
  : "";
const MEASUREMENT_IMG_SRC = MEASUREMENT_CONFIGURED
  ? " https://www.googletagmanager.com https://*.google-analytics.com"
  : "";

const CONTENT_SECURITY_POLICY = `default-src 'self'; img-src 'self' data: blob: https://upload.wikimedia.org https://*.supabase.co${MEASUREMENT_IMG_SRC}; script-src 'self' 'unsafe-inline' 'unsafe-eval'${MEASUREMENT_SCRIPT_SRC}; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co${MEASUREMENT_CONNECT_SRC}${DEV_ONLY_CONNECT_SRC}; font-src 'self' data:; frame-ancestors 'none';`;

// Standard hardening headers applied to every dynamic response. X-Frame-Options
// duplicates the CSP frame-ancestors directive for older browsers.
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
};

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }

  // Il gestionale risponde 200 a chiunque: senza login mostra solo "Verifica
  // autenticazione...", quindi non espone dati, ma per Google resterebbero
  // decine di pagine vuote e identiche. L'intestazione vale piu' del divieto
  // in robots.txt: quello chiede di non passare, questa dice di non
  // pubblicare anche a chi ci arriva da un link esterno.
  if (isPrivateAreaPath(request.nextUrl.pathname)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  // HSTS only in production: it must never be sent over plain-http local dev,
  // where a browser caching it for localhost would be a persistent nuisance.
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Applica il middleware a tutte le route tranne:
     * - _next/static  (file statici)
     * - _next/image   (ottimizzazione immagini)
     * - favicon.ico
     * - file con estensione (immagini, font, ecc.)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf)$).*)",
  ],
};
