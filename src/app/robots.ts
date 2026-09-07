import type { MetadataRoute } from "next";
import { getAppBaseUrl } from "@/lib/public-marketplace";
import { PRIVATE_AREA_PREFIXES, PUBLIC_API_PREFIXES } from "@/lib/private-areas";

// Senza questo file /robots.txt rispondeva 404. Un 404 non blocca Google --
// in assenza di regole assume di poter entrare ovunque -- ma lasciava fuori
// la cosa che serve davvero: l'indirizzo della sitemap, che e' come un motore
// di ricerca scopre le pagine senza doverle inseguire link per link.
export default function robots(): MetadataRoute.Robots {
  const baseUrl = getAppBaseUrl();

  return {
    rules: {
      userAgent: "*",
      // Il permesso esplicito sul proxy delle fotografie vince sul divieto
      // generale che copre "/api/": davanti a due regole che si contraddicono
      // i motori seguono la piu' lunga, e "/api/image-proxy" e' piu' lungo di
      // "/api/". Senza questa riga il divieto si sarebbe portato dietro ogni
      // fotografia del sito pubblico.
      allow: ["/", ...PUBLIC_API_PREFIXES],
      // Il gestionale non ha niente da offrire a chi cerca un'auto.
      disallow: PRIVATE_AREA_PREFIXES.map((prefix) => `${prefix}/`),
    },
    // Niente direttiva "Host": non fa parte dello standard, Google la ignora,
    // e l'unico motore che la legge si aspetta un nome di dominio, non un
    // indirizzo completo come quello che avremmo qui.
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
