/**
 * I giorni di giacenza: da quanto tempo un'automobile e' ferma in piazzale.
 *
 * Si contano dalla **data di acquisto**, che il concessionario scrive a mano
 * nel conto economico della vettura. Non dalla data in cui l'annuncio e' stato
 * creato sulla piattaforma: quella dice da quando l'auto e' in vetrina da noi,
 * e per le vetture lette dal sito della concessionaria e' addirittura la data
 * della prima sincronizzazione notturna. Un'auto comprata a marzo e caricata
 * qui ad agosto e' ferma da cinque mesi, non da tre giorni, e confondere le
 * due date farebbe sembrare nuovo tutto il parco.
 *
 * **Un'auto senza data di acquisto non ha giacenza zero: non ha giacenza.**
 * Sta in un elenco a parte, e si dice quante sono. Contarle nella prima fascia
 * riempirebbe di verde un piazzale fermo, che e' il modo piu' sicuro di far
 * prendere una decisione sbagliata a chi guarda.
 *
 * Il conto e' di due tipi diversi, e non vanno mescolati:
 *
 * - **in piazzale**: dalla data di acquisto a oggi. E' un conto che cresce da
 *   solo ogni giorno, e risponde a "quali devo muovere".
 * - **venduto**: dalla data di acquisto alla data di vendita. E' un conto
 *   chiuso, e risponde a "quanto ci metto a vendere".
 *
 * Cento giorni della prima specie sono un problema, cento della seconda sono
 * un risultato: in un grafico solo si annullerebbero a vicenda.
 */

import { getVehicleStateLabel, type VehicleLifecycleState } from "@/lib/vehicle-state-machine";

/** Gli stati in cui una vettura risulta venduta, gli stessi della pagina Vendite. */
const STATI_VENDUTI: VehicleLifecycleState[] = ["sold", "delivered"];

/** Fuori da entrambi i conti: non e' piu' in piazzale e non e' stata venduta. */
const STATI_FUORI: VehicleLifecycleState[] = ["archived"];

export type VetturaGiacenza = {
  vehicleId: string;
  etichetta: string;
  targa: string | null;
  stato: VehicleLifecycleState;
  purchaseDate: string | null;
  saleDate: string | null;
  /** Il prezzo dell'annuncio: serve a capire quanto capitale e' fermo. */
  prezzo: number | null;
};

export type VetturaConGiorni = VetturaGiacenza & { giorni: number };

export type FasciaId = "0-30" | "31-60" | "61-90" | "91-120" | "121-150" | "oltre-150";

export type Fascia = {
  id: FasciaId;
  etichetta: string;
  /** Il primo giorno compreso nella fascia. */
  da: number;
  /** L'ultimo giorno compreso, oppure null per l'ultima fascia, che non ha fine. */
  a: number | null;
  vetture: VetturaConGiorni[];
};

/**
 * Le fasce chieste: 30, 60, 90, 120, 150, oltre.
 *
 * Sono estremi **compresi**: una vettura ferma da esattamente 30 giorni sta
 * nella prima, non nella seconda. Un confine che cade fra due fasce fa sparire
 * una riga dal totale senza che nessuno se ne accorga.
 */
export const FASCE: Array<Omit<Fascia, "vetture">> = [
  { id: "0-30", etichetta: "Fino a 30 giorni", da: 0, a: 30 },
  { id: "31-60", etichetta: "31-60 giorni", da: 31, a: 60 },
  { id: "61-90", etichetta: "61-90 giorni", da: 61, a: 90 },
  { id: "91-120", etichetta: "91-120 giorni", da: 91, a: 120 },
  { id: "121-150", etichetta: "121-150 giorni", da: 121, a: 150 },
  { id: "oltre-150", etichetta: "Oltre 150 giorni", da: 151, a: null },
];

export type Quadro = {
  fasce: Fascia[];
  /** Quante vetture entrano nel conto, cioe' hanno le date che servono. */
  totale: number;
  /** Senza data di acquisto: esistono, ma la giacenza non si puo' sapere. */
  senzaData: VetturaGiacenza[];
  /**
   * Date che non stanno in piedi -- acquistata dopo essere stata venduta,
   * oppure acquistata nel futuro. Sono errori di battitura, e vanno mostrati
   * invece di essere silenziosamente contati come zero giorni.
   */
  incoerenti: VetturaGiacenza[];
  giorniMedi: number | null;
  giorniMassimi: number | null;
};

/** La data di oggi come la scrive il database: 2026-09-01. */
export function oggiIso(adesso: Date = new Date()): string {
  const mese = String(adesso.getMonth() + 1).padStart(2, "0");
  const giorno = String(adesso.getDate()).padStart(2, "0");
  return `${adesso.getFullYear()}-${mese}-${giorno}`;
}

