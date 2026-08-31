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
  /**
   * Quante restano fuori perche' il conto non e' completo.
   *
   * Si chiamava "senzaPrezzo", e il nome e' invecchiato male: dal 31/08/2026
   * il margine esige **anche** il prezzo di acquisto, quindi una vettura puo'
   * restare fuori pur avendo il prezzo di vendita scritto. In produzione ce
   * n'era una: venduta a 11.500, acquisto mai inserito.
   */
  senzaConto: number;
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
    senzaConto: delMese.length - conMargine.length,
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

/** Gli anni in cui c'e' stata almeno una vendita, dal piu' recente. */
export function anniConVendite(conti: ContoVenduto[]): string[] {
  const anni = new Set<string>();
  for (const conto of conti) {
    const mese = meseDi(conto.saleDate);
    if (mese) anni.add(mese.slice(0, 4));
  }
  return Array.from(anni).sort().reverse();
}

/** L'anno corrente, nella stessa forma. */
export function annoCorrente(adesso: Date = new Date()): string {
  return String(adesso.getFullYear());
}

export type RigaAnnuale = { mese: string } & RiepilogoMese;

/**
 * Il conto mese per mese di un anno, piu' il totale.
 *
 * Compaiono **solo i mesi in cui si e' venduto qualcosa**. Dodici righe di
 * zeri non raccontano niente e nascondono le poche che contano: chi vuole
 * sapere se a marzo ha venduto guarda se marzo c'e'.
 */
export function riepilogoAnnuale(conti: ContoVenduto[], anno: string): { mesi: RigaAnnuale[]; totale: RiepilogoMese } {
  const mesi = mesiConVendite(conti)
    .filter((mese) => mese.startsWith(anno))
    .sort()
    .map((mese) => ({ mese, ...riepilogoDelMese(conti, mese) }));

  const dellAnno = conti.filter((conto) => (meseDi(conto.saleDate) ?? "").startsWith(anno));
  const conMargine = dellAnno.filter((conto) => typeof conto.margin === "number" && Number.isFinite(conto.margin));

  const ricavo = conMargine.reduce((somma, conto) => somma + (conto.salePrice ?? 0), 0);
  const costo = conMargine.reduce((somma, conto) => somma + (conto.totalCost ?? 0), 0);
  const margine = conMargine.reduce((somma, conto) => somma + (conto.margin ?? 0), 0);

  return {
    mesi,
    totale: {
      venduti: dellAnno.length,
      conMargine: conMargine.length,
      senzaConto: dellAnno.length - conMargine.length,
      ricavo,
      costo,
      margine,
      marginePercentuale: ricavo > 0 ? (margine / ricavo) * 100 : null,
      marginePerVettura: conMargine.length > 0 ? margine / conMargine.length : null,
    },
  };
}

/**
 * Le vetture vendute che non appartengono a nessun mese, perche' la data di
 * vendita non c'e'.
 *
 * Non si nascondono: sono vendite vere che nessun riepilogo mostrera' mai
 * finche' quella data manca, e il concessionario deve poterle trovare per
 * completarle.
 */
export function senzaDataDiVendita(conti: ContoVenduto[]): ContoVenduto[] {
  return conti.filter((conto) => meseDi(conto.saleDate) === null);
}

/** Il nome breve del mese, per una tabella: "agosto". */
export function nomeBreveDelMese(mese: string): string {
  return nomeDelMese(mese).replace(/\s\d{4}$/, "");
}
