/**
 * La ricerca avanzata dentro la pagina di una concessionaria.
 *
 * Perche' i filtri lavorano qui e non nel database, come fa /ricerca: la
 * pagina della concessionaria e' conservata in cache per cinque minuti
 * (`revalidate = 300` in `concessionarie/[slug]/page.tsx`), e leggere gli
 * indirizzi interrogativi la renderebbe da ricalcolare a ogni visita -- e'
 * scritto nella documentazione di Next: "searchParams is a Request-time API
 * [...] Using it will opt the page into dynamic rendering". Quella cache e'
 * una scelta gia' presa e protetta da un test
 * (`marketplace-performance.test.ts`), quindi i veicoli si scaricano una
 * volta sola e si filtrano nel browser: la cache resta, e i filtri
 * rispondono senza aspettare il server.
 *
 * Regola d'oro: **un valore assente non entra mai in un intervallo**. Postgres
 * considera l'assenza come il valore piu' grande e per questo il progetto
 * ordina sempre con `nullsFirst: false`; qui succede la stessa cosa a mano,
 * altrimenti un'auto senza prezzo aprirebbe l'elenco ordinato per prezzo
 * decrescente e comparirebbe fra i risultati di "fino a 10.000 euro".
 */

export type DealerVehicleFacets = {
  id: string;
  /** "Marca Modello Versione", gia' normalizzato: e' su questo che cerca il campo libero. */
  label: string;
  brand: string;
  model: string;
  bodyType: string;
  condition: string;
  fuel: string;
  transmission: string;
  year: number | null;
  price: number | null;
  mileage: number | null;
  /** Data di inserimento in millisecondi: serve solo a ordinare. */
  createdAt: number;
};

export const DEALER_SORT_OPTIONS = [
  { value: "created_desc", label: "Data inserimento (piu recenti)" },
  { value: "created_asc", label: "Data inserimento (piu vecchi)" },
  { value: "price_asc", label: "Prezzo crescente" },
  { value: "price_desc", label: "Prezzo decrescente" },
  { value: "year_desc", label: "Immatricolazione piu recente" },
  { value: "year_asc", label: "Immatricolazione piu vecchia" },
  { value: "mileage_asc", label: "Km crescente" },
  { value: "mileage_desc", label: "Km decrescente" },
] as const;

export type DealerSortValue = (typeof DEALER_SORT_OPTIONS)[number]["value"];

export type DealerFilterState = {
  q: string;
  brand: string;
  model: string;
  bodyType: string;
  condition: string;
  fuel: string;
  transmission: string;
  yearFrom: string;
  yearTo: string;
  minPrice: string;
  maxPrice: string;
  maxMileage: string;
  sort: DealerSortValue;
};

export const DEALER_FILTERS_EMPTY: DealerFilterState = {
  q: "",
  brand: "",
  model: "",
  bodyType: "",
  condition: "",
  fuel: "",
  transmission: "",
  yearFrom: "",
  yearTo: "",
  minPrice: "",
  maxPrice: "",
  maxMileage: "",
  sort: "created_desc",
};

/** Le chiavi che restringono i risultati. L'ordinamento non e' un filtro: non toglie niente. */
const CHIAVI_FILTRO = [
  "q",
  "brand",
  "model",
  "bodyType",
  "condition",
  "fuel",
  "transmission",
  "yearFrom",
  "yearTo",
  "minPrice",
  "maxPrice",
  "maxMileage",
] as const satisfies ReadonlyArray<keyof DealerFilterState>;

/**
 * Quanti filtri sono attivi. Serve all'etichetta del pannello: dire "Filtri"
 * anche quando ne sono accesi cinque nasconde il motivo per cui mancano dei
 * veicoli -- lo stesso difetto gia' corretto sull'elenco del gestionale.
 */
export function contaFiltriAttivi(state: DealerFilterState) {
  return CHIAVI_FILTRO.reduce((totale, chiave) => (String(state[chiave] ?? "").trim() ? totale + 1 : totale), 0);
}

