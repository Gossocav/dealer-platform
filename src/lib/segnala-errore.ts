import * as Sentry from "@sentry/nextjs";
import { indirizzoDiRaccolta } from "@/lib/sentry-config";

/**
 * Segnala un errore che il nostro codice ha gia' catturato.
 *
 * **Perche' non basta l'aggancio del framework.** `onRequestError` in
 * `src/instrumentation.ts` vede solo gli errori che nessuno cattura. Ma
 * questo progetto li cattura quasi tutti -- settantotto punti negli endpoint
 * scrivono `console.error` e restituiscono un 500 pulito, perche' e' la
 * regola della casa: un effetto collaterale fallito non fa fallire una
 * scrittura riuscita. Sono proprio quelli che serve vedere, ed erano proprio
 * quelli che sparivano.
 *
 * **Continua a scrivere nei registri.** Non sostituisce `console.error`, lo
 * comprende: i registri di Vercel restano il primo posto dove guardare
 * mentre si sta lavorando, e non dipendono da un servizio esterno.
 *
 * **Non solleva mai.** E' chiamata dentro i blocchi che gestiscono un
 * guasto: se fallisse la segnalazione di un errore, il guasto diventerebbe
 * due, e il secondo lo vedrebbe l'utente.
 */

type Dettagli = Record<string, unknown>;

/**
 * I dati che non escono da qui.
 *
 * Un errore serve a sapere **cosa** si e' rotto, non **chi** stava
 * guardando. La piattaforma ha gia' deciso di non conservare gli indirizzi di
 * rete quando ha costruito il conteggio delle visite: sarebbe incoerente
 * spedirli a un servizio esterno dentro il dettaglio di un errore.
 */
const CHIAVI_DA_NON_SPEDIRE = [
  "email",
  "phone",
  "telefono",
  "password",
  "token",
  "authorization",
  "first_name",
  "last_name",
  "nome",
  "cognome",
  "ip",
  "indirizzo",
  "address",
  "message",
  "messaggio",
];

/** Toglie dal dettaglio tutto cio' che riguarda una persona. */
export function ripuliscilDettaglio(dettagli: Dettagli): Dettagli {
  const pulito: Dettagli = {};

  for (const [chiave, valore] of Object.entries(dettagli)) {
    const nome = chiave.toLowerCase();
    if (CHIAVI_DA_NON_SPEDIRE.some((vietata) => nome.includes(vietata))) continue;
    pulito[chiave] = valore;
  }

  return pulito;
}

export function segnalaErrore(contesto: string, errore: unknown, dettagli: Dettagli = {}) {
  const puliti = ripuliscilDettaglio(dettagli);
  const messaggio = errore instanceof Error ? errore.message : String(errore);

  console.error(contesto, { ...puliti, message: messaggio });

  if (!indirizzoDiRaccolta()) return;

  try {
    Sentry.captureException(errore instanceof Error ? errore : new Error(`${contesto}: ${messaggio}`), {
      // Il contesto e' l'etichetta con cui si raggruppano: "visita",
      // "admin/visite", "plate-lookup". Serve a rispondere alla prima domanda
      // che ci si fa guardando l'elenco, cioe' "quale pezzo si e' rotto".
      tags: { contesto },
      extra: puliti,
    });
  } catch {
    // Una segnalazione che non parte non deve diventare il secondo guasto.
  }
}
