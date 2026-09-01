/**
 * Come si scrive una cifra dentro un riquadro che non puo' allargarsi.
 *
 * Il difetto da cui nasce questo file: nelle Statistiche "Valore totale parco
 * auto" era scritto sempre della stessa misura, `text-3xl`. Con 250 vetture in
 * piazzale quella casella arriva a sette cifre piu' il simbolo -- "3.750.000
 * €" -- e usciva dal bordo del riquadro, sovrapponendosi a quello accanto. Un
 * numero che non si legge per intero e' peggio di un numero assente: chi
 * guarda ne legge una parte e la scambia per il totale.
 *
 * La misura si sceglie da quanto e' lunga la cifra, non a occhio: cosi' vale
 * anche per la concessionaria che domani avra' il doppio del parco.
 */

/**
 * La classe della grandezza, scelta sulla lunghezza di quello che c'e' da
 * scrivere. I gradini sono quattro e scendono piano: il salto da un riquadro
 * all'altro deve restare poco visibile, altrimenti la griglia sembra storta.
 */
export function dimensioneCifra(testo: string): string {
  const lunghezza = String(testo ?? "").trim().length;

  if (lunghezza <= 7) return "text-3xl";
  if (lunghezza <= 10) return "text-2xl";
  if (lunghezza <= 13) return "text-xl";
  return "text-lg";
}

/**
 * Un importo in euro senza centesimi: "3.750.000 €".
 *
 * I centesimi hanno senso sul margine di una vettura, non sul valore di tutto
 * il piazzale: allungano la cifra di tre caratteri e non dicono niente. Il
 * simbolo sta in fondo, come lo scrive un italiano, e non davanti come faceva
 * la pagina prima.
 */
export function formattaEuroTondo(valore: number | null | undefined): string {
  if (typeof valore !== "number" || !Number.isFinite(valore)) return "—";
  return `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0, useGrouping: true }).format(Math.round(valore))} €`;
}

/**
 * Una quantita' con il separatore delle migliaia: "1.412".
 *
 * Il raggruppamento si chiede esplicitamente: lasciato all'impostazione
 * predefinita, l'italiano non separa i numeri di quattro cifre e "1412"
 * finiva accanto a "18.500" nella stessa griglia, scritti in due modi diversi.
 */
export function formattaNumero(valore: number | null | undefined): string {
  if (typeof valore !== "number" || !Number.isFinite(valore)) return "—";
  return new Intl.NumberFormat("it-IT", { useGrouping: true }).format(valore);
}

/**
 * Quanta parte del totale e' una quantita', da 0 a 100.
 *
 * Torna null quando il totale e' zero: dividere per zero darebbe NaN, che a
 * schermo diventa "NaN%" -- ed e' successo altrove su questa piattaforma.
 */
export function quotaPercentuale(parte: number, totale: number): number | null {
  if (!Number.isFinite(parte) || !Number.isFinite(totale) || totale <= 0) return null;
  return (parte / totale) * 100;
}
