/**
 * Rende innocuo un testo scritto da qualcun altro, prima di infilarlo dentro
 * il codice di un'email.
 *
 * Le email di questa piattaforma si compongono incollando dati dentro
 * dell'HTML: il nome della concessionaria, il referente, il messaggio scritto
 * nel modulo. Quei dati li scrive chi si registra, e in un'email lette dal
 * titolare o dal concessionario finiscono cosi' come sono: un nome che
 * contiene un pezzo di codice, anche solo per errore, sfonda l'impaginazione
 * del messaggio.
 *
 * La stessa funzione era scritta tre volte, identica, in tre file diversi, e
 * il quarto posto che ne aveva bisogno -- le email dell'attivazione -- non
 * l'ha copiata: e' il difetto trovato il 02/09/2026. Da qui in avanti sta in
 * un posto solo, cosi' chi scrive una email nuova la trova.
 */
export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
