import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Il freno alle richieste ripetute.
 *
 * Ce ne sono due, e servono a cose diverse.
 *
 * `consumaFreno` e' quello vero: conta nel database, quindi il conteggio e'
 * uno solo per tutti i server. Su Vercel i server sono molti e usa-e-getta, e
 * un conteggio tenuto in memoria vale solo per l'istanza che l'ha in mano:
 * venti richieste mandate insieme si spalmano su istanze diverse, ognuna col
 * suo contatore azzerato, e il freno non stringe. Misurato su Postgres:
 * venti richieste in parallelo con un massimo di cinque -- **cinque passate,
 * quindici fermate**, perche' `insert ... on conflict do update` e' atomico.
 *
 * `hitRateLimit` e' quello in memoria, ed e' rimasto apposta: e' il ripiego
 * quando il database non risponde. Vedi `consumaFreno` per il perche' il
 * ripiego lascia passare invece di bloccare tutto.
 */

type RateLimitRule = {
  windowMs: number;
  maxRequests: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const RATE_LIMITS = new Map<string, RateLimitEntry>();

export function hitRateLimit(key: string, rule: RateLimitRule) {
  const now = Date.now();
  const existing = RATE_LIMITS.get(key);

  if (!existing || now >= existing.resetAt) {
    RATE_LIMITS.set(key, {
      count: 1,
      resetAt: now + rule.windowMs,
    });

    return {
      limited: false,
      remaining: rule.maxRequests - 1,
      resetAt: now + rule.windowMs,
    };
  }

  if (existing.count >= rule.maxRequests) {
    return {
      limited: true,
      remaining: 0,
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  RATE_LIMITS.set(key, existing);

  return {
    limited: false,
    remaining: Math.max(0, rule.maxRequests - existing.count),
    resetAt: existing.resetAt,
  };
}

let collegamento: SupabaseClient | null = null;
let avvisoGiaDato = false;

function collegamentoDiServizio() {
  const indirizzo = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chiaveDiServizio = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!indirizzo || !chiaveDiServizio) return null;
  if (collegamento) return collegamento;

  collegamento = createClient(indirizzo, chiaveDiServizio, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  return collegamento;
}

/** Solo per i test: fa dimenticare il collegamento gia' aperto. */
export function dimenticaIlCollegamento() {
  collegamento = null;
  avvisoGiaDato = false;
}

type RigaFreno = { superato: boolean; restanti: number; scade_il: string };

/**
 * Consuma un colpo del freno. Il conteggio e' condiviso fra tutti i server.
 *
 * **Se il database non risponde, lascia passare** ripiegando sul conteggio in
 * memoria. E' una scelta, e va detta: bloccare tutto renderebbe un guasto del
 * database una porta chiusa sui moduli pubblici -- nessuno potrebbe piu'
 * chiedere informazioni su un'auto -- e trasformerebbe un disservizio in un
 * disservizio peggiore. Il ripiego non e' niente: e' esattamente la
 * protezione che c'era prima del 06/09/2026.
 *
 * Serve anche a un secondo scopo, meno ovvio. Le modifiche al database di
 * questo progetto si applicano **a mano**, quindi fra il momento in cui il
 * codice va in produzione e quello in cui il titolare incolla la migration
 * passa del tempo: in quella finestra la funzione non esiste ancora. Senza
 * ripiego, i moduli pubblici risponderebbero errore per tutto quel tempo.
 */
export async function consumaFreno(chiave: string, regola: RateLimitRule) {
  const supabase = collegamentoDiServizio();

  if (!supabase) {
    const inMemoria = hitRateLimit(chiave, regola);
    return { limited: inMemoria.limited, resetAt: inMemoria.resetAt, condiviso: false };
  }

  try {
    const esito = await supabase.rpc("consuma_freno", {
      p_chiave: chiave,
      p_finestra_ms: regola.windowMs,
      p_massimo: regola.maxRequests,
    });

    if (esito.error) throw new Error(esito.error.message);

    const righe = esito.data as RigaFreno[] | RigaFreno | null;
    const riga = Array.isArray(righe) ? righe[0] : righe;

    if (!riga) throw new Error("consuma_freno non ha restituito niente");

    // `scade_il` arriva dal database come testo ISO. Se fosse illeggibile,
    // Retry-After diventerebbe NaN e il browser lo ignorerebbe in silenzio:
    // meglio ripiegare sulla fine della finestra calcolata da qui.
    const scade = Date.parse(riga.scade_il);

    return {
      limited: riga.superato === true,
      resetAt: Number.isFinite(scade) ? scade : Date.now() + regola.windowMs,
      condiviso: true,
    };
  } catch (errore) {
    if (!avvisoGiaDato) {
      avvisoGiaDato = true;
      console.error("freno: conteggio condiviso non disponibile, si ripiega sulla memoria del singolo server", {
        errorType: "rate_limit_fallback",
        message: errore instanceof Error ? errore.message : String(errore),
      });
    }

    const inMemoria = hitRateLimit(chiave, regola);
    return { limited: inMemoria.limited, resetAt: inMemoria.resetAt, condiviso: false };
  }
}