/**
 * I giorni fra due date, o null se una delle due manca o non si legge.
 *
 * Si contano in UTC di proposito: sommando ore locali, la notte in cui scatta
 * l'ora legale vale 23 ore e il conto perderebbe un giorno.
 */
export function giorniTra(inizio: string | null | undefined, fine: string | null | undefined): number | null {
  const da = aGiorno(inizio);
  const a = aGiorno(fine);
  if (da === null || a === null) return null;
  return Math.round((a - da) / 86_400_000);
}

function aGiorno(valore: string | null | undefined): number | null {
  const trovato = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valore ?? "").trim());
  if (!trovato) return null;
  return Date.UTC(Number(trovato[1]), Number(trovato[2]) - 1, Number(trovato[3]));
}

/** In quale fascia cade un numero di giorni. */
export function fasciaDi(giorni: number): FasciaId {
  const trovata = FASCE.find((fascia) => giorni >= fascia.da && (fascia.a === null || giorni <= fascia.a));
  return (trovata ?? FASCE[FASCE.length - 1]).id;
}

/** Le vetture ancora ferme: tutto quello che non e' venduto ne' archiviato. */
export function ancoraInPiazzale(vetture: VetturaGiacenza[]): VetturaGiacenza[] {
  return vetture.filter((v) => !STATI_VENDUTI.includes(v.stato) && !STATI_FUORI.includes(v.stato));
}

/** Le vetture vendute o consegnate. */
export function giaVendute(vetture: VetturaGiacenza[]): VetturaGiacenza[] {
  return vetture.filter((v) => STATI_VENDUTI.includes(v.stato));
}

/** Da quanti giorni e' ferma, contando fino a oggi. */
export function giorniInPiazzale(vettura: VetturaGiacenza, oggi: string): number | null {
  return giorniTra(vettura.purchaseDate, oggi);
}

/**
 * Quanti giorni c'e' voluto a venderla.
 *
 * Se la vendita e' registrata ma senza data, il conto non si puo' chiudere:
 * vale come dato mancante, non come vendita immediata.
 */
export function giorniPerVendere(vettura: VetturaGiacenza): number | null {
  return giorniTra(vettura.purchaseDate, vettura.saleDate);
}

/** Il quadro delle vetture ferme oggi. */
export function quadroDelPiazzale(vetture: VetturaGiacenza[], oggi: string = oggiIso()): Quadro {
  return costruisci(ancoraInPiazzale(vetture), (vettura) => giorniInPiazzale(vettura, oggi));
}

/** Il quadro di quanto e' voluto a vendere quelle gia' vendute. */
export function quadroDelVenduto(vetture: VetturaGiacenza[]): Quadro {
  return costruisci(giaVendute(vetture), giorniPerVendere);
}

function costruisci(vetture: VetturaGiacenza[], calcola: (v: VetturaGiacenza) => number | null): Quadro {
  const fasce: Fascia[] = FASCE.map((fascia) => ({ ...fascia, vetture: [] }));
  const senzaData: VetturaGiacenza[] = [];
  const incoerenti: VetturaGiacenza[] = [];
  const giorniTutti: number[] = [];

  for (const vettura of vetture) {
    const giorni = calcola(vettura);

    if (giorni === null) {
      senzaData.push(vettura);
      continue;
    }

    if (giorni < 0) {
      incoerenti.push(vettura);
      continue;
    }

    const id = fasciaDi(giorni);
    fasce.find((fascia) => fascia.id === id)?.vetture.push({ ...vettura, giorni });
    giorniTutti.push(giorni);
  }

  // Dalla piu' ferma alla piu' recente: dentro una fascia si guarda prima
  // quella che aspetta da piu' tempo, che e' il motivo per cui si apre.
  for (const fascia of fasce) fascia.vetture.sort((a, b) => b.giorni - a.giorni);

  return {
    fasce,
    totale: giorniTutti.length,
    senzaData,
    incoerenti,
    // La media si fa solo su chi ha il dato: comprese le altre direbbe un
    // numero piu' basso del vero, e sembrerebbe che il parco giri.
    giorniMedi: giorniTutti.length > 0 ? Math.round(giorniTutti.reduce((s, g) => s + g, 0) / giorniTutti.length) : null,
    giorniMassimi: giorniTutti.length > 0 ? Math.max(...giorniTutti) : null,
  };
}

/** Quanto capitale e' fermo in una fascia: la somma dei prezzi che ci sono. */
export function capitaleFermo(vetture: VetturaConGiorni[]): number | null {
  const conPrezzo = vetture.filter((v) => typeof v.prezzo === "number" && Number.isFinite(v.prezzo));
  if (conPrezzo.length === 0) return null;
  return conPrezzo.reduce((somma, v) => somma + (v.prezzo ?? 0), 0);
}

/** "Bozza", "Pubblicato", "Venduto": il nome che il concessionario legge altrove. */
export function etichettaStato(stato: VehicleLifecycleState): string {
  return getVehicleStateLabel(stato);
}
