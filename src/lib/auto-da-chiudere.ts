/**
 * Le automobili sparite dal sito della concessionaria, in attesa di una
 * risposta: vendute o ritirate?
 *
 * Il momento in cui la piattaforma **sa** che e' successo qualcosa non e'
 * quando il concessionario cambia uno stato: e' quando la vettura sparisce dal
 * suo sito. La sincronizzazione notturna lo riconosce gia', data la sparizione
 * e toglie l'annuncio dalla vetrina.
 *
 * Quello che manca e' la sola cosa che sa soltanto lui: **a quanto l'ha
 * venduta**. Al 31/08/2026 in produzione erano tredici automobili sparite e
 * zero segnate come vendute: tredici conti economici che nessuno poteva
 * chiudere, e un archivio storico che non partiva.
 *
 * **Perche' non si chiude da sole.** Un'auto puo' sparire dal sito anche
 * perche' il concessionario l'ha tolta, perche' il sito ha avuto un intoppo o
 * perche' ha cambiato indirizzo. Segnarla venduta da sola metterebbe nei conti
 * una vendita mai avvenuta, e il margine del mese direbbe una cifra falsa. Il
 * sistema segnala, la persona conferma.
 */

export type VeicoloDaChiudere = {
  id: string;
  brand: string | null;
  model: string | null;
  version: string | null;
  price: number | null;
  status: string | null;
  import_missing_since: string | null;
};

/** Gli stati in cui una vettura non aspetta piu' nessuna risposta. */
const GIA_CHIUSI = new Set(["sold", "delivered", "archived"]);

/**
 * Aspetta una risposta se e' sparita dal sito e nessuno ha ancora detto
 * com'e' andata.
 */
export function aspettaUnaRisposta(veicolo: VeicoloDaChiudere): boolean {
  if (!veicolo.import_missing_since) return false;
  return !GIA_CHIUSI.has(String(veicolo.status ?? "").trim().toLowerCase());
}

/**
 * La data di vendita da proporre: quella in cui la vettura e' sparita dal
 * sito.
 *
 * E' una proposta, non un dato: la sparizione dice quando la piattaforma se
 * n'e' accorta, non quando e' stato firmato il contratto. Il concessionario
 * la corregge se sa la data vera, ma partire dal giorno giusto gli risparmia
 * di cercarlo per tredici automobili.
 */
export function dataDiVenditaProposta(veicolo: VeicoloDaChiudere): string {
  const grezza = String(veicolo.import_missing_since ?? "").trim();
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(grezza);
  return iso ? iso[1] : "";
}

/**
 * Il prezzo di vendita da proporre: quello a cui era esposta.
 *
 * Quasi mai e' quello vero -- si tratta sempre -- ma e' il numero da cui il
 * concessionario parte per correggere, ed e' molto piu' vicino del vuoto.
 */
export function prezzoDiVenditaProposto(veicolo: VeicoloDaChiudere): number | null {
  return typeof veicolo.price === "number" && Number.isFinite(veicolo.price) ? veicolo.price : null;
}

/** Da quanti giorni aspetta. Serve a mettere in cima le piu' vecchie. */
export function giorniDiAttesa(veicolo: VeicoloDaChiudere, adesso: Date = new Date()): number | null {
  const quando = Date.parse(String(veicolo.import_missing_since ?? ""));
  if (!Number.isFinite(quando)) return null;
  return Math.max(0, Math.floor((adesso.getTime() - quando) / 86400000));
}
