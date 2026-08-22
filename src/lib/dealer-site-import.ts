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
  /** Come la chiama il sito di origine: "SUV", "Berlina due volumi". */
  bodyType: string | null;
  year: number | null;
  description: string | null;
  images: string[];
};

/** Perche' una scheda e' stata scartata: serve a spiegarlo, non solo a contarlo. */
export type SkipReason = "nessun-dato-strutturato" | "senza-prezzo" | "noleggio" | "senza-foto";

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

/**
 * Il prezzo quando la scheda leggibile dalle macchine non lo dichiara.
 *
 * Non tutti i siti DealerK lo mettono nello stesso posto. Su autogepy la
 * scheda ha il campo "offers" col prezzo dentro; su delorenziauto quel campo
 * non c'e' proprio -- verificato su dodici vetture su dodici, e la scheda
 * porta comunque marca, modello, anno, chilometri, colore e alimentazione.
 * Senza questa lettura quelle centocinque vetture verrebbero scartate tutte
 * per "prezzo mancante", che e' falso: il prezzo sulla pagina c'e'.
 *
 * Il punto delicato e' *quale* cifra prendere. La pagina di una vettura ne
 * contiene diverse: le auto simili proposte in fondo, e un'etichetta di
 * filtro che si chiama anch'essa "price" ma vale "Qualsiasi prezzo". E' la
 * stessa trappola che aveva messo in galleria le foto di altre automobili.
 *
 * Quindi non si cerca "un prezzo nella pagina": si cerca il prezzo scritto
 * accanto all'identificativo di *questa* vettura, quello che sta anche
 * nell'indirizzo. Sulle schede vere le due cose distano meno di duecento
 * caratteri, e nessuna delle cifre altrui e' agganciata a questo numero.
 *
 * Fra piu' candidati vince la cifra scritta come numero: "20000" non si puo'
 * fraintendere, mentre "20.000" ha un punto che in italiano separa le
 * migliaia e altrove i decimali.
 */
const FINESTRA_INTORNO_ALL_ID = 400;

function prezzoDaTesto(value: string): number | null {
  const pulito = value
    .replace(/\\u20ac/gi, "")
    .replace(/[€\s]/g, "")
    .trim();
  if (!/^[0-9.,]+$/.test(pulito)) return null;

  // "20.000" sono ventimila euro, "20000.00" sono ventimila euro con i
  // centesimi: distingue quante cifre seguono l'ultimo separatore.
  const ultimoSeparatore = Math.max(pulito.lastIndexOf("."), pulito.lastIndexOf(","));
  if (ultimoSeparatore === -1) return numero(pulito);

  const decimali = pulito.length - ultimoSeparatore - 1;
  const intero = decimali === 3 ? pulito.replace(/[.,]/g, "") : pulito.slice(0, ultimoSeparatore).replace(/[.,]/g, "");
  return numero(intero);
}

function leggiPrezzoDallaPagina(html: string, sourceId: string): number | null {
  const id = sourceId.replace(/[^0-9a-z]/gi, "");
  if (!id) return null;

  const ancore = [...html.matchAll(new RegExp(`"vehicleId"\\s*:\\s*"?${id}"?`, "g"))].map((m) => m.index ?? -1);

  for (const posizione of ancore) {
    if (posizione < 0) continue;

    const finestra = html.slice(
      Math.max(0, posizione - FINESTRA_INTORNO_ALL_ID),
      posizione + FINESTRA_INTORNO_ALL_ID
    );

    const comeNumero = finestra.match(/"price"\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*[,}]/);
    if (comeNumero) {
      const valore = numero(comeNumero[1].includes(".") ? comeNumero[1].split(".")[0] : comeNumero[1]);
      if (valore !== null) return valore;
    }

    const comeTesto = finestra.match(/"price"\s*:\s*"([^"]{1,24})"/);
    if (comeTesto) {
      const valore = prezzoDaTesto(comeTesto[1]);
      if (valore !== null) return valore;
    }
  }

  return null;
}

/**
 * La carrozzeria, che la scheda leggibile dalle macchine non dichiara.
 *
 * Senza, un veicolo importato non compare ne' in "Esplora per categoria" ne'
 * nel filtro della ricerca avanzata: era il caso di dodici dei quattordici
 * veicoli pubblicati.
 *
 * Si legge "body_style", che sulle pagine provate compare una volta sola ed e'
 * quella della vettura. "bodyType" e' il ripiego, ma va setacciato: fra le sue
 * occorrenze c'e' anche l'etichetta del filtro di ricerca, che vale "Qualsiasi
 * carrozzeria" -- la stessa trappola del prezzo.
 */
