import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  elencoStockMock: vi.fn(),
  leggiPaginaMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClientMock }));

vi.mock("@/lib/dealer-site-fetch", () => ({
  elencoStock: mocks.elencoStockMock,
  leggiPagina: mocks.leggiPaginaMock,
  PAUSA_FRA_SCHEDE_MS: 0,
}));

import { GET, POST } from "./route";

const SEGRETO = "segreto-di-prova";

function richiesta(method: "GET" | "POST", headers?: Record<string, string>) {
  return new Request("http://localhost/api/cron/sincronizza-siti", { method, headers: headers ?? {} });
}

/**
 * Un client Supabase finto: ogni metodo torna la catena, e la catena si
 * risolve nel risultato dato. `update` viene registrato a parte perche' e'
 * quello che i test guardano -- se e' stato chiamato, qualcosa e' cambiato.
 */
function supabaseFinto(risultati: { sorgenti?: unknown[]; archivio?: unknown[] }) {
  const update = vi.fn();
  let chiamateSelect = 0;

  const catena: Record<string, unknown> = {};
  for (const metodo of ["select", "not", "eq", "is", "in", "order", "limit", "range"]) {
    catena[metodo] = vi.fn(() => catena);
  }

  catena.select = vi.fn(() => {
    chiamateSelect += 1;
    return catena;
  });

  catena.update = vi.fn((campi: unknown) => {
    update(campi);
    return catena;
  });

  catena.then = (risolvi: (valore: unknown) => unknown) => {
    // La prima interrogazione e' l'elenco delle sorgenti, le successive
    // l'archivio della sorgente in esame.
    const data = chiamateSelect <= 1 ? (risultati.sorgenti ?? []) : (risultati.archivio ?? []);
    return Promise.resolve(risolvi({ data, error: null }));
  };

  return { client: { from: vi.fn(() => catena) }, update };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chiave-di-servizio-di-prova";
  process.env.CRON_SECRET = SEGRETO;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

/**
 * Questo endpoint gira senza nessuno davanti allo schermo e usa la chiave di
 * servizio, che scavalca l'isolamento fra concessionarie: chi riesce a
 * chiamarlo tocca lo stock di tutti. La porta chiusa e' la prima cosa da
 * provare.
 */
describe("chi puo' farla partire", () => {
  it("senza segreto, no", async () => {
    const risposta = await GET(richiesta("GET"));
    expect(risposta.status).toBe(403);
  });

  it("col segreto sbagliato, no", async () => {
    const risposta = await POST(richiesta("POST", { "x-cron-secret": "quello-sbagliato" }));
    expect(risposta.status).toBe(403);
  });

  // Senza segreto configurato non si apre a tutti: si chiude a tutti.
  it("se il segreto non e' configurato sul server, non passa nessuno", async () => {
    delete process.env.CRON_SECRET;
    const risposta = await GET(richiesta("GET", { authorization: "Bearer qualsiasi" }));
    expect(risposta.status).toBe(403);
  });

  it("col segreto giusto, si", async () => {
    const { client } = supabaseFinto({ sorgenti: [] });
    mocks.createClientMock.mockReturnValue(client);

    const risposta = await GET(richiesta("GET", { authorization: `Bearer ${SEGRETO}` }));
    expect(risposta.status).toBe(200);
  });
});

/**
 * La distinzione che l'importazione fa gia' fra "il veicolo non c'e'" e "la
 * lettura non e' riuscita". Qui vale doppio: girando di notte, scambiarle
 * toglierebbe dal marketplace lo stock intero di una concessionaria senza che
 * nessuno se ne accorga fino al giorno dopo.
 */
describe("quando il sito non risponde", () => {
  it("non tocca niente e lo dice", async () => {
    const { client, update } = supabaseFinto({
      sorgenti: [{ dealer_id: "d1", import_source: "autogepy.it" }],
      archivio: [
        { id: "v1", import_source_id: "1", status: "published", published: true, import_missing_since: null },
      ],
    });
    mocks.createClientMock.mockReturnValue(client);
    mocks.elencoStockMock.mockResolvedValue(null);

    const risposta = await GET(richiesta("GET", { authorization: `Bearer ${SEGRETO}` }));
    const corpo = (await risposta.json()) as { esiti: Array<{ nota?: string; nascoste: number }> };

    expect(update).not.toHaveBeenCalled();
    expect(corpo.esiti[0].nascoste).toBe(0);
    expect(corpo.esiti[0].nota).toContain("non raggiungibile");
  });
});

describe("quando il sito risponde", () => {
  it("toglie dalla vetrina l'auto che il sito non dichiara piu'", async () => {
    const { client, update } = supabaseFinto({
      sorgenti: [{ dealer_id: "d1", import_source: "autogepy.it" }],
      archivio: [
        { id: "v1", import_source_id: "1", status: "published", published: true, import_missing_since: null },
        { id: "v2", import_source_id: "2", status: "published", published: true, import_missing_since: null },
      ],
    });
    mocks.createClientMock.mockReturnValue(client);
    mocks.elencoStockMock.mockResolvedValue([
      { sourceId: "1", url: "https://www.autogepy.it/auto/usate/x/1/", condition: "Usato" },
    ]);
    // Nessuna scheda si lascia leggere: al test interessa l'allineamento, non
    // la rilettura dei dati.
    mocks.leggiPaginaMock.mockResolvedValue(null);

    const risposta = await GET(richiesta("GET", { authorization: `Bearer ${SEGRETO}` }));
    const corpo = (await risposta.json()) as { esiti: Array<{ nascoste: number }> };

    expect(corpo.esiti[0].nascoste).toBe(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "in_review", published: false }),
    );
  });
});
