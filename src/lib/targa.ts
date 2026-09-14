/**
 * La forma di una targa italiana, in un posto solo.
 *
 * **Perche' serve.** Leggendo le schede dei siti delle concessionarie il
 * 14/09/2026, su 62 targhe pubblicate **due valevano `XXX` e `XXXX`**: dei
 * segnaposto lasciati nel gestionale del concessionario. Scritte nel nostro
 * archivio diventerebbero indistinguibili da una targa vera, e una targa
 * sbagliata e' peggio di una mancante:
 *
 * - la ricerca a pagamento (`/api/vehicles/plate-lookup`) e' a consumo: ogni
 *   interrogazione si paga, anche quando la targa non esiste;
 * - la targa e' una delle due chiavi con cui una vettura si puo' segnare
 *   venduta (`auto-da-chiudere.ts`) e con cui si raggruppano i documenti
 *   (`archivio-documenti.ts`): sbagliata, aggancia la scheda sbagliata;
 * - chi la legge sul foglio di consegna la copia su un contratto.
 *
 * Fino ad oggi il controllo esisteva **solo** dentro la rotta della ricerca a
 * pagamento, e valeva solo per il formato moderno: la casella "Targa" della
 * scheda veicolo accettava qualunque cosa.
 *
 * **Le lettere ammesse sono 22, non 26.** Le targhe italiane non usano I, O,
 * Q, U: si confondono con 1, 0 e con le altre lettere. Un controllo che le
 * accettasse lascerebbe passare `IO123QU`, che non e' mai esistita.
 */

/** Le lettere che le targhe italiane usano davvero. */
const LETTERE = "ABCDEFGHJKLMNPRSTVWXYZ";
const L = `[${LETTERE}]`;

/**
 * I formati riconosciuti, in ordine di quanto sono frequenti su un piazzale.
 *
 * Le storiche (targa provinciale, fino al 1994) servono alle vetture d'epoca,
 * che una concessionaria tratta di rado ma tratta: rifiutarle vorrebbe dire
 * costringere chi ce l'ha a lasciare il campo vuoto.
 */
const FORMATI: Array<{ nome: string; forma: RegExp }> = [
  // AA000AA, dal 1994. E' la targa di quasi tutto quello che passa di qui.
  { nome: "auto", forma: new RegExp(`^${L}{2}\\d{3}${L}{2}$`) },
  // AA00000, motocicli dal 1999.
  { nome: "moto", forma: new RegExp(`^${L}{2}\\d{5}$`) },
  // Sigla della provincia piu' il numero, fino al 1994: MI123456, ROMA12345.
  //
  // Qui le lettere sono tutte e ventisei, non ventidue: il divieto di I, O, Q
  // e U vale per le targhe **moderne**, mentre le sigle delle province le
  // usano eccome -- MI, BO, TO, AQ, PU. Il primo tentativo di questo file le
  // escludeva anche qui, e rifiutava Milano.
  { nome: "storica", forma: /^([A-Z]{2}|ROMA)\d{3,6}$/ },
];

/**
 * Toglie spazi, trattini e punti e porta in maiuscolo: "ab 123 cd" e
 * "AB-123-CD" sono la stessa targa scritta da due persone diverse.
 */
export function normalizzaTarga(valore: unknown): string {
  return String(valore ?? "").toUpperCase().replace(/[\s.\-_]/g, "");
}

export type EsitoTarga =
  /** Il campo e' vuoto: e' un'assenza, non un errore. */
  | { stato: "vuota" }
  | { stato: "valida"; targa: string; formato: string }
  /** Non e' una targa italiana: non si salva come targa, si dice. */
  | { stato: "non-valida"; targa: string; motivo: string };

/**
 * Che cosa e' stato scritto nella casella "Targa".
 *
 * **Un campo vuoto non e' un errore**, ed e' la distinzione che conta: una
 * vettura importata dal sito non ha quasi mai la targa, e nessuno deve essere
 * costretto a inventarsene una per salvare la scheda.
 */
export function esitoTarga(valore: unknown): EsitoTarga {
  const targa = normalizzaTarga(valore);
  if (!targa) return { stato: "vuota" };

  const formato = FORMATI.find(({ forma }) => forma.test(targa));
  if (formato) return { stato: "valida", targa, formato: formato.nome };

  // Il motivo si scrive per esteso: "non valida" da solo lascia chi legge a
  // indovinare se ha sbagliato a digitare o se il formato non e' previsto.
  const conLettereVietate = /[IOQU]/.test(targa);
  const motivo = conLettereVietate
    ? "le targhe italiane non usano le lettere I, O, Q e U"
    : "la forma prevista e' AA123BB per le auto, AB12345 per le moto";

  return { stato: "non-valida", targa, motivo };
}

/** Vera solo per una targa di forma italiana riconosciuta. */
export function targaValida(valore: unknown): boolean {
  return esitoTarga(valore).stato === "valida";
}

/**
 * La targa come va scritta nell'archivio: normalizzata se valida, `null` se
 * vuota. **Una targa non valida non arriva mai qui**: chi salva si ferma
 * prima e lo dice, invece di scriverla e lasciarla scoprire fra sei mesi.
 */
export function targaDaSalvare(valore: unknown): string | null {
  const esito = esitoTarga(valore);
  return esito.stato === "valida" ? esito.targa : null;
}

/** Il messaggio da mettere sotto la casella. Null quando non c'e' niente da dire. */
export function messaggioTarga(valore: unknown): string | null {
  const esito = esitoTarga(valore);
  if (esito.stato !== "non-valida") return null;
  return `"${esito.targa}" non sembra una targa: ${esito.motivo}.`;
}
