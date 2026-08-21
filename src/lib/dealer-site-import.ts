/**
 * Legge lo stock usato dal sito che la concessionaria ha gia'.
 *
 * L'idea: quasi tutti i siti di concessionaria pubblicano i propri veicoli in
 * forma leggibile da una macchina, perche' devono farlo per Google. Invece di
 * chiedere al concessionario un file o un feed -- cioe' lavoro in piu' -- gli
 * si chiede l'indirizzo del suo sito e si legge da li'.
 *
 * Questo modulo non scrive niente e non parla col database: prende testo
 * (sitemap, pagine) e restituisce veicoli normalizzati. Cosi' si puo' provare
 * su dati veri senza rischiare niente, ed e' verificabile con schede vere
 * salvate come esempio.
 *
 * Verificato su autogepy.it e delorenziauto.it, entrambi su piattaforma
 * DealerK, che e' quella di molte concessionarie italiane.
 */

/** Le sole condizioni che ci interessano: stock fisico, non catalogo. */
export type StockCondition = "Usato" | "Km/0";

export type DealerSiteEntry = {
  url: string;
  /** L'identificativo stabile, preso dall'indirizzo: e' cio' che lega la scheda al veicolo del concessionario. */
  sourceId: string;
  condition: StockCondition;
};

export type DealerSiteVehicle = DealerSiteEntry & {
  name: string;
  brand: string | null;
  model: string | null;
  price: number | null;
  mileage: number | null;
  fuel: string | null;
  transmission: string | null;
  doors: number | null;
  seats: number | null;
  color: string | null;
  year: number | null;
  description: string | null;
  images: string[];
};

/** Perche' una scheda e' stata scartata: serve a spiegarlo, non solo a contarlo. */
export type SkipReason = "nessun-dato-strutturato" | "senza-prezzo" | "noleggio";

export type ParsedVehicle =
  | { ok: true; vehicle: DealerSiteVehicle }
  | { ok: false; reason: SkipReason; url: string };

/**
 * Le vetture nuove restano fuori, e non e' una semplificazione temporanea.
 *
 * Le pagine sotto /auto/nuove/ non sono automobili: sono configurazioni di
 * modello a catalogo. Verificato su entrambi i siti -- niente identificativo,
 * spesso niente prezzo, mai i chilometri. Importarle riempirebbe il
 * marketplace di veicoli che in piazzale non esistono.
 */
const CONDITION_BY_PATH: Array<[string, StockCondition]> = [
  ["/auto/usate/", "Usato"],
  ["/auto/km0/", "Km/0"],
];

/** L'identificativo e' l'ultimo pezzo dell'indirizzo: .../1-2-turbo-altitude/7699913/ */
const SOURCE_ID_PATTERN = /\/(\d{5,})\/?$/;

export function parseDealerStockSitemap(xml: string): DealerSiteEntry[] {
  const urls = Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)).map((m) => m[1]);
  const entries = new Map<string, DealerSiteEntry>();

  for (const url of urls) {
    const condition = CONDITION_BY_PATH.find(([segmento]) => url.includes(segmento))?.[1];
    if (!condition) continue;

    const sourceId = url.match(SOURCE_ID_PATTERN)?.[1];
    // Senza identificativo e' una pagina di categoria, non una vettura.
    if (!sourceId) continue;

    // La sitemap puo' elencare due volte lo stesso veicolo.
    if (!entries.has(sourceId)) {
      entries.set(sourceId, { url, sourceId, condition });
    }
  }

  return Array.from(entries.values());
}

type SchemaVehicle = Record<string, unknown>;