export function normalizzaPerRicerca(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function numeroOppureNull(value: string | number | null | undefined) {
  const normalizzato = String(value ?? "").trim();
  if (!normalizzato) return null;

  const numero = Number(normalizzato.replace(",", "."));
  return Number.isFinite(numero) ? numero : null;
}

function annoOppureNull(value: string) {
  const numero = numeroOppureNull(value);
  if (numero === null || !Number.isInteger(numero)) return null;
  return numero >= 1900 && numero <= new Date().getFullYear() + 1 ? numero : null;
}

function uguale(valore: string, scelto: string) {
  return normalizzaPerRicerca(valore) === normalizzaPerRicerca(scelto);
}

/**
 * Gli estremi dell'intervallo anni, scambiati se scritti al contrario.
 * Stessa scelta di /ricerca: chi mette 2020 in "Anno a" e 2015 in "Anno da"
 * vuole quell'intervallo, non zero risultati.
 */
function intervalloAnni(state: DealerFilterState) {
  const da = annoOppureNull(state.yearFrom);
  const a = annoOppureNull(state.yearTo);
  if (da !== null && a !== null) {
    return { da: Math.min(da, a), a: Math.max(da, a) };
  }
  return { da, a };
}

export function veicoloCorrisponde(veicolo: DealerVehicleFacets, state: DealerFilterState) {
  const parole = normalizzaPerRicerca(state.q).split(/\s+/).filter(Boolean);
  if (parole.length > 0) {
    const etichetta = normalizzaPerRicerca(veicolo.label);
    // Ogni parola deve comparire, non l'intera frase: "tucson diesel" trova
    // anche quando le due parole stanno in campi diversi del titolo.
    if (!parole.every((parola) => etichetta.includes(parola))) return false;
  }

  if (state.brand.trim() && !uguale(veicolo.brand, state.brand)) return false;
  if (state.model.trim() && !uguale(veicolo.model, state.model)) return false;
  if (state.bodyType.trim() && !uguale(veicolo.bodyType, state.bodyType)) return false;
  if (state.condition.trim() && !uguale(veicolo.condition, state.condition)) return false;
  if (state.fuel.trim() && !uguale(veicolo.fuel, state.fuel)) return false;
  if (state.transmission.trim() && !uguale(veicolo.transmission, state.transmission)) return false;

  const anni = intervalloAnni(state);
  if (anni.da !== null || anni.a !== null) {
    if (veicolo.year === null) return false;
    if (anni.da !== null && veicolo.year < anni.da) return false;
    if (anni.a !== null && veicolo.year > anni.a) return false;
  }

  const prezzoMin = numeroOppureNull(state.minPrice);
  const prezzoMax = numeroOppureNull(state.maxPrice);
  if (prezzoMin !== null || prezzoMax !== null) {
    if (veicolo.price === null) return false;
    if (prezzoMin !== null && veicolo.price < prezzoMin) return false;
    if (prezzoMax !== null && veicolo.price > prezzoMax) return false;
  }

  const kmMax = numeroOppureNull(state.maxMileage);
  if (kmMax !== null) {
    if (veicolo.mileage === null) return false;
    if (veicolo.mileage > kmMax) return false;
  }

  return true;
}

/** Confronto che tiene i valori assenti in coda, in salita come in discesa. */
function confrontaNumeri(a: number | null, b: number | null, crescente: boolean) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return crescente ? a - b : b - a;
}

export function ordinaVeicoli(veicoli: DealerVehicleFacets[], sort: DealerSortValue) {
  const ordinati = [...veicoli];

  switch (sort) {
    case "price_asc":
      return ordinati.sort((a, b) => confrontaNumeri(a.price, b.price, true));
    case "price_desc":
      return ordinati.sort((a, b) => confrontaNumeri(a.price, b.price, false));
    case "year_asc":
      return ordinati.sort((a, b) => confrontaNumeri(a.year, b.year, true));
    case "year_desc":
      return ordinati.sort((a, b) => confrontaNumeri(a.year, b.year, false));
    case "mileage_asc":
      return ordinati.sort((a, b) => confrontaNumeri(a.mileage, b.mileage, true));
    case "mileage_desc":
      return ordinati.sort((a, b) => confrontaNumeri(a.mileage, b.mileage, false));
    case "created_asc":
      return ordinati.sort((a, b) => a.createdAt - b.createdAt);
    default:
      return ordinati.sort((a, b) => b.createdAt - a.createdAt);
  }
}

export function filtraEOrdina(veicoli: DealerVehicleFacets[], state: DealerFilterState) {
  return ordinaVeicoli(
    veicoli.filter((veicolo) => veicoloCorrisponde(veicolo, state)),
    state.sort
  );
}

function valoriUnici(valori: Array<string | null | undefined>) {
  const visti = new Map<string, string>();
  for (const valore of valori) {
    const pulito = String(valore ?? "").trim();
    if (!pulito) continue;
    const chiave = normalizzaPerRicerca(pulito);
    if (!visti.has(chiave)) visti.set(chiave, pulito);
  }
  return Array.from(visti.values()).sort((a, b) => a.localeCompare(b, "it-IT"));
}

/**
 * Le voci delle tendine escono dallo stock di **questa** concessionaria, non
 * da un elenco fisso: proporre "Cabrio" a chi non ne ha nemmeno una manderebbe
 * il visitatore su un risultato vuoto ogni volta.
 *
 * I modelli si restringono alla marca scelta, come nella ricerca del
 * marketplace.
 */
export function opzioniFiltri(veicoli: DealerVehicleFacets[], state: DealerFilterState) {
  const perModelli = state.brand.trim() ? veicoli.filter((veicolo) => uguale(veicolo.brand, state.brand)) : veicoli;

  return {
    brands: valoriUnici(veicoli.map((veicolo) => veicolo.brand)),
    models: valoriUnici(perModelli.map((veicolo) => veicolo.model)),
    bodyTypes: valoriUnici(veicoli.map((veicolo) => veicolo.bodyType)),
    conditions: valoriUnici(veicoli.map((veicolo) => veicolo.condition)),
    fuels: valoriUnici(veicoli.map((veicolo) => veicolo.fuel)),
    transmissions: valoriUnici(veicoli.map((veicolo) => veicolo.transmission)),
    years: Array.from(new Set(veicoli.map((veicolo) => veicolo.year).filter((anno): anno is number => anno !== null)))
      .sort((a, b) => b - a)
      .map((anno) => String(anno)),
  };
}
