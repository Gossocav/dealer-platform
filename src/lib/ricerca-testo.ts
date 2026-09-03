/**
 * Quello che si scrive dentro un `ilike` di Postgres.
 *
 * I caratteri jolly di chi cerca vanno spenti: un testo che contiene "%"
 * cercherebbe qualunque cosa, e "_" qualunque carattere singolo -- due
 * risultati che nessuno si aspetta scrivendo il nome di un'auto o una targa.
 *
 * Sta in un modulo suo perche' lo usano due ricerche diverse (le perizie e
 * l'archivio documenti) e ne arriveranno altre: due copie di questa riga
 * divergerebbero al primo carattere che qualcuno si dimentica.
 */
export function perRicercaParziale(testo: string) {
  return `%${testo.replace(/[\\%_]/g, (carattere) => `\\${carattere}`)}%`;
}
