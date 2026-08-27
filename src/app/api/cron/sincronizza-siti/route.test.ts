import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  elencoStockMock: vi.fn(),
  leggiPaginaMock: vi.fn(),
  parseMock: vi.fn(),
  sostituisciFotoMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClientMock }));

vi.mock("@/lib/dealer-site-fetch", () => ({
  elencoStock: mocks.elencoStockMock,
  leggiPagina: mocks.leggiPaginaMock,
  PAUSA_FRA_SCHEDE_MS: 0,
}));

vi.mock("@/lib/dealer-site-import", () => ({
  parseDealerStockVehicle: mocks.parseMock,
}));

vi.mock("@/lib/dealer-site-photos", () => ({ sostituisciFoto: mocks.sostituisciFotoMock }));

// La concessionaria di prova non e' in demo: il freno della demo ha i suoi
// test altrove, qui interessa la sincronizzazione.
vi.mock("@/lib/demo-access", () => ({
  resolveDemoAccessContext: vi.fn().mockResolvedValue({ isDemo: false }),
  getDemoFeatureBlockReason: vi.fn().mockReturnValue(null),
}));

import { GET, POST } from "./route";

const SEGRETO = "segreto-di-prova";

function richiesta(method: "GET" | "POST", headers?: Record<string, string>) {
  return new Request("http://localhost/api/cron/sincronizza-siti", { method, headers: headers ?? {} });
}

/**
 * Un client Supabase finto: ogni metodo torna la catena, e la catena si
 * risolve nel risultato dato. `update` e `insert` vengono registrati a parte
 * perche' sono quelli che i test guardano -- se sono stati chiamati, qualcosa
 * e' cambiato.
 */
function supabaseFinto(risultati: { sorgenti?: unknown[]; archivio?: unknown[]; daRileggere?: unknown[] }) {
  const update = vi.fn();
  const insert = vi.fn();
  let chiamateSelect = 0;

  const catena: Record<string, unknown> = {};
  for (const metodo of ["not", "eq", "is", "in", "or", "order", "limit", "range"]) {
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

  catena.insert = vi.fn((campi: unknown) => {
    insert(campi);
    return catena;
  });

  catena.maybeSingle = vi.fn(() => Promise.resolve({ data: { id: "nuovo-1" }, error: null }));

  catena.then = (risolvi: (valore: unknown) => unknown) => {
    // 1a interrogazione: l'elenco delle sorgenti. 2a: l'archivio della
    // sorgente. Dalla 3a in poi: le schede da rileggere.
    const data =
      chiamateSelect <= 1
        ? (risultati.sorgenti ?? [])
        : chiamateSelect === 2
          ? (risultati.archivio ?? [])
          : (risultati.daRileggere ?? []);
    return Promise.resolve(risolvi({ data, error: null }));
  };

  return { client: { from: vi.fn(() => catena) }, update, insert };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sostituisciFotoMock.mockResolvedValue(undefined);
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
    expect((await GET(richiesta("GET"))).status).toBe(403);
  });

  it("col segreto sbagliato, no", async () => {
    expect((await POST(richiesta("POST", { "x-cron-secret": "quello-sbagliato" }))).status).toBe(403);
  });

  // Senza segreto configurato non si apre a tutti: si chiude a tutti.
  it("se il segreto non e' configurato sul server, non passa nessuno", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(richiesta("GET", { authorization: "Bearer qualsiasi" }))).status).toBe(403);
  });

  it("col segreto giusto, si", async () => {
    const { client } = supabaseFinto({ sorgenti: [] });
    mocks.createClientMock.mockReturnValue(client);

    expect((await GET(richiesta("GET", { authorization: `Bearer ${SEGRETO}` }))).status).toBe(200);
  });
});

/**
 * La distinzione che l'importazione fa gia' fra "il veicolo non c'e'" e "la
 * lettura non e' riuscita". Qui vale doppio: girando da sola, scambiarle
 * toglierebbe dal marketplace lo stock intero di una concessionaria senza che
 * nessuno se ne accorga.
 */
describe("quando il sito non risponde", () => {
  it("non tocca niente e lo dice", async () => {
    const { client, update, insert } = supabaseFinto({
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
    expect(insert).not.toHaveBeenCalled();
    expect(corpo.esiti[0].nascoste).toBe(0);
    expect(corpo.esiti[0].nota).toContain("non raggiungibile");
  });
});

describe("le auto vendute", () => {
  it("escono dalla vetrina quando il sito non le dichiara piu'", async () => {
    const { client, update } = supabaseFinto({
      sorgenti: [{ dealer_id: "d1", import_source: "autogepy.it" }],
      archivio: [
        { id: "v1", import_source_id: "1", status: "published", published: true, import_missing_since: null },
        { id: "v2", import_source_id: "2", status: "published", published: true, import_missing_since: null },
      ],
      daRileggere: [],
    });
    mocks.createClientMock.mockReturnValue(client);
    mocks.elencoStockMock.mockResolvedValue([
      { sourceId: "1", url: "https://www.autogepy.it/auto/usate/x/1/", condition: "Usato" },
    ]);

    const risposta = await GET(richiesta("GET", { authorization: `Bearer ${SEGRETO}` }));
    const corpo = (await risposta.json()) as { esiti: Array<{ nascoste: number }> };

    expect(corpo.esiti[0].nascoste).toBe(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "in_review", published: false }));
  });
});

