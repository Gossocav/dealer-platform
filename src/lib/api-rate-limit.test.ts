import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClientMock }));

import { consumaFreno, dimenticaIlCollegamento, hitRateLimit } from "./api-rate-limit";

/**
 * Il freno alle richieste ripetute.
 *
 * **Quale difetto impedisce.** Fino al 06/09/2026 il conteggio stava in una
 * `Map` dentro il processo. Su Vercel i server sono molti e usa-e-getta:
 * richieste mandate insieme finiscono su istanze diverse, ognuna col suo
 * contatore azzerato. Il freno c'era e non stringeva -- che e' peggio di non
 * averlo, perche' si crede di essere protetti.
 *
 * L'atomicita' vera la garantisce Postgres (`insert ... on conflict do
 * update`), ed e' stata misurata sul database vero prima di spedire: venti
 * richieste in parallelo con un massimo di cinque, cinque passate e quindici
 * fermate. Qui si prova quello che sta dalla parte del codice: che la
 * risposta del database venga letta bene, e soprattutto **cosa succede
 * quando il database non risponde**.
 */

const REGOLA = { windowMs: 60_000, maxRequests: 3 };

function collegamentoFinto() {
  return { rpc: mocks.rpcMock };
}

beforeEach(() => {
  vi.clearAllMocks();
  dimenticaIlCollegamento();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "chiave-di-prova");
  mocks.createClientMock.mockReturnValue(collegamentoFinto());
});

afterEach(() => {
  vi.unstubAllEnvs();
  dimenticaIlCollegamento();
});

describe("il conteggio e' uno solo per tutti i server", () => {
  it("chiede al database, con la chiave e i limiti giusti", async () => {
    mocks.rpcMock.mockResolvedValue({
      data: [{ superato: false, restanti: 2, scade_il: new Date(Date.now() + 60_000).toISOString() }],
      error: null,
    });

    const esito = await consumaFreno("prova:1.2.3.4", REGOLA);

    expect(esito.limited).toBe(false);
    expect(esito.condiviso, "ha contato in memoria invece che nel database").toBe(true);
    expect(mocks.rpcMock).toHaveBeenCalledWith("consuma_freno", {
      p_chiave: "prova:1.2.3.4",
      p_finestra_ms: 60_000,
      p_massimo: 3,
    });
  });

  it("quando il database dice che il limite e' superato, ferma", async () => {
    mocks.rpcMock.mockResolvedValue({
      data: [{ superato: true, restanti: 0, scade_il: new Date(Date.now() + 30_000).toISOString() }],
      error: null,
    });

    expect((await consumaFreno("prova", REGOLA)).limited).toBe(true);
  });

  it("legge la risposta anche quando arriva come riga singola invece che come elenco", async () => {
    // PostgREST restituisce un oggetto invece di un array quando la funzione
    // dichiara `returns table` con una riga sola: dipende da come e' chiamata.
    // Leggerne uno solo dei due modi darebbe "niente" e farebbe ripiegare
    // sempre sulla memoria, cioe' il difetto tornerebbe senza farsi vedere.
    mocks.rpcMock.mockResolvedValue({
      data: { superato: true, restanti: 0, scade_il: new Date(Date.now() + 30_000).toISOString() },
      error: null,
    });

    const esito = await consumaFreno("prova", REGOLA);

    expect(esito.limited).toBe(true);
    expect(esito.condiviso).toBe(true);
  });

  it("il momento in cui riprovare arriva dal database", async () => {
    const scade = Date.now() + 45_000;
    mocks.rpcMock.mockResolvedValue({
      data: [{ superato: true, restanti: 0, scade_il: new Date(scade).toISOString() }],
      error: null,
    });

    expect((await consumaFreno("prova", REGOLA)).resetAt).toBe(scade);
  });

  it("una data illeggibile non manda in tilt Retry-After", async () => {
    // Con NaN il browser ignorerebbe l'intestazione in silenzio.
    mocks.rpcMock.mockResolvedValue({
      data: [{ superato: true, restanti: 0, scade_il: "non una data" }],
      error: null,
    });

    const esito = await consumaFreno("prova", REGOLA);

    expect(Number.isFinite(esito.resetAt)).toBe(true);
    expect(esito.resetAt).toBeGreaterThan(Date.now());
  });
});

