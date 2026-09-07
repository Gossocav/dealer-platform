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
/**
 * Le chiavi che non escono mai da qui.
 *
 * Un errore serve a sapere **cosa** si e' rotto, non **chi** stava
 * guardando. La piattaforma non conserva gli indirizzi di rete nemmeno per
 * contare le visite: sarebbe incoerente spedirli a un servizio esterno
 * dentro il dettaglio di un errore.
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

function chiaveVietata(chiave: string) {
  const nome = chiave.toLowerCase();
  return CHIAVI_DA_NON_SPEDIRE.some((vietata) => nome.includes(vietata));
}

/**
 * Ripulisce quello che sta per partire, a qualsiasi profondita'.
 *
 * **E' la seconda rete, e serve.** `segnalaErrore` ripulisce cio' che le
 * viene passato, ma la raccolta prende **tutti** i `console.error` del
 * server -- comprese le settanta chiamate non ancora convertite e quelle che
 * verranno scritte domani. Quelle nessuno le ha ripulite, e passano di qui.
 */
export function ripuliscil(valore: unknown, profondita = 0): unknown {
  if (profondita > 6) return "[troppo profondo]";
  if (Array.isArray(valore)) return valore.map((v) => ripuliscil(v, profondita + 1));

  if (valore && typeof valore === "object") {
    const pulito: Record<string, unknown> = {};
    for (const [chiave, contenuto] of Object.entries(valore as Record<string, unknown>)) {
      if (chiaveVietata(chiave)) continue;
      pulito[chiave] = ripuliscil(contenuto, profondita + 1);
    }
    return pulito;
  }

  return valore;
}

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

/**
 * L'ultimo passaggio prima che un errore parta davvero.
 *
 * Toglie dal corpo dell'evento tutto cio' che riguarda una persona. Non
 * sostituisce la pulizia fatta a monte: la raggiunge dove quella non arriva,
 * cioe' su ogni `console.error` che nessuno ha convertito.
 */
export function primaDiSpedire<T>(evento: T): T {
  const corpo = evento as unknown as Record<string, unknown>;

  if (corpo.extra) corpo.extra = ripuliscil(corpo.extra);
  if (corpo.contexts) corpo.contexts = ripuliscil(corpo.contexts);

  // L'utente non si spedisce mai, in nessuna forma.
  delete corpo.user;

  const richiesta = corpo.request as Record<string, unknown> | undefined;
  if (richiesta) {
    delete richiesta.cookies;
    delete richiesta.headers;
    delete richiesta.data;
  }

  return evento;
}
