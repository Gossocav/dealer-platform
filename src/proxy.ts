import { NextRequest, NextResponse } from "next/server";

const isProduction = process.env.NODE_ENV === "production";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https://upload.wikimedia.org https://*.supabase.co",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://*.supabase.co https://*.app.github.dev",
  "font-src 'self' data:",
  "form-action 'self'",
].join("; ");

export function proxy(request: NextRequest) {
  void request;
  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  response.headers.set("X-Frame-Options", "DENY");

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
