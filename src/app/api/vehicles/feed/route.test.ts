import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const createClientMock = vi.fn();
  const fetchWithSsrfProtectionMock = vi.fn();
  const parseAndValidateExternalHttpUrlMock = vi.fn((value: string) => new URL(value));
  const resolveDealerIdFromTenantSourcesMock = vi.fn();
  const normalizeVehicleTractionMock = vi.fn((value: string | undefined) => value ?? null);
  const resolveDemoAccessContextMock = vi.fn().mockResolvedValue({
    isDemo: false,
  });
  const getDemoFeatureBlockReasonMock = vi.fn().mockReturnValue(null);

  return {
    createClientMock,
    fetchWithSsrfProtectionMock,
    parseAndValidateExternalHttpUrlMock,
    resolveDealerIdFromTenantSourcesMock,
    normalizeVehicleTractionMock,
    resolveDemoAccessContextMock,
    getDemoFeatureBlockReasonMock,
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClientMock,
}));

vi.mock("@/lib/ssrf-protection", () => ({
  fetchWithSsrfProtection: mocks.fetchWithSsrfProtectionMock,
  parseAndValidateExternalHttpUrl: mocks.parseAndValidateExternalHttpUrlMock,
}));

vi.mock("@/lib/dealer-id-resolution", () => ({
  resolveDealerIdFromTenantSources: mocks.resolveDealerIdFromTenantSourcesMock,
}));

vi.mock("@/lib/vehicles", () => ({
  normalizeVehicleTraction: mocks.normalizeVehicleTractionMock,
}));

vi.mock("@/lib/demo-access", () => ({
  resolveDemoAccessContext: mocks.resolveDemoAccessContextMock,
  getDemoFeatureBlockReason: mocks.getDemoFeatureBlockReasonMock,
}));

import { POST } from "./route";

function makeJsonRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/vehicles/feed", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token",
    },
    body: JSON.stringify(body),
  });
}

function makeSupabaseAuthClient() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
    from: vi.fn((table: string) => {
      if (table !== "vehicles") {
        throw new Error(`Unexpected table in test mock: ${table}`);
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({
            count: 0,
            error: null,
          }),
        })),
      };
    }),
  };
}

async function runFeedAnalysis(feedUrl: string, rawText: string, contentType: string) {
  mocks.createClientMock.mockReturnValue(makeSupabaseAuthClient());
  mocks.fetchWithSsrfProtectionMock.mockResolvedValue(
    new Response(rawText, {
      headers: {
        "content-type": contentType,
      },
    })
  );
  mocks.resolveDealerIdFromTenantSourcesMock.mockResolvedValue("dealer-1");

  const response = await POST(
    makeJsonRequest({
      action: "analyze",
      url: feedUrl,
      type: "auto",
    })
  );

  const payload = (await response.json()) as Record<string, unknown>;
  return { response, payload };
}

describe("vehicles feed route JSON/XML parsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("parses JSON with a direct array of vehicles", async () => {
    const { response, payload } = await runFeedAnalysis(
      "https://example.com/feed.json",
      JSON.stringify([
        { brand: "Fiat", model: "Panda", year: "2024", price: "15900" },
        { brand: "Alfa Romeo", model: "Giulia", year: "2023", price: "36900" },
      ]),
      "application/json"
    );

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      detectedType: "json",
      rowsCount: 2,
    });
    expect(Array.isArray(payload.preview)).toBe(true);
    expect((payload.preview as Array<unknown>).length).toBeGreaterThan(0);
  });

  it("parses JSON with a common vehicles envelope", async () => {
    const { response, payload } = await runFeedAnalysis(
      "https://example.com/feed.json",
      JSON.stringify({
        vehicles: [{ brand: "BMW", model: "X1", year: "2023", price: "49800" }],
      }),
      "application/json"
    );

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      detectedType: "json",
      rowsCount: 1,
    });
  });

  it("returns an empty result for valid JSON without expected vehicle arrays", async () => {
    const { response, payload } = await runFeedAnalysis(
      "https://example.com/feed.json",
      JSON.stringify({ meta: { source: "test" }, count: 12 }),
      "application/json"
    );

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      success: false,
      message: "Il feed non contiene veicoli.",
    });
  });

  it("parses XML with a base vehicle structure", async () => {
    const { response, payload } = await runFeedAnalysis(
      "https://example.com/feed.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<vehicles>
  <vehicle>
    <brand>Fiat</brand>
    <model>Panda</model>
    <year>2024</year>
  </vehicle>
  <vehicle>
    <brand>Alfa Romeo</brand>
    <model>Giulia</model>
    <year>2023</year>
  </vehicle>
</vehicles>`,
      "application/xml"
    );

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      detectedType: "xml",
      rowsCount: 2,
    });
  });

  it("returns a controlled response for valid XML without recognizable vehicle records", async () => {
    const { response, payload } = await runFeedAnalysis(
      "https://example.com/feed.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<root>
  <metadata>
    <source>test</source>
  </metadata>
</root>`,
      "application/xml"
    );

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      success: false,
      message: "Il feed è valido ma non contiene dati di veicoli.",
    });
  });

  it("handles malformed JSON and XML without crashing", async () => {
    const malformedJson = await runFeedAnalysis("https://example.com/feed.json", "{\"vehicles\": [", "application/json");
    expect(malformedJson.response.status).toBe(400);
    expect(malformedJson.payload).toMatchObject({
      success: false,
      message: "Il feed non contiene veicoli.",
    });

    const malformedXml = await runFeedAnalysis(
      "https://example.com/feed.xml",
      "<vehicles><vehicle><brand>Fiat</brand><model>Panda</model>",
      "application/xml"
    );
    expect(malformedXml.response.status).toBe(400);
    expect(malformedXml.payload).toMatchObject({
      success: false,
      message: "Il feed non contiene veicoli.",
    });
  });
});