function leggiCarrozzeria(html: string): string | null {
  const ripulisci = (valore: string) => testo(valore.replace(/\\\//g, "/"));

  const daBodyStyle = html.match(/"body_style"\s*:\s*"([^"]{2,40})"/)?.[1];
  if (daBodyStyle) {
    return ripulisci(daBodyStyle);
  }

  for (const trovato of html.matchAll(/"bodyType"\s*:\s*"([^"]{2,40})"/g)) {
    const valore = ripulisci(trovato[1]);
    if (valore && !/^qualsiasi/i.test(valore)) {
      return valore;
    }
  }

  return null;
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
 * L'archivio serve qualsiasi misura si chieda, e la genera al momento: 2000 e
 * "original" restituiscono lo stesso file di 1600, cioe' la foto piena.
 *
 * Era 800, scelto perche' pesava la meta'. Troppo poco: aperta a schermo
 * intero, una foto da 801x451 in un'area da 1440x716 o resta piccola o si
 * sgrana. A 1600 arrivano 1281x721 -- due volte e mezzo i pixel, 113 KB
 * invece di 53 -- e a schermo intero la foto si vede alla sua misura vera.
 * Misurato su tre fotografie di due vetture diverse.
 */
const MISURA_FOTO = "1600x0";

/**
 * Sotto questa larghezza una immagine non e' una foto della galleria.
 *
 * E' la regola che tiene fuori le vetture altrui, e nasce da una
 * segnalazione: sulla scheda di una Jeep CJ-7 comparivano foto di altre
 * automobili. In fondo a ogni scheda c'e' un carosello di vetture simili, e
 * le sue miniature stanno nello stesso archivio delle foto vere.
 *
 * Misurato su tre schede diverse, il confine e' netto:
 *
 * - le foto **della vettura** compaiono in piu' misure -- 800x0, 600x0,
 *   480x0, spesso anche la misura piena;
 * - le miniature **delle altre vetture** compaiono solo come 0x250.
 *
 * E si vede anche da dove stanno nella pagina: le prime entro i primi
 * ottantamila caratteri, le seconde oltre i duecentomila. Ma la posizione
 * dipende da come e' impaginato il sito, la misura no: e' l'uso che se ne fa.
 *
 * Sulla CJ-7 questo separa 13 foto sue da 8 di altre tre automobili --
 * verificate una per una risalendo al veicolo a cui erano collegate.
 */
const LARGHEZZA_MINIMA_GALLERIA = 400;

/**
 * In quante misure diverse il sito deve offrire una fotografia perche' sia
 * della vettura.
 *
 * La regola della larghezza minima non basta, e si e' visto importando
 * delorenziauto.it: li' le miniature delle altre automobili sono larghe 400
 * come le foto vere, quindi passavano tutte. Su una scheda vera -- l'Opel
 * Corsa 6751886 -- delle ventuno fotografie presenti sei erano di altre
 * vetture, quelle proposte in fondo alla pagina.
 *
 * Il segnale che le separa e' netto, ed e' lo stesso sui due siti provati:
 *
 * - la fotografia **della vettura** il sito la pubblica in piu' misure,
 *   perche' gli serve grande nella galleria e piccola nella striscia delle
 *   anteprime: 400+800+200 su delorenziauto, 800x0+600x0+480x0 su autogepy;
 * - la miniatura **di un'altra vettura** compare una volta sola, nella misura
 *   che serve a quella scheda: 400 su delorenziauto, 0x250 su autogepy.
 *
 * E' un criterio piu' solido della posizione nella pagina, che dipende da
 * come e' impaginato il sito, e piu' solido della larghezza, che dipende da
 * come sono ritagliate le anteprime.
 */
const MISURE_MINIME_GALLERIA = 2;

function larghezzaMisura(misura: string): number {
  if (misura.includes("original")) return Number.MAX_SAFE_INTEGER;

  // "800x0" e' larghezza per altezza, "0x250" vincola l'altezza, "400" e' la
  // sola larghezza: in tutti i casi la dimensione e' il numero piu' grande.
  const numeri = misura
    .split("x")
    .map((parte) => Number(parte))
    .filter((n) => Number.isFinite(n));

  return numeri.length > 0 ? Math.max(...numeri) : 0;
}

function misuraDi(url: string) {
  return url.split(PERCORSO_FOTO_VEICOLO)[1]?.split("/")[0] ?? "";
}

/**
 * Riporta l'indirizzo di una foto DealerK alla misura che vogliamo.
 *
 * Serve anche fuori dall'importazione: le fotografie gia' nel database hanno
 * l'indirizzo con la misura di quando sono state importate, e riscriverlo al
 * momento di mostrarle le migliora tutte senza toccare i dati. Un indirizzo
 * che non sia una foto DealerK esce di qui immutato.
 */
export function normalizzaMisuraFoto(url: string) {
  const [prima, dopo] = url.split(PERCORSO_FOTO_VEICOLO);
  if (dopo === undefined) return url;

  const pezzi = dopo.split("/");
  pezzi[0] = MISURA_FOTO;
  return `${prima}${PERCORSO_FOTO_VEICOLO}${pezzi.join("/")}`;
}

function leggiFoto(html: string): string[] {
  const trovate = Array.from(html.matchAll(/https:\/\/cdn\.dealerk\.it\/[^"'\s)]+?\.(?:jpe?g|png|webp)/gi)).map((m) => m[0]);

  // Una voce per fotografia, riconosciuta dal nome del file: e' l'unica parte
  // dell'indirizzo che resta uguale fra una misura e l'altra.
  const perNomeFile = new Map<
    string,
    { url: string; larghezzaMassima: number; ordine: number; misure: Set<string> }
  >();

  for (const url of trovate) {
    if (!url.includes(PERCORSO_FOTO_VEICOLO)) continue;

    const nomeFile = url.split("/").pop() ?? "";
    if (!nomeFile) continue;

    const misura = misuraDi(url);
    const larghezza = larghezzaMisura(misura);
    const gia = perNomeFile.get(nomeFile);

    if (!gia) {
      perNomeFile.set(nomeFile, { url, larghezzaMassima: larghezza, ordine: perNomeFile.size, misure: new Set([misura]) });
      continue;
    }

    gia.misure.add(misura);

    if (larghezza > gia.larghezzaMassima) {
      // La posizione resta la prima in cui la fotografia e' comparsa: e'
      // l'ordine della galleria, quindi la prima diventa la copertina.
      gia.url = url;
      gia.larghezzaMassima = larghezza;
    }
  }

  const abbastanzaGrandi = Array.from(perNomeFile.values()).filter(
    (voce) => voce.larghezzaMassima >= LARGHEZZA_MINIMA_GALLERIA
  );

  const inPiuMisure = abbastanzaGrandi.filter((voce) => voce.misure.size >= MISURE_MINIME_GALLERIA);

  // Se nessuna fotografia comparisse in piu' misure il criterio non
  // saprebbe distinguere niente: meglio una galleria con qualche intrusa che
  // una scheda senza foto, che verrebbe scartata del tutto.
  const scelte = inPiuMisure.length > 0 ? inPiuMisure : abbastanzaGrandi;

  return scelte
    .sort((a, b) => a.ordine - b.ordine)
    .map((voce) => normalizzaMisuraFoto(voce.url));
}

export function parseDealerStockVehicle(html: string, entry: DealerSiteEntry): ParsedVehicle {
  const grezzo = readJsonLdVehicle(html);
  if (!grezzo) {
    return { ok: false, reason: "nessun-dato-strutturato", url: entry.url };
  }

  const price = leggiPrezzo(grezzo) ?? leggiPrezzoDallaPagina(html, entry.sourceId);
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

  const images = leggiFoto(html);

  // Un annuncio senza fotografie non e' un annuncio.
  //
  // Su un marketplace di automobili la foto e' la prima cosa che si guarda e
  // spesso l'unica prima del clic: una scheda senza immagini occupa un posto
  // in griglia, abbassa la fiducia in tutte le altre e non porta contatti.
  // Meglio non averla che averla vuota.
  //
  // E' anche un buon segnale d'allarme: se una scheda non ha foto, quasi
  // sempre non e' pronta nemmeno sul sito della concessionaria.
  if (images.length === 0) {
    return { ok: false, reason: "senza-foto", url: entry.url };
  }

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
      bodyType: leggiCarrozzeria(html),
      year: numero(grezzo.vehicleModelDate),
      description,
      images,
    },
  };
}
