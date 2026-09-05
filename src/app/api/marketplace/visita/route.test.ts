import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClientMock }));

import { POST } from "./route";

const UN_VEICOLO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BROWSER_VERO =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function richiesta(corpo: unknown, userAgent = BROWSER_VERO, ip = "203.0.113.1") {
  return new Request("http://localhost/api/marketplace/visita", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": userAgent,
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(corpo),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chiave-di-servizio";
  mocks.rpcMock.mockResolvedValue({ error: null });
  mocks.createClientMock.mockReturnValue({ rpc: mocks.rpcMock });
});

describe("POST /api/marketplace/visita", () => {
  it("conta la visita a un annuncio", async () => {
    const risposta = await POST(richiesta({ tipo: "annuncio", id: UN_VEICOLO }));

    expect(risposta.status).toBe(204);
    expect(mocks.rpcMock).toHaveBeenCalledWith("registra_visita_annuncio", { p_vehicle_id: UN_VEICOLO });
  });

  it("conta la visita alla pagina di una concessionaria", async () => {
    const risposta = await POST(richiesta({ tipo: "concessionaria", id: UN_VEICOLO }, BROWSER_VERO, "203.0.113.2"));

    expect(risposta.status).toBe(204);
    expect(mocks.rpcMock).toHaveBeenCalledWith("registra_visita_concessionaria", { p_dealer_id: UN_VEICOLO });
  });

  /**
   * La concessionaria la ricava il database dalla vettura. Se passasse da
   * qui, chi conosce l'indirizzo di questo endpoint potrebbe attribuire
   * visite alla concessionaria che preferisce, e i numeri del pannello
   * diventerebbero indistinguibili da quelli veri.
   */
  it("non passa mai al database una concessionaria dichiarata dal browser", async () => {
    await POST(richiesta({ tipo: "annuncio", id: UN_VEICOLO, dealerId: "una-a-caso" }, BROWSER_VERO, "203.0.113.3"));

    expect(mocks.rpcMock).toHaveBeenCalledWith("registra_visita_annuncio", { p_vehicle_id: UN_VEICOLO });
    const argomenti = JSON.stringify(mocks.rpcMock.mock.calls[0]);
    expect(argomenti).not.toContain("dealerId");
    expect(argomenti).not.toContain("una-a-caso");
  });

  it("un robot non conta, e non se ne accorge", async () => {
    const risposta = await POST(
      richiesta({ tipo: "annuncio", id: UN_VEICOLO }, "Mozilla/5.0 (compatible; Googlebot/2.1)", "203.0.113.4")
    );

    expect(risposta.status).toBe(204);
    expect(mocks.rpcMock).not.toHaveBeenCalled();
  });

  it("una richiesta malformata viene rifiutata prima di toccare il database", async () => {
    const risposta = await POST(richiesta({ tipo: "annuncio", id: "non-un-identificativo" }, BROWSER_VERO, "203.0.113.5"));

    expect(risposta.status).toBe(400);
    expect(mocks.rpcMock).not.toHaveBeenCalled();
  });

  /**
   * Chi chiama sta disegnando la pagina di un'automobile: un conteggio non
   * riuscito non deve diventare un errore sotto gli occhi di chi guarda.
   */
  it("se il conteggio fallisce, chi guarda non se ne accorge", async () => {
    mocks.rpcMock.mockResolvedValue({ error: { message: "database non raggiungibile" } });

    const risposta = await POST(richiesta({ tipo: "annuncio", id: UN_VEICOLO }, BROWSER_VERO, "203.0.113.6"));

    expect(risposta.status).toBe(204);
  });

  /**
   * Il freno: dallo stesso indirizzo di rete la stessa pagina si conta un
   * numero limitato di volte all'ora. Serve a fermare chi chiama diecimila
   * volte per gonfiare una concessionaria.
   */
  it("dopo qualche colpo dallo stesso indirizzo smette di contare", async () => {
    const rete = "198.51.100.7";

    for (let colpo = 0; colpo < 12; colpo += 1) {
      await POST(richiesta({ tipo: "annuncio", id: UN_VEICOLO }, BROWSER_VERO, rete));
    }

    expect(mocks.rpcMock.mock.calls.length).toBeGreaterThan(0);
    expect(mocks.rpcMock.mock.calls.length).toBeLessThan(12);
  });
});