describe("quando il database non risponde si ripiega, e si lascia passare", () => {
  /**
   * E' una scelta, non una dimenticanza. Bloccare tutto renderebbe un guasto
   * del database una porta chiusa sui moduli pubblici: nessuno potrebbe piu'
   * chiedere informazioni su un'auto. Il ripiego non e' niente -- e'
   * esattamente la protezione che c'era prima.
   *
   * Serve anche alla finestra fra il rilascio del codice e il momento in cui
   * il titolare incolla la migration a mano: li' la funzione non esiste
   * ancora.
   */
  it("se la funzione non esiste ancora nel database, i moduli continuano a funzionare", async () => {
    mocks.rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'function public.consuma_freno(text, integer, integer) does not exist' },
    });

    const esito = await consumaFreno("ripiego:nuovo", REGOLA);

    expect(esito.limited, "il modulo pubblico e' stato chiuso").toBe(false);
    expect(esito.condiviso).toBe(false);
  });

  it("ma il ripiego frena davvero: non e' un via libera", async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: { message: "database irraggiungibile" } });

    const chiave = `ripiego:frena:${Math.random()}`;
    const esiti = [];
    for (let colpo = 0; colpo < 5; colpo += 1) {
      esiti.push((await consumaFreno(chiave, REGOLA)).limited);
    }

    expect(esiti, "il ripiego lascia passare tutto").toEqual([false, false, false, true, true]);
  });

  it("senza le variabili d'ambiente non tenta nemmeno di collegarsi", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    dimenticaIlCollegamento();

    const esito = await consumaFreno(`senza-env:${Math.random()}`, REGOLA);

    expect(esito.condiviso).toBe(false);
    expect(mocks.rpcMock).not.toHaveBeenCalled();
  });
});

describe("il freno in memoria, che resta come ripiego", () => {
  it("conta e ferma sulla soglia", () => {
    const chiave = `memoria:${Math.random()}`;
    const esiti = [];
    for (let colpo = 0; colpo < 5; colpo += 1) esiti.push(hitRateLimit(chiave, REGOLA).limited);

    expect(esiti).toEqual([false, false, false, true, true]);
  });

  it("due chiavi diverse non si disturbano", () => {
    const a = `memoria:a:${Math.random()}`;
    const b = `memoria:b:${Math.random()}`;
    for (let colpo = 0; colpo < 4; colpo += 1) hitRateLimit(a, REGOLA);

    expect(hitRateLimit(a, REGOLA).limited).toBe(true);
    expect(hitRateLimit(b, REGOLA).limited).toBe(false);
  });
});

describe("nessun endpoint torna al conteggio locale", () => {
  /**
   * Si legge il sorgente perche' la cosa da fissare e' una **decisione**: che
   * il conteggio sia condiviso. Un endpoint nuovo scritto copiando un vecchio
   * userebbe `hitRateLimit` -- e' li', esportato, e funziona -- ottenendo un
   * freno che sembra esserci e non stringe. E' proprio il difetto che si e'
   * corretto il 06/09/2026: non un freno assente, un freno che non frena.
   */
  it("le rotte usano consumaFreno, mai hitRateLimit", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { resolve } = await import("node:path");

    const rotte = (function cerca(dir: string): string[] {
      return readdirSync(dir).flatMap((voce) => {
        const percorso = resolve(dir, voce);
        if (statSync(percorso).isDirectory()) return cerca(percorso);
        return voce === "route.ts" ? [percorso] : [];
      });
    })(resolve(process.cwd(), "src/app/api"));

    expect(rotte.length).toBeGreaterThan(20);

    for (const percorso of rotte) {
      const codice = readFileSync(percorso, "utf8");
      const nome = percorso.slice(percorso.indexOf("api/"));

      expect(codice, `${nome} conta in memoria: su Vercel quel freno non stringe`).not.toMatch(
        /\bhitRateLimit\s*\(/
      );
    }
  });
});