function readJsonLdVehicle(html: string): SchemaVehicle | null {
  const blocchi = Array.from(html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g));

  for (const [, contenuto] of blocchi) {
    let dati: unknown;
    try {
      dati = JSON.parse(contenuto);
    } catch {
      continue;
    }

    const nodi: unknown[] = Array.isArray(dati)
      ? dati
      : ((dati as { "@graph"?: unknown[] })?.["@graph"] ?? [dati]);

    for (const nodo of nodi) {
      const tipo = (nodo as SchemaVehicle)?.["@type"];
      if (tipo === "Vehicle" || tipo === "Car") {
        return nodo as SchemaVehicle;
      }
    }
  }

  return null;
}

function testo(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s.length > 0 ? s : null;
}

function numero(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = String(value ?? "").replace(/\./g, "").replace(",", ".").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * I chilometri arrivano dentro un oggetto, e su alcune schede valgono `false`
 * invece di un numero -- due su venticinque nella prova. `false` significa
 * "non lo so", non "zero": una macchina a zero chilometri dichiarati come
 * usata sarebbe un dato inventato.
 */
function leggiChilometri(value: unknown): number | null {
  if (value === false || value === null || value === undefined) return null;
  if (typeof value === "object") {
    return leggiChilometri((value as { value?: unknown }).value);
  }
  return numero(value);
}

function leggiPrezzo(vehicle: SchemaVehicle): number | null {
  const offers = vehicle.offers;
  const primo = Array.isArray(offers) ? offers[0] : offers;
  return numero((primo as { price?: unknown })?.price);
}

function leggiMarca(vehicle: SchemaVehicle): string | null {
  const brand = vehicle.brand;
  if (typeof brand === "string") return testo(brand);
  return testo((brand as { name?: unknown })?.name);
}

/**
 * Sotto questa cifra un "prezzo" non e' un prezzo di vendita: e' un canone
 * mensile di noleggio.
 *
 * Trovata nella prova su dati veri: una Jeep Avenger a **239 euro**, che il
 * sito elenca fra le usate perche' e' un'offerta di noleggio. Importata cosi',
 * sul marketplace comparirebbe una Jeep a 239 euro -- e chi la vede non pensa
 * "che strano", pensa che il sito sia inaffidabile.
 */
const MIN_PREZZO_VENDITA = 3000;

const PAROLE_NOLEGGIO = ["noleggio", "nolegg", "renting", "a canone"];

export function looksLikeRental(vehicle: { name?: string | null; description?: string | null; price: number | null }) {
  const testoScheda = `${vehicle.name ?? ""} ${vehicle.description ?? ""}`.toLowerCase();
  if (PAROLE_NOLEGGIO.some((parola) => testoScheda.includes(parola))) return true;

  return vehicle.price !== null && vehicle.price < MIN_PREZZO_VENDITA;
}

/**
 * Le foto del veicolo, e soltanto quelle.
 *
 * Stanno nella pagina e non nei dati strutturati, dove ce n'e' una sola. Ma
 * la pagina contiene molto piu' delle foto dell'auto, e prendere tutto ha
 * prodotto due difetti veri, visti sulle prime venti vetture importate:
 *
 * - **i loghi delle marche trattate dalla concessionaria** finivano nella
 *   galleria: due Jeep, due Hyundai, due Subaru, due Alfa Romeo. Stanno sotto
 *   /cars/make/brand/, insieme a un segnaposto sotto /cars/placeholder/;
 * - **lo stesso scatto ripetuto in quattro misure**: 800x0, 600x0, 480x0,
 *   400. Su una scheda vera: 47 indirizzi raccolti per 16 fotografie.
 *
 * Con il tetto di venti immagini a veicolo, il risultato era una galleria
 * fatta di doppioni e loghi.
 *
 * Quindi: solo i percorsi delle foto veicolo, una riga per fotografia, nella
 * misura piu' grande disponibile e nell'ordine in cui compaiono in pagina --
 * che e' l'ordine della galleria, quindi la prima e' la copertina.
 */
const PERCORSO_FOTO_VEICOLO = "/dealer/datafiles/vehicle/images/";

/**
 * La misura in cui chiediamo ogni foto.
 *
 * La pagina cita lo stesso scatto in misure diverse a seconda di dove lo usa:
 * 800x0 nella galleria, 0x250 nelle miniature. Sei delle sedici foto di una
 * scheda vera comparivano *solo* come miniature alte 250 pixel -- che in una
 * galleria si vedono male.
 *
 * Verificato che l'archivio serve qualsiasi misura si chieda: basta comporre
 * l'indirizzo. Quindi tutte le foto vengono chieste larghe 800, che per un
 * annuncio bastano e pesano la meta' della misura piena.
 */
const MISURA_FOTO = "800x0";

function normalizzaMisura(url: string) {
  const [prima, dopo] = url.split(PERCORSO_FOTO_VEICOLO);
  if (dopo === undefined) return url;

  const pezzi = dopo.split("/");
  // Il primo pezzo e' la misura: si sostituisce, il resto resta com'e'.
  pezzi[0] = MISURA_FOTO;
  return `${prima}${PERCORSO_FOTO_VEICOLO}${pezzi.join("/")}`;
}

function leggiFoto(html: string): string[] {
  const trovate = Array.from(html.matchAll(/https:\/\/cdn\.dealerk\.it\/[^"'\s)]+?\.(?:jpe?g|png|webp)/gi)).map((m) => m[0]);

  // Una voce per fotografia, riconosciuta dal nome del file: e' l'unica parte
  // dell'indirizzo che resta uguale fra una misura e l'altra. L'ordine e'
  // quello in cui compaiono in pagina, cioe' l'ordine della galleria: la
  // prima diventa la copertina.
  const viste = new Set<string>();
  const foto: string[] = [];

  for (const url of trovate) {
    if (!url.includes(PERCORSO_FOTO_VEICOLO)) continue;

    const nomeFile = url.split("/").pop() ?? "";
    if (!nomeFile || viste.has(nomeFile)) continue;

    viste.add(nomeFile);
    foto.push(normalizzaMisura(url));
  }

  return foto;
}

export function parseDealerStockVehicle(html: string, entry: DealerSiteEntry): ParsedVehicle {
  const grezzo = readJsonLdVehicle(html);
  if (!grezzo) {
    return { ok: false, reason: "nessun-dato-strutturato", url: entry.url };
  }

  const price = leggiPrezzo(grezzo);
  const name = testo(grezzo.name) ?? "";
  const description = testo(grezzo.description);

  if (looksLikeRental({ name, description, price })) {
    return { ok: false, reason: "noleggio", url: entry.url };
  }

  // Un annuncio senza prezzo non e' pubblicabile: il prezzo e' la prima cosa
  // che un compratore cerca, e un veicolo "prezzo su richiesta" importato in
  // massa e' rumore.
  if (price === null) {
    return { ok: false, reason: "senza-prezzo", url: entry.url };
  }

  // Le km 0 non dichiarano mai i chilometri: dodici su dodici nella prova,
  // mentre le usate li hanno quasi sempre. Non e' un dato mancante, e' il
  // significato stesso della categoria -- "km 0" vuol dire zero. Lasciarli
  // sconosciuti le farebbe sparire dal filtro dei chilometri della ricerca.
  const mileageGrezzo = leggiChilometri(grezzo.mileageFromOdometer);
  const mileage = mileageGrezzo === null && entry.condition === "Km/0" ? 0 : mileageGrezzo;

  return {
    ok: true,
    vehicle: {
      ...entry,
      name,
      brand: leggiMarca(grezzo),
      model: testo(grezzo.model),
      price,
      mileage,
      fuel: testo(grezzo.fuelType),
      transmission: testo(grezzo.vehicleTransmission),
      doors: numero(grezzo.numberOfDoors),
      seats: numero(grezzo.vehicleSeatingCapacity),
      color: testo(grezzo.color),
      year: numero(grezzo.vehicleModelDate),
      description,
      images: leggiFoto(html),
    },
  };
}
