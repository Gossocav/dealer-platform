import type { MetadataRoute } from "next";
import {
  MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES,
  MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES,
  createMarketplaceSlug,
  getAppBaseUrl,
  logMarketplaceQueryError,
  normalizeVehicleDealerName,
  publicSupabase,
  type MarketplaceDealer,
} from "@/lib/public-marketplace";

// La sitemap si rilegge dal database ogni ora. Non serve che sia istantanea --
// un annuncio pubblicato adesso non finisce comunque su Google nel minuto
// dopo -- e ricalcolarla a ogni passaggio di un crawler significherebbe
// interrogare il database per niente, molte volte al giorno.
export const revalidate = 3600;

// Il protocollo ne ammette 50.000 per file. Oltre servirebbe spezzarla con
// generateSitemaps: il tetto sta qui per non spedire un file che i motori
// scarterebbero in silenzio, ed e' molto sopra il catalogo di oggi.
const MAX_SITEMAP_VEHICLES = 45000;

// Le pagine che esistono sempre, a catalogo vuoto come a catalogo pieno.
// La priorita' non e' una classifica per Google -- e' un suggerimento debole,
// ma dice cosa conta se un giorno il catalogo diventa grande.
const STATIC_ENTRIES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/auto", priority: 0.9, changeFrequency: "daily" },
  { path: "/ricerca", priority: 0.8, changeFrequency: "daily" },
  { path: "/concessionarie", priority: 0.8, changeFrequency: "weekly" },
  { path: "/come-funziona", priority: 0.6, changeFrequency: "monthly" },
  { path: "/per-chi-compra", priority: 0.7, changeFrequency: "monthly" },
  { path: "/per-le-concessionarie", priority: 0.7, changeFrequency: "monthly" },
  { path: "/faq", priority: 0.6, changeFrequency: "monthly" },
  { path: "/registrazione", priority: 0.7, changeFrequency: "monthly" },
  { path: "/registrazione/base", priority: 0.5, changeFrequency: "monthly" },
  { path: "/registrazione/pro", priority: 0.5, changeFrequency: "monthly" },
  { path: "/registrazione/elite", priority: 0.5, changeFrequency: "monthly" },
  { path: "/demo", priority: 0.6, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/termini", priority: 0.2, changeFrequency: "yearly" },
  { path: "/termini-concessionari", priority: 0.2, changeFrequency: "yearly" },
  { path: "/consenso-marketing", priority: 0.2, changeFrequency: "yearly" },
];

type SitemapVehicleRow = {
  id: string;
  updated_at: string | null;
  created_at: string | null;
  dealers: MarketplaceDealer | MarketplaceDealer[] | null;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getAppBaseUrl();
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ENTRIES.map((entry) => ({
    // La home: senza questo la sitemap dichiarava "https://.../" mentre la
    // pagina si dichiarava "https://..." -- lo stesso indirizzo scritto in due
    // modi. Google lo risolve da solo, ma consegnargli due forme di una cosa
    // sola e' il tipo di incoerenza che poi si legge come un errore in
    // Search Console e fa perdere tempo a capirla.
    url: entry.path === "/" ? baseUrl : `${baseUrl}${entry.path}`,
    lastModified: now,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));

  // Gli stessi filtri del catalogo pubblico: quello che la sitemap dichiara e
  // quello che il sito mostra devono essere la stessa cosa, altrimenti si
  // consegnano a Google indirizzi che poi rispondono "non disponibile".
  const { data, error } = await publicSupabase
    .from("vehicles")
    .select("id, updated_at, created_at, dealers!inner(id, name, legal_name, status)")
    .eq("published", true)
    .in("status", MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES)
    .in("dealers.status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES)
    .limit(MAX_SITEMAP_VEHICLES);

  if (error) {
    logMarketplaceQueryError("sitemap", error);
    // Meglio una sitemap con le sole pagine fisse che nessuna sitemap: se il
    // database non risponde, Google riceve comunque l'ossatura del sito
    // invece di un errore che gli farebbe scartare il file.
    return staticEntries;
  }

  const rows = (data ?? []) as unknown as SitemapVehicleRow[];

  const vehicleEntries: MetadataRoute.Sitemap = rows.map((row) => ({
    url: `${baseUrl}/auto/${row.id}`,
    lastModified: new Date(row.updated_at ?? row.created_at ?? now),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // Una concessionaria compare una volta per veicolo pubblicato, e due nomi
  // diversi possono ridursi allo stesso indirizzo: la Map tiene la prima e
  // scarta i doppioni, che in una sitemap sono un difetto segnalato.
  const dealerEntries = new Map<string, MetadataRoute.Sitemap[number]>();

  for (const row of rows) {
    const name = normalizeVehicleDealerName(row.dealers);
    if (name === "Concessionaria") {
      continue;
    }

    const slug = createMarketplaceSlug(name);
    if (dealerEntries.has(slug)) {
      continue;
    }

    dealerEntries.set(slug, {
      url: `${baseUrl}/concessionarie/${slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

  return [...staticEntries, ...vehicleEntries, ...Array.from(dealerEntries.values())];
}
