import type { NextConfig } from "next";

// Content-Security-Policy is set in src/proxy.ts (Next.js 16's Proxy, formerly
// Middleware), the single source of truth for this header -- it runs after
// this config's headers() and would silently override any value set here,
// which previously left two copies of the same policy string to keep in sync.
const nextConfig: NextConfig = {
  images: {
    // Next.js 16 ha smesso di ottimizzare le immagini locali il cui indirizzo
    // porta una parte interrogativa, a meno che non sia dichiarata qui: non
    // le salta, solleva un errore mentre disegna la pagina.
    //
    // Le foto importate dai siti delle concessionarie passano tutte da
    // /api/image-proxy?url=..., che una parte interrogativa ce l'ha per
    // costruzione. Senza questa dichiarazione la scheda di un veicolo
    // importato rispondeva 500, e la compilazione del sito falliva sulla
    // pagina delle concessionarie appena una di quelle auto veniva
    // pubblicata.
    localPatterns: [
      // Il valore di "search" si omette per necessita': l'indirizzo della
      // foto cambia a ogni veicolo, un valore fisso non esiste. Il controllo
      // vero non sta qui ma dentro il proxy, che rifiuta gli indirizzi
      // interni, limita dimensione e reindirizzamenti.
      { pathname: "/api/image-proxy" },
      // Dichiarare "localPatterns" ribalta la regola: da "tutto permesso" a
      // "solo cio' che e' elencato". Questa riga tiene ammesso tutto il resto
      // delle immagini locali com'era prima, senza parte interrogativa.
      { pathname: "/**", search: "" },
    ],
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
