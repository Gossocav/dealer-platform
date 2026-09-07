import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  contestoMock: vi.fn(),
}));

vi.mock("@/lib/admin-api-context", () => ({
  contestoAmministratore: mocks.contestoMock,
}));

import { GET, POST } from "./route";

const INDIRIZZO_SEGRETO = "https://chiavesegreta@o123456.ingest.de.sentry.io/456789";

function richiesta(metodo: "GET" | "POST") {
  return new Request("http://localhost/api/admin/prova-avvisi", { method: metodo });
}

function ammesso() {
  mocks.contestoMock.mockResolvedValue({ errore: null, supabaseAdmin: {} });
}

function respinto(codice: number) {
  mocks.contestoMock.mockResolvedValue({
    errore: new Response(JSON.stringify({ error: "no" }), { status: codice }),
    supabaseAdmin: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SENTRY_DSN;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("prova degli avvisi", () => {
  /**
   * L'indirizzo di raccolta e' un segreto: chi lo conosce puo' spedire
   * segnalazioni finte al progetto e riempire la quota. Alla domanda
   * "funziona?" basta rispondere si' o no, e questo test impedisce che un
   * domani qualcuno lo aggiunga alla risposta "per comodita'".
   */
  it("non lascia mai uscire l'indirizzo di raccolta", async () => {
    ammesso();
    process.env.SENTRY_DSN = INDIRIZZO_SEGRETO;

    for (const risposta of [await GET(richiesta("GET")), await POST(richiesta("POST"))]) {
      const testo = await risposta.text();
      expect(testo).not.toContain(INDIRIZZO_SEGRETO);
      expect(testo).not.toContain("chiavesegreta");
      expect(testo).not.toContain("ingest");
    }
  });

  it("dice che e' accesa quando l'indirizzo c'e'", async () => {
    ammesso();
    process.env.SENTRY_DSN = INDIRIZZO_SEGRETO;

    const corpo = (await (await GET(richiesta("GET"))).json()) as { configurata: boolean };
    expect(corpo.configurata).toBe(true);
  });

  it("dice che e' spenta quando l'indirizzo manca", async () => {
    ammesso();

    const corpo = (await (await GET(richiesta("GET"))).json()) as { configurata: boolean };
    expect(corpo.configurata).toBe(false);

    const prova = (await (await POST(richiesta("POST"))).json()) as { inviata: boolean; messaggio: string };
    expect(prova.inviata).toBe(false);
    expect(prova.messaggio).toContain("SENTRY_DSN");
  });

  /**
   * Un estraneo che potesse chiamarlo saprebbe se la piattaforma si accorge
   * dei guasti -- esattamente cio' che gli servirebbe sapere prima di
   * provocarne uno.
   */
  it("respinge chi non e' amministratore, in tutti e due i versi", async () => {
    respinto(403);

    expect((await GET(richiesta("GET"))).status).toBe(403);
    expect((await POST(richiesta("POST"))).status).toBe(403);
  });

  it("l'errore di prova si riconosce come tale", async () => {
    ammesso();
    process.env.SENTRY_DSN = INDIRIZZO_SEGRETO;
    const spia = vi.spyOn(console, "error").mockImplementation(() => {});

    await POST(richiesta("POST"));

    const [etichetta, errore] = spia.mock.calls[0] as [string, Error];
    expect(etichetta).toContain("admin/prova-avvisi");
    expect(errore.name).toBe("ProvaDegliAvvisi");
    expect(errore.message).toContain("Non e' un guasto");

    spia.mockRestore();
  });
});
