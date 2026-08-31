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
  /** La targa e il telaio: su una vettura importata sono quasi sempre vuoti. */
  plate: string | null;
  vin: string | null;
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

/** Da quanti giorni aspetta. Serve a mettere in cima le piu' vecchie. */
export function giorniDiAttesa(veicolo: VeicoloDaChiudere, adesso: Date = new Date()): number | null {
  const quando = Date.parse(String(veicolo.import_missing_since ?? ""));
  if (!Number.isFinite(quando)) return null;
  return Math.max(0, Math.floor((adesso.getTime() - quando) / 86400000));
}

/**
 * Si puo' segnare venduta?
 *
 * Serve la targa **oppure** il telaio, e nient'altro. Sono l'unica cosa che
 * dice *quale* automobile e' stata venduta: marca e modello si ripetono -- al
 * 31/08/2026 in produzione c'erano cinque "Peugeot 2008 Allure PureTech 100
 * S&S" identiche in tutto -- e senza uno dei due, fra sei mesi, l'archivio
 * delle vendite non e' piu' ricostruibile.
 *
 * I conti economici **non** entrano in questa regola. Pretenderli
 * costringerebbe a inventare una cifra pur di chiudere la riga, ed e' il modo
 * piu' sicuro di riempire l'archivio di numeri falsi: quanto e' costata e a
 * quanto e' stata venduta le scrive il concessionario se e quando vuole.
 *
 * La stessa regola vive anche nel database, come trigger
 * (20260831020000_targa_obbligatoria_su_venduto.sql): lo stato si cambia da
 * piu' punti, e una regola scritta in uno solo prima o poi si aggira.
 */
export function puoEssereSegnataVenduta(input: { targa?: string | null; telaio?: string | null }): boolean {
  return String(input.targa ?? "").trim().length > 0 || String(input.telaio ?? "").trim().length > 0;
}
