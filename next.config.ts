import type { NextConfig } from "next";

// Content-Security-Policy is set in src/proxy.ts (Next.js 16's Proxy, formerly
// Middleware), the single source of truth for this header -- it runs after
// this config's headers() and would silently override any value set here,
// which previously left two copies of the same policy string to keep in sync.
const nextConfig: NextConfig = {
  images: {
    // Le foto non le ridimensiona piu' Vercel, le ridimensioniamo noi.
    //
    // Il servizio di Vercel e' a consumo: il 04/09/2026 il pacchetto compreso
    // nel piano si e' esaurito e ogni foto del sito ha smesso di comparire --
    // "Payment required" al posto dell'immagine, su tutte le pagine
    // pubbliche. E non era passeggero: una sola visita alla pagina di una
    // concessionaria con 235 auto consuma centinaia di ridimensionamenti.
    //
    // "image-loader.ts" incammina ogni foto su /api/image-proxy, che sta sul
    // nostro server e non ha nessun tetto da esaurire. Con un caricatore
    // nostro il ridimensionatore di Next non entra piu' in gioco: per questo
    // qui non ci sono piu' "localPatterns", "remotePatterns", "formats" e
    // "minimumCacheTTL", che valevano soltanto per quello.
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
  },
};

export default nextConfig;
