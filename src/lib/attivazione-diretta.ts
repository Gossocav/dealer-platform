/**
 * Come si riconosce una concessionaria attivata direttamente su un piano.
 *
 * L'attivazione diretta riusa la macchina della prova gratuita -- si crea una
 * richiesta, la si attiva, la si converte al piano -- perche' quelle due
 * azioni sono in produzione da mesi e sanno rimettere le cose a posto quando
 * qualcosa va storto. Il concessionario pero' non ha mai chiesto nessuna
 * prova, e non deve accorgersi che dietro le quinte ne e' passata una: il
 * 02/09/2026, alla prima attivazione diretta vera (Ponginibbi, piano Base),
 * gli sono arrivate **due email nello stesso momento** -- "Demo KeyAuto
 * attivata, 7 giorni, massimo 10 veicoli" e "il tuo account e stato attivato
 * definitivamente" -- prima ancora che avesse impostato la password.
 *
 * La nota resta scritta nella richiesta, quindi il riconoscimento vale anche
 * se la conversione viene finita a mano il giorno dopo dalle Richieste demo:
 * un contrassegno passato dal browser servirebbe solo al giro in cui si preme
 * il pulsante.
 */

/** La nota che l'attivazione diretta scrive nella richiesta. */
export const NOTA_ATTIVAZIONE_DIRETTA =
  "Attivazione diretta dal pannello amministrativo: la concessionaria non ha chiesto la prova.";

/**
 * Vero se questa richiesta e' nata da un'attivazione diretta, cioe' se il
 * concessionario non ha mai chiesto una prova e non deve ricevere le email
 * che la raccontano.
 */
export function eAttivazioneDiretta(messaggio: string | null | undefined) {
  return String(messaggio ?? "").includes(NOTA_ATTIVAZIONE_DIRETTA);
}
