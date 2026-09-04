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

  // La libreria che rimpicciolisce le foto va copiata a mano nella funzione
  // pubblicata, altrimenti non ci arriva.
  //
  // Il difetto, misurato in produzione il 04/09/2026: la stessa foto chiesta a
  // 384 e a 3840 pixel tornava identica, 197 KB in tutti i casi. Sulla pagina
  // con ventiquattro schede sono quasi 5 MB invece di 410 KB.
  //
  // Perche' succedeva. Sharp e' fatto di due pezzi: un piccolo binario e la
  // libreria vera, `libvips-cpp.so.8.18.6`, diciotto megabyte dentro il
  // pacchetto `@img/sharp-libvips-linux-x64`. Il tracciamento di Next segue le
  // dipendenze **del codice JavaScript** e copia il primo pezzo, ma non sa
  // leggere dentro un binario nativo: la libreria che quel binario pretende --
  // `readelf` la mostra come NEEDED, cercata in `$ORIGIN/../../
  // sharp-libvips-linux-x64/lib` -- restava fuori, e quella cartella arrivava
  // vuota sul server. In locale invece c'e', ed e' per questo che qui si
  // rimpiccioliva e in produzione no: il difetto era invisibile dalla
  // macchina di chi lo scriveva.
  //
  // L'errore che ne usciva -- "libvips-cpp.so.8.18.6: cannot open shared
  // object file: No such file or directory" -- veniva classificato
  // "modulo-assente" e la foto consegnata intera, che e' il comportamento
  // giusto: meglio pesante che assente. Ma sempre, su ogni foto.
  //
  // La chiave e' il percorso della rotta, il valore un elenco di file presi
  // dalla radice del progetto: e' l'unico modo previsto da Next per
  // aggiungere file che il tracciamento non puo' dedurre da solo.
  outputFileTracingIncludes: {
    "/api/image-proxy": ["./node_modules/@img/sharp-libvips-linux-x64/**/*"],
  },
};

export default nextConfig;
