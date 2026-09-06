import type { Instrumentation } from "next";

/**
 * L'aggancio con cui Next avvia gli strumenti di osservazione.
 *
 * Next 16 chiama `register()` una volta sola all'avvio di ogni istanza del
 * server, e `onRequestError` ogni volta che una richiesta finisce con un
 * errore non catturato. Sono le due porte previste dal framework: non c'e'
 * niente da agganciare a mano.
 *
 * L'importazione di Sentry e' **dentro** `register` e non in cima al file di
 * proposito: il file viene caricato in tutti gli ambienti, compreso quello
 * ristretto del Proxy, e importare in cima farebbe entrare il pacchetto anche
 * dove non serve.
 */
export async function register() {
  const { indirizzoDiRaccolta, opzioniDiRaccolta } = await import("@/lib/sentry-config");

  // Senza indirizzo non si accende: in locale e nelle prove la raccolta resta
  // spenta invece di sporcare il progetto vero.
  if (!indirizzoDiRaccolta()) return;

  const Sentry = await import("@sentry/nextjs");
  Sentry.init(opzioniDiRaccolta());
}

/**
 * Gli errori che il framework cattura da se': una pagina che esplode mentre
 * viene costruita, un endpoint che solleva senza catturare.
 *
 * Gli errori che il nostro codice cattura e registra da solo -- e sono la
 * maggior parte, settantotto -- non passano di qui: quelli li manda
 * `segnalaErrore`.
 */
export const onRequestError: Instrumentation.onRequestError = async (...argomenti) => {
  const { indirizzoDiRaccolta } = await import("@/lib/sentry-config");
  if (!indirizzoDiRaccolta()) return;

  const Sentry = await import("@sentry/nextjs");
  await Sentry.captureRequestError(...argomenti);
};
