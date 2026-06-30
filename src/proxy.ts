import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  void request;
  const response = NextResponse.next();
  const imgSrcPolicy = "img-src 'self' data: blob: https://upload.wikimedia.org https://*.supabase.co";
  const existingPolicy = response.headers.get("Content-Security-Policy");

  if (!existingPolicy) {
    response.headers.set("Content-Security-Policy", imgSrcPolicy);
  } else if (!existingPolicy.includes("img-src")) {
    response.headers.set("Content-Security-Policy", `${existingPolicy}; ${imgSrcPolicy}`);
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
