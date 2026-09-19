/**
 * Quanto si mostra della descrizione di un annuncio, prima di chiedere.
 *
 * **Il difetto, misurato il 18/09/2026 su 279 annunci pubblicati.** La
 * descrizione si disegnava per intero: sul telefono la mediana era circa
 * **390 pixel**, ma trenta schede superavano i mille caratteri e la peggiore
 * arrivava a **~1400 pixel -- due schermate piene di solo testo**, fra le
 * fotografie e la scheda tecnica. Chi cercava i dati dell'auto doveva
 * scorrere oltre.
 *
 * Il testo arriva cosi' dal sito della concessionaria: su 35 schede e' un
 * elenco di dotazioni riga per riga ("-SCHERMO DA 14.4"", "-CERCHI IN LEGA"),
 * su 93 e' un discorso unico.
 *
 * **Perche' non si raggruppano le dotazioni.** Sembrerebbe la cosa giusta, e
 * non si puo' fare: la colonna `equipment` e' **vuota su 278 schede su 279**.
 * Quell'elenco esiste solo come testo dentro la descrizione, e separarlo dal
 * discorso vorrebbe dire indovinare dove finisce l'uno e comincia l'altro nel
 * testo scritto da un concessionario. Un'ipotesi che sbaglia su un'auto sola
 * e nessuno se ne accorge.
 */

/** Le righe che si vedono senza aprire. A leading-7 sono circa 140 pixel. */
export const RIGHE_DESCRIZIONE_VISIBILI = 5;

/**
 * Se vale la pena accorciarla. Su una descrizione che ci sta gia' tutta,
 * "Mostra tutta la descrizione" e' un invito a non fare niente.
 *
 * La soglia in caratteri e' quella del **telefono**, dove il problema esiste:
 * circa trentatre caratteri per riga su uno schermo stretto, quindi cinque
 * righe sono centosessantacinque caratteri. Si lascia un po' di margine.
 */
export function descrizioneVaAccorciata(testo: unknown): boolean {
  const pulito = String(testo ?? "").trim();
  if (!pulito) return false;
  const righe = pulito.split(/\r?\n/).filter((riga) => riga.trim()).length;
  return righe > RIGHE_DESCRIZIONE_VISIBILI || pulito.length > 180;
}
