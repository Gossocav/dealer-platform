import type { MetadataRoute } from "next";
import { caricaTutto } from "@/lib/carica-tutto";
import {
  MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES,
  MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES,
  createMarketplaceSlug,
  getAppBaseUrl,
  logMarketplaceQueryError,
  logMarketplaceTruncatedList,
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

/**
 * La data di una riga, o l'ora corrente se il database non ne ha una buona.
 *
 * Serve perche' `new Date("qualcosa di storto")` non fallisce: restituisce una
 * data non valida, che finirebbe nella sitemap come testo illeggibile e
 * renderebbe scartabile l'intero file. E serve al confronto fra date delle
 * concessionarie, dove una data non valida non e' ne' maggiore ne' minore di
 * nessun'altra e il massimo si fermerebbe alla prima riga.
 */
function dataDellaRiga(row: { updated_at: string | null; created_at: string | null }, ripiego: Date) {
  const grezza = row.updated_at ?? row.created_at;
  if (!grezza) {
    return ripiego;
  }

  const data = new Date(grezza);
  return Number.isNaN(data.getTime()) ? ripiego : data;
}

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
    // Nessuna data: qui c'era l'ora della compilazione, e voleva dire che a
    // ogni rilascio -- cinque, il 5 settembre -- la home, la privacy e i
    // termini dichiaravano a Google di essere cambiati. Non era vero, e una
    // data falsa non resta un problema locale: Google impara a non fidarsi
    // della data su *tutta* la sitemap, comprese le schede auto dove invece e'
    // corretta. Meglio non dichiararne nessuna che dichiararne una inventata.
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));

  // Gli stessi filtri del catalogo pubblico: quello che la sitemap dichiara e
  // quello che il sito mostra devono essere la stessa cosa, altrimenti si
  // consegnano a Google indirizzi che poi rispondono "non disponibile".
  //
  // Letto con caricaTutto, non con ".limit()". Il database consegna mille
  // righe per richiesta e non lo dice: chiedere quarantacinquemila auto non ne
  // fa arrivare quarantacinquemila, ne fa arrivare mille. Con 296 auto non si
  // vedeva niente; alla millesima pubblicata la sitemap si sarebbe fermata li'
  // **in silenzio**, e ogni auto successiva sarebbe sparita da Google senza
  // che nessun errore lo segnalasse. E' la trappola che AGENTS.md elenca fra
  // quelle gia' pagate, ed e' il motivo per cui in questo progetto gli elenchi
  // si leggono cosi' in ventisei file.
  const { righe, troncato, error } = await caricaTutto<SitemapVehicleRow>(
    (da, a) =>
      publicSupabase
        .from("vehicles")
        .select("id, updated_at, created_at, dealers!inner(id, name, legal_name, status)")
        .eq("published", true)
        .in("status", MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES)
        .in("dealers.status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES)
        // Un ordine stabile serve a caricaTutto: senza, due blocchi possono
        // consegnare due volte la stessa riga e saltarne un'altra.
        .order("id", { ascending: true })
        .range(da, a) as unknown as PromiseLike<{ data: SitemapVehicleRow[] | null; error: { message: string } | null }>,
    { massimo: MAX_SITEMAP_VEHICLES }
  );

  if (error) {
    logMarketplaceQueryError("sitemap", error);
    // Meglio una sitemap con le sole pagine fisse che nessuna sitemap: se il
    // database non risponde, Google riceve comunque l'ossatura del sito
    // invece di un errore che gli farebbe scartare il file.
    return staticEntries;
  }

  if (troncato) {
    // Il tetto del protocollo, non quello del database: da qui in avanti
    // servirebbe spezzare la sitemap con generateSitemaps. Resta scritto nei
    // log invece di sparire in silenzio -- che e' esattamente il difetto che
    // questa modifica corregge.
    logMarketplaceTruncatedList("sitemap", righe.length);
  }

  const rows = righe;

  const vehicleEntries: MetadataRoute.Sitemap = rows.map((row) => ({
    url: `${baseUrl}/auto/${row.id}`,
    lastModified: dataDellaRiga(row, now),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // Una concessionaria compare una volta per veicolo pubblicato, e due nomi
  // diversi possono ridursi allo stesso indirizzo: la Map tiene una voce sola,
  // perche' i doppioni in una sitemap sono un difetto segnalato.
  //
  // La data non e' piu' quella della compilazione ma **la piu' recente fra le
  // auto di quella concessionaria**: e' l'unica cosa vera che sappiamo di
  // quella pagina, perche' la pagina cambia esattamente quando cambia il suo
  // parco auto.
  const dealerEntries = new Map<string, { url: string; lastModified: Date }>();

  for (const row of rows) {
    const name = normalizeVehicleDealerName(row.dealers);
    if (name === "Concessionaria") {
      continue;
    }

    const slug = createMarketplaceSlug(name);
    const aggiornata = dataDellaRiga(row, now);
    const esistente = dealerEntries.get(slug);

    if (!esistente) {
      dealerEntries.set(slug, { url: `${baseUrl}/concessionarie/${slug}`, lastModified: aggiornata });
    } else if (aggiornata > esistente.lastModified) {
      esistente.lastModified = aggiornata;
    }
  }

  const dealerSitemapEntries: MetadataRoute.Sitemap = Array.from(dealerEntries.values()).map((voce) => ({
    url: voce.url,
    lastModified: voce.lastModified,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticEntries, ...vehicleEntries, ...dealerSitemapEntries];
}
