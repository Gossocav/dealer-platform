/**
 * Il conto del mese: quanto ha venduto, quanto ci ha guadagnato.
 *
 * Legge i conti economici delle vetture vendute e li mette insieme. Il
 * principio che governa tutto il modulo e' uno solo, ed e' lo stesso della
 * scheda del singolo veicolo: **un dato che manca non vale zero**.
 *
 * Un'automobile chiusa senza prezzo di vendita -- cosa permessa apposta, i
 * conti sono a discrezione del concessionario -- non ha margine. Contarla
 * come margine zero abbasserebbe la media di tutte le altre e direbbe una
 * cifra falsa. Resta fuori dal calcolo, e si dice quante sono: un numero
 * accanto al quale c'e' scritto "di cui due senza prezzo" e' un numero di cui
 * ci si puo' fidare.
 */

export type ContoVenduto = {
  vehicleId: string;
  etichetta: string;
  saleDate: string | null;
  salePrice: number | null;
  totalCost: number | null;
  margin: number | null;
};

export type RiepilogoMese = {
  /** Quante vetture risultano vendute nel mese, comprese quelle senza prezzo. */
  venduti: number;
  /** Di quelle, quante hanno il prezzo e quindi entrano nei conti. */
  conMargine: number;
  /** Quante restano fuori perche' il prezzo non c'e'. */
  senzaPrezzo: number;
  ricavo: number;
  costo: number;
  margine: number;
  /** Il margine sul venduto, in percentuale. Null se non c'e' ricavo. */
  marginePercentuale: number | null;
  /** Il margine medio per vettura, contando solo quelle che ce l'hanno. */
  marginePerVettura: number | null;
};

/** "2026-08" da una data, per raggruppare per mese. */
export function meseDi(data: string | null | undefined): string | null {
  const trovato = /^(\d{4})-(\d{2})/.exec(String(data ?? "").trim());
  return trovato ? `${trovato[1]}-${trovato[2]}` : null;
}

/** Il mese corrente, nella stessa forma. */
export function meseCorrente(adesso: Date = new Date()): string {
  return `${adesso.getFullYear()}-${String(adesso.getMonth() + 1).padStart(2, "0")}`;
}

/** I mesi in cui c'e' stata almeno una vendita, dal piu' recente. */
export function mesiConVendite(conti: ContoVenduto[]): string[] {
  const mesi = new Set<string>();
  for (const conto of conti) {
    const mese = meseDi(conto.saleDate);
    if (mese) mesi.add(mese);
  }
  return Array.from(mesi).sort().reverse();
}

/**
 * Il riepilogo di un mese.
 *
 * Chi non ha una data di vendita non appartiene a nessun mese e non compare
 * da nessuna parte: una vettura venduta senza data non e' "venduta ad agosto",
 * e attribuirgliela d'ufficio sposterebbe soldi da un mese all'altro.
 */
export function riepilogoDelMese(conti: ContoVenduto[], mese: string): RiepilogoMese {
  const delMese = conti.filter((conto) => meseDi(conto.saleDate) === mese);
  const conMargine = delMese.filter((conto) => typeof conto.margin === "number" && Number.isFinite(conto.margin));

  const ricavo = conMargine.reduce((somma, conto) => somma + (conto.salePrice ?? 0), 0);
  const costo = conMargine.reduce((somma, conto) => somma + (conto.totalCost ?? 0), 0);
  const margine = conMargine.reduce((somma, conto) => somma + (conto.margin ?? 0), 0);

  return {
    venduti: delMese.length,
    conMargine: conMargine.length,
    senzaPrezzo: delMese.length - conMargine.length,
    ricavo,
    costo,
    margine,
    marginePercentuale: ricavo > 0 ? (margine / ricavo) * 100 : null,
    marginePerVettura: conMargine.length > 0 ? margine / conMargine.length : null,
  };
}

/**
 * Le vetture che hanno reso di piu' e quelle che hanno reso di meno.
 *
 * Solo quelle con un margine: le altre non sono "le peggiori", sono quelle di
 * cui non sappiamo niente, e metterle in fondo a una classifica sarebbe un
 * giudizio inventato.
 */
export function migliori(conti: ContoVenduto[], quante = 3): ContoVenduto[] {
  return conti
    .filter((conto) => typeof conto.margin === "number" && Number.isFinite(conto.margin))
    .sort((a, b) => (b.margin ?? 0) - (a.margin ?? 0))
    .slice(0, quante);
}

export function peggiori(conti: ContoVenduto[], quante = 3): ContoVenduto[] {
  return conti
    .filter((conto) => typeof conto.margin === "number" && Number.isFinite(conto.margin))
    .sort((a, b) => (a.margin ?? 0) - (b.margin ?? 0))
    .slice(0, quante);
}

/** Le vetture vendute in perdita: quelle su cui serve guardare. */
export function inPerdita(conti: ContoVenduto[]): ContoVenduto[] {
  return conti.filter((conto) => typeof conto.margin === "number" && conto.margin < 0);
}

/** Il mese scritto come lo legge un italiano: "agosto 2026". */
export function nomeDelMese(mese: string): string {
  const trovato = /^(\d{4})-(\d{2})$/.exec(mese);
  if (!trovato) return mese;

  const nomi = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
  ];
  const indice = Number(trovato[2]) - 1;
  return indice >= 0 && indice < 12 ? `${nomi[indice]} ${trovato[1]}` : mese;
}
