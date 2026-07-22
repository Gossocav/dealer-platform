import { NextRequest, NextResponse } from "next/server";

// Local dev and GitHub Codespaces need to reach a local/forwarded Supabase
// instance; production never does. Next.js sets NODE_ENV to "development"
// only for `next dev` and to "production" for every built/deployed run
// (including Vercel), so these origins never ship to real users.
const DEV_ONLY_CONNECT_SRC =
  process.env.NODE_ENV === "production" ? "" : " http://127.0.0.1:54321 ws://127.0.0.1:54321 https://*.app.github.dev wss://*.app.github.dev";

const CONTENT_SECURITY_POLICY = `default-src 'self'; img-src 'self' data: blob: https://upload.wikimedia.org https://*.supabase.co; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co${DEV_ONLY_CONNECT_SRC}; font-src 'self' data:; frame-ancestors 'none';`;

export function proxy(request: NextRequest) {
  void request;
  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);

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
