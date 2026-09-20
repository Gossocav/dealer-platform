import { DEALER_FILTERS_EMPTY, DEALER_SORT_OPTIONS, type DealerFilterState, type DealerSortValue } from "@/lib/dealer-vehicle-filters";
import { COLONNA_RICERCA, modelloIlike, paroleRicercaVeicolo } from "@/lib/ricerca-veicoli";
import { perConfrontoSenzaMaiuscole } from "@/lib/valori-distinti";

/**
 * I filtri della pagina di una concessionaria, applicati **dal database**.
 *
 * **Perche' si e' spostato tutto sul server.** Prima la pagina caricava fino
 * a trecento automobili e le filtrava nel browser: con 133 funzionava, e
 * finche' l'elenco e' intero il conto torna. Il giorno che quella pagina
 * verra' divisa in pagine da ventiquattro -- ed e' il lavoro subito dopo
 * questo -- il browser avrebbe in mano **ventiquattro** auto su 133, e
 * filtrando li' dentro scriverebbe "12 auto su 133" avendone guardate
 * ventiquattro. E' esattamente il difetto del prezzo minimo calcolato sulle
 * prime trecento, chiuso il 19/09/2026 **sulla stessa pagina**.
 *
 * Per questo l'ordine e' filtri prima, pagine dopo: al contrario ci sarebbe
 * un momento in cui la pagina mente.
 *
 * **Le regole sono le stesse di `/ricerca`**, e passano dalle stesse
 * funzioni: la ricerca per parole su `ricerca_testo`, marca e modello
 * confrontati senza maiuscole (nei dati la stessa auto e' scritta "C3" e
 * "c3": un confronto esatto perdeva le seconde), gli anni sulla data di
 * immatricolazione vera. Due pagine che filtrano lo stesso archivio con due
 * regole diverse sono peggio di una regola imperfetta.
 */

/**
 * Solo i metodi che servono qui.
 *
 * Non si prende il tipo vero di Supabase (`PostgrestFilterBuilder`): ha
 * cinque parametri generici che cambiano a ogni versione della libreria, e
 * per agganciarli servirebbero tante forzature quante le righe di codice.
 * Questa forma dice esattamente cosa questa funzione ha bisogno di fare, e
 * il costruttore vero la soddisfa da se'.
 */
export type CostruttoreDiRichiesta = {
  ilike(colonna: string, valore: string): CostruttoreDiRichiesta;
  eq(colonna: string, valore: unknown): CostruttoreDiRichiesta;
  gte(colonna: string, valore: unknown): CostruttoreDiRichiesta;
  lte(colonna: string, valore: unknown): CostruttoreDiRichiesta;
  order(colonna: string, opzioni: { ascending: boolean; nullsFirst?: boolean }): CostruttoreDiRichiesta;
};

/** Il primo valore di un parametro dell'indirizzo, come stringa pulita. */
function valore(parametro: string | string[] | undefined): string {
  return String(Array.isArray(parametro) ? parametro[0] ?? "" : parametro ?? "").trim();
}

function numeroOppureNull(testo: string): number | null {
  const pulito = testo.replace(/[^\d-]/g, "");
  if (!pulito) return null;
  const n = Number(pulito);
  return Number.isFinite(n) ? n : null;
}

/**
 * Da indirizzo a filtri.
 *
 * L'ordinamento si accetta **solo** se e' uno di quelli previsti: un valore
 * scritto a mano nell'indirizzo non deve poter cambiare la colonna su cui si
 * ordina.
 */
export function filtriConcessionariaDaIndirizzo(parametri: Record<string, string | string[] | undefined>): DealerFilterState {
  const sortCandidato = valore(parametri.sort);
  const sort = (DEALER_SORT_OPTIONS.some((opzione) => opzione.value === sortCandidato)
    ? sortCandidato
    : DEALER_FILTERS_EMPTY.sort) as DealerSortValue;

  return {
    q: valore(parametri.q),
    brand: valore(parametri.brand),
    model: valore(parametri.model),
    bodyType: valore(parametri.bodyType),
    condition: valore(parametri.condition),
    fuel: valore(parametri.fuel),
    transmission: valore(parametri.transmission),
    yearFrom: valore(parametri.yearFrom),
    yearTo: valore(parametri.yearTo),
    minPrice: valore(parametri.minPrice),
    maxPrice: valore(parametri.maxPrice),
    maxMileage: valore(parametri.maxMileage),
    sort,
  };
}