/**
 * Il freno per gli account di prova sull'importazione da un feed.
 *
 * Il difetto che questi test impediscono, trovato il 10/09/2026: il controllo
 * c'era, ma stava **dentro** il ramo di un feed di esempio ("demo://automotive-feed").
 * Tolto quello, l'importazione da un feed vero e' rimasta senza freno -- e non
 * e' un percorso qualsiasi: qui si scrive con la **chiave di servizio**, che
 * scavalca la protezione per riga, quindi nemmeno il database avrebbe fermato
 * un account di prova.
 *
 * Il secondo test e' la contropartita del primo: correggere il difetto
 * spostando il freno troppo in alto spegnerebbe anche l'analisi, e guardare
 * com'e' fatto un feed dev'essere permesso anche a chi sta provando.
 */
describe("il freno degli account di prova", () => {
  const BLOCCO = {
    code: "DEMO_IMPORT_NOT_ALLOWED",
    message: "Questa funzione e' disponibile nella versione completa.",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chiave-di-servizio-di-prova";
    mocks.resolveDealerIdFromTenantSourcesMock.mockResolvedValue("dealer-1");
    mocks.createClientMock.mockReturnValue(makeSupabaseAuthClient());
  });

  it("un account di prova non importa da un feed vero, e il feed non viene nemmeno letto", async () => {
    mocks.getDemoFeatureBlockReasonMock.mockReturnValue(BLOCCO);

    const response = await POST(
      makeJsonRequest({ action: "import", url: "https://example.com/feed.json", type: "auto" })
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(payload).toMatchObject({ success: false, message: BLOCCO.message });

    // Il rifiuto arriva prima di andare a leggere il sito di qualcun altro per
    // conto di chi non potrebbe importare comunque.
    expect(mocks.fetchWithSsrfProtectionMock).not.toHaveBeenCalled();

    // La chiave giusta: "import", non "write" o "vehicle". Con un'altra il
    // tetto dei dieci veicoli lascerebbe passare l'importazione.
    expect(mocks.getDemoFeatureBlockReasonMock).toHaveBeenCalledWith(expect.anything(), "import");
  });

  it("guardare com'e' fatto un feed resta permesso anche in prova", async () => {
    mocks.getDemoFeatureBlockReasonMock.mockReturnValue(BLOCCO);

    const { response, payload } = await runFeedAnalysis(
      "https://example.com/feed.json",
      JSON.stringify([{ brand: "Fiat", model: "Panda", year: "2024", price: "15900" }]),
      "application/json"
    );

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ success: true, rowsCount: 1 });
  });

  it("un account normale importa senza incontrare il freno", async () => {
    mocks.getDemoFeatureBlockReasonMock.mockReturnValue(null);
    mocks.fetchWithSsrfProtectionMock.mockResolvedValue(
      new Response(JSON.stringify([{ brand: "Fiat", model: "Panda", year: "2024", price: "15900" }]), {
        headers: { "content-type": "application/json" },
      })
    );

    const response = await POST(
      makeJsonRequest({ action: "import", url: "https://example.com/feed.json", type: "auto" })
    );

    expect(response.status).not.toBe(403);
    expect(mocks.fetchWithSsrfProtectionMock).toHaveBeenCalled();
  });
});