/**
 * "Ogni volta che il concessionario aggiorna il suo sito si deve aggiornare
 * anche KeyAuto": le automobili che compaiono la' devono comparire qui, e
 * pubblicate -- se il concessionario le espone sul suo sito, vuole che si
 * vedano.
 */
describe("le auto nuove", () => {
  it("entrano da sole, pubblicate, con le loro fotografie", async () => {
    const { client, insert } = supabaseFinto({
      sorgenti: [{ dealer_id: "d1", import_source: "autogepy.it" }],
      archivio: [
        { id: "v1", import_source_id: "1", status: "published", published: true, import_missing_since: null },
      ],
      daRileggere: [],
    });
    mocks.createClientMock.mockReturnValue(client);
    mocks.elencoStockMock.mockResolvedValue([
      { sourceId: "1", url: "https://www.autogepy.it/auto/usate/x/1/", condition: "Usato" },
      { sourceId: "9", url: "https://www.autogepy.it/auto/km0/x/9/", condition: "Km/0" },
    ]);
    mocks.leggiPaginaMock.mockResolvedValue("<html></html>");
    mocks.parseMock.mockReturnValue({
      ok: true,
      vehicle: {
        sourceId: "9",
        name: "Jeep Avenger 1.2 Turbo",
        brand: "Jeep",
        model: "Avenger",
        price: 24900,
        mileage: 0,
        images: ["https://www.autogepy.it/foto/9-800x0.jpg"],
        condition: "Km/0",
        year: 2025,
        registrationMonth: "03",
      },
    });

    const risposta = await GET(richiesta("GET", { authorization: `Bearer ${SEGRETO}` }));
    const corpo = (await risposta.json()) as { esiti: Array<{ importate: number }> };

    expect(corpo.esiti[0].importate).toBe(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        import_source: "autogepy.it",
        import_source_id: "9",
        dealer_id: "d1",
        status: "published",
        published: true,
      }),
    );
    expect(mocks.sostituisciFotoMock).toHaveBeenCalledWith(
      expect.anything(),
      "d1",
      "nuovo-1",
      ["https://www.autogepy.it/foto/9-800x0.jpg"],
    );
  });

  // Il tetto di annunci del piano si presenta cosi': se non c'e' posto per
  // una, non ce n'e' per nessuna. Si smette e lo si riporta, invece di
  // ritentare per ognuna delle centocinquanta.
  it("se il database rifiuta l'inserimento si ferma e lo dice", async () => {
    const { client } = supabaseFinto({
      sorgenti: [{ dealer_id: "d1", import_source: "autogepy.it" }],
      archivio: [],
      daRileggere: [],
    });
    (client.from() as unknown as { maybeSingle: unknown }).maybeSingle = vi.fn(() =>
      Promise.resolve({ data: null, error: { message: "limite annunci raggiunto" } }),
    );
    mocks.createClientMock.mockReturnValue(client);
    mocks.elencoStockMock.mockResolvedValue([
      { sourceId: "9", url: "https://www.autogepy.it/auto/km0/x/9/", condition: "Km/0" },
      { sourceId: "10", url: "https://www.autogepy.it/auto/km0/x/10/", condition: "Km/0" },
    ]);
    mocks.leggiPaginaMock.mockResolvedValue("<html></html>");
    mocks.parseMock.mockReturnValue({
      ok: true,
      vehicle: { sourceId: "9", brand: "Jeep", model: "Avenger", price: 1, images: [] },
    });

    const risposta = await GET(richiesta("GET", { authorization: `Bearer ${SEGRETO}` }));
    const corpo = (await risposta.json()) as { esiti: Array<{ importate: number; errori?: string[] }> };

    expect(corpo.esiti[0].importate).toBe(0);
    expect(corpo.esiti[0].errori?.[0]).toContain("limite annunci raggiunto");
  });
});

/**
 * Il difetto della prima versione: le concessionarie venivano servite una
 * alla volta e basta, cosi' la prima si prendeva tutto il minuto con le sue
 * riletture e la seconda restava fuori -- comprese le sue vendute, che sono
 * la parte che si vede. Adesso le sparizioni si fanno per tutte prima di
 * qualsiasi rilettura.
 */
describe("nessuna concessionaria resta indietro", () => {
  it("le sparizioni si fanno per tutte le sorgenti", async () => {
    const { client } = supabaseFinto({
      sorgenti: [
        { dealer_id: "d1", import_source: "autogepy.it" },
        { dealer_id: "d2", import_source: "delorenziauto.it" },
      ],
      archivio: [],
      daRileggere: [],
    });
    mocks.createClientMock.mockReturnValue(client);
    mocks.elencoStockMock.mockResolvedValue([
      { sourceId: "1", url: "https://esempio.it/auto/usate/x/1/", condition: "Usato" },
    ]);

    const risposta = await GET(richiesta("GET", { authorization: `Bearer ${SEGRETO}` }));
    const corpo = (await risposta.json()) as { sorgenti: number; esiti: Array<{ sito: string }> };

    expect(corpo.sorgenti).toBe(2);
    expect(corpo.esiti.map((e) => e.sito)).toEqual(["autogepy.it", "delorenziauto.it"]);
  });
});