/** Quali di questi filtri restringono davvero l'elenco (l'ordinamento no). */
export function valoriDeiFiltri(filtri: DealerFilterState): string[] {
  return [
    filtri.q, filtri.brand, filtri.model, filtri.bodyType, filtri.condition,
    filtri.fuel, filtri.transmission, filtri.yearFrom, filtri.yearTo,
    filtri.minPrice, filtri.maxPrice, filtri.maxMileage,
  ];
}

/**
 * Gli anni si leggono come `/ricerca`: i due estremi sono indipendenti e si
 * scambiano se arrivano al contrario, cosi' "dal 2020 al 2015" non
 * restituisce zero risultati per un errore di battitura.
 */
function intervalloAnni(filtri: DealerFilterState): { da: number | null; a: number | null } {
  const primo = numeroOppureNull(filtri.yearFrom);
  const secondo = numeroOppureNull(filtri.yearTo);
  if (primo !== null && secondo !== null) return { da: Math.min(primo, secondo), a: Math.max(primo, secondo) };
  return { da: primo, a: secondo };
}

export function applicaFiltriConcessionaria(query: CostruttoreDiRichiesta, filtri: DealerFilterState): CostruttoreDiRichiesta {
  let q = query;

  if (filtri.q) {
    // Ogni parola deve comparire, non l'intera frase: "tucson diesel" trova
    // anche quando le due parole stanno in campi diversi del titolo.
    for (const parola of paroleRicercaVeicolo(filtri.q)) {
      q = q.ilike(COLONNA_RICERCA, modelloIlike(parola));
    }
  }

  if (filtri.brand) q = q.ilike("brand", perConfrontoSenzaMaiuscole(filtri.brand));
  if (filtri.model) q = q.ilike("model", perConfrontoSenzaMaiuscole(filtri.model));
  if (filtri.bodyType) q = q.eq("body_type", filtri.bodyType);
  if (filtri.condition) q = q.eq("vehicle_condition", filtri.condition);
  if (filtri.fuel) q = q.eq("fuel", filtri.fuel);
  if (filtri.transmission) q = q.eq("transmission", filtri.transmission);

  const anni = intervalloAnni(filtri);
  if (anni.da !== null) q = q.gte("registration_date", `${anni.da}-01-01`);
  if (anni.a !== null) q = q.lte("registration_date", `${anni.a}-12-31`);

  const prezzoMin = numeroOppureNull(filtri.minPrice);
  const prezzoMax = numeroOppureNull(filtri.maxPrice);
  if (prezzoMin !== null) q = q.gte("price", prezzoMin);
  if (prezzoMax !== null) q = q.lte("price", prezzoMax);

  const kmMax = numeroOppureNull(filtri.maxMileage);
  if (kmMax !== null) q = q.lte("mileage", kmMax);

  return q;
}

/**
 * L'ordinamento, con i valori mancanti **sempre in coda**.
 *
 * Postgres considera un valore assente come il piu' grande: in ordine
 * decrescente le auto senza prezzo aprirebbero l'elenco. E' la stessa regola
 * gia' scritta in AGENTS.md, e vale in tutte e due le direzioni.
 */
export function ordinaConcessionaria(query: CostruttoreDiRichiesta, sort: DealerSortValue): CostruttoreDiRichiesta {
  const coda = { nullsFirst: false } as const;
  switch (sort) {
    case "price_asc": return query.order("price", { ascending: true, ...coda });
    case "price_desc": return query.order("price", { ascending: false, ...coda });
    case "year_asc": return query.order("registration_date", { ascending: true, ...coda });
    case "year_desc": return query.order("registration_date", { ascending: false, ...coda });
    case "mileage_asc": return query.order("mileage", { ascending: true, ...coda });
    case "mileage_desc": return query.order("mileage", { ascending: false, ...coda });
    case "created_asc": return query.order("created_at", { ascending: true, ...coda });
    default: return query.order("created_at", { ascending: false, ...coda });
  }
}
