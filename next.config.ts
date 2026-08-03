import type { NextConfig } from "next";

// Content-Security-Policy is set in src/proxy.ts (Next.js 16's Proxy, formerly
// Middleware), the single source of truth for this header -- it runs after
// this config's headers() and would silently override any value set here,
// which previously left two copies of the same policy string to keep in sync.
const nextConfig: NextConfig = {
  images: {
    // Le foto dei veicoli arrivano dall'archivio Supabase con indirizzi
    // firmati, e quelle importate da listini esterni passano dal nostro
    // proxy. Senza dichiarare l'origine qui, next/image le rifiuta e la
    // scheda resta senza foto.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
    // Le foto delle concessionarie sono scatti da telefono: senza queste
    // misure il browser scarica l'originale da diversi megabyte anche per
    // mostrarlo dentro una scheda larga 300 pixel.
    formats: ["image/avif", "image/webp"],
    // Un giorno di validita' sulle versioni ridimensionate. Gli indirizzi
    // firmati cambiano ogni ora, quindi il guadagno vero e' entro l'ora, ma
    // tenerle piu' a lungo non costa niente.
    minimumCacheTTL: 86400,
  },
};

export default nextConfig;
