/**
 * La configurazione della raccolta errori. **Sorgente unica.**
 *
 * Chiesta dal titolare il 06/09/2026: fino a ieri le settantotto
 * segnalazioni d'errore sparse negli endpoint finivano nei registri di
 * Vercel, che si svuotano da soli. Se un endpoint smetteva di funzionare di
 * notte, la mattina dopo non ne restava traccia.
 *
 * **Si raccoglie solo dal server, non dal browser.** Il pezzo di Sentry che
 * gira nel browser pesa decine di chilobyte e andrebbe scaricato da chiunque
 * apra un annuncio: sarebbe una parte del lavoro fatto sulle fotografie
 * (4,7 MB -> 0,4 MB per pagina) restituita indietro. E gli errori che
 * contano -- un endpoint che smette di rispondere, il database che non
 * risponde, mille tentativi di accesso -- succedono tutti di qua. Restando
 * sul server, per giunta, non serve toccare ne' la Content-Security-Policy
 * ne' il banner dei cookie: non parte niente dal browser di nessuno.
 *
 * **Senza indirizzo di raccolta non si accende niente.** In locale e nelle
 * copie di prova la variabile non c'e', e la raccolta resta spenta invece di
 * riempire il progetto vero di errori inventati dalle prove.
 */

/** L'indirizzo dove Sentry riceve. Si imposta su Vercel, non nel codice. */
export function indirizzoDiRaccolta(): string | null {
  const valore = String(process.env.SENTRY_DSN ?? "").trim();
  return valore.length > 0 ? valore : null;
}

/**
 * Le opzioni comuni ai due ambienti in cui gira il nostro server.
 *
 * `sendDefaultPii` resta **falso**: senza, Sentry allegherebbe da se'
 * l'indirizzo di rete di chi ha fatto la richiesta e le intestazioni, cioe'
 * proprio i dati che questa piattaforma ha deciso di non conservare quando ha
 * costruito il conteggio delle visite. Un errore serve a sapere *cosa* si e'
 * rotto, non *chi* stava guardando.
 */
export function opzioniDiRaccolta() {
  return {
    dsn: indirizzoDiRaccolta() ?? undefined,
    sendDefaultPii: false,
    // L'ambiente separa gli errori della produzione da quelli delle
    // anteprime: senza, un difetto di un ramo di prova sembrerebbe un
    // guasto del sito vero.
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    // La versione del codice da cui arriva l'errore. Su Vercel e' il commit:
    // serve a sapere se un difetto e' comparso con l'ultimo rilascio.
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    // Nessuna misura di prestazioni: costa richieste e non risponde alla
    // domanda che ci siamo posti, che e' "cosa si e' rotto".
    tracesSampleRate: 0,
  };
}
