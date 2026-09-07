import { ripuliscil } from "@/lib/sentry-config";

/**
 * Segnala un errore che il nostro codice ha gia' catturato.
 *
 * **Non spedisce niente da se'.** La raccolta prende ogni `console.error`
 * del server (`captureConsoleIntegration`, in `src/instrumentation.ts`):
 * spedire anche di qui vorrebbe dire due segnalazioni per lo stesso guasto,
 * e un elenco che conta doppio non si guarda con fiducia.
 *
 * Quello che aggiunge, e che una `console.error` scritta a mano non da':
 *
 * 1. **l'errore vero al posto giusto**, cosi' arriva con la sua traccia di
 *    esecuzione invece che come una riga di testo;
 * 2. **l'etichetta davanti** -- "marketplace/lead", "visita" -- che e' il
 *    modo in cui gli errori si raggruppano, e risponde alla prima domanda
 *    che ci si fa guardando l'elenco: quale pezzo si e' rotto;
 * 3. **la pulizia dei dati personali prima dei registri**, non solo prima
 *    della spedizione: nei registri di Vercel resterebbero comunque.
 *
 * **Non solleva mai.** E' chiamata dentro i blocchi che gestiscono un
 * guasto: se fallisse la segnalazione, il guasto diventerebbe due, e il
 * secondo lo vedrebbe l'utente.
 */

type Dettagli = Record<string, unknown>;

/**
 * Toglie dal dettaglio tutto cio' che riguarda una persona.
 *
 * L'elenco delle chiavi vietate sta in `sentry-config`, **sorgente unica**:
 * la stessa pulizia vale come ultimo controllo su cio' che parte, e due
 * elenchi che dovrebbero restare uguali prima o poi divergono.
 */
export function ripuliscilDettaglio(dettagli: Dettagli): Dettagli {
  return ripuliscil(dettagli) as Dettagli;
}

export function segnalaErrore(contesto: string, errore: unknown, dettagli: Dettagli = {}) {
  console.error(`${contesto}:`, errore, ripuliscilDettaglio(dettagli));
}
