import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const createClientMock = vi.fn();
  const fetchWithSsrfProtectionMock = vi.fn();
  const parseAndValidateExternalHttpUrlMock = vi.fn((value: string) => new URL(value));
  const resolveDealerIdFromTenantSourcesMock = vi.fn();

  return {
    createClientMock,
    fetchWithSsrfProtectionMock,
    parseAndValidateExternalHttpUrlMock,
    resolveDealerIdFromTenantSourcesMock,
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
