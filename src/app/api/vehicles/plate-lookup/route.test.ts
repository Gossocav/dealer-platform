import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  resolveDealerIdMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClientMock,
}));

vi.mock("@/lib/dealer-id-resolution", () => ({
  resolveDealerIdFromTenantSources: mocks.resolveDealerIdMock,
}));

import { POST } from "./route";

/**
 * La ricerca da targa e' a pagamento: non la paga chi passa di li'.
 *
 * **Quale difetto impediscono.** Trovato il 05/09/2026 in una verifica di
 * sicurezza. L'endpoint non guardava chi lo chiamava: provato dall'esterno
 * sulla produzione, senza nessuna sessione, rispondeva. Dietro c'e' un
 * abbonamento a consumo (OpenAPI Automotive), quindi ogni chiamata era una
 * targa interrogata a nostre spese; e la risposta contiene numero di telaio,
 * data di immatricolazione e colore di un'automobile che non e' nostra.
 *
 * Il controllo che conta non e' il codice di stato: e' che la chiamata al
 * fornitore **non parta**. Un 401 restituito dopo aver gia' speso non
 * risolverebbe niente.
 */

function richiesta(corpo: unknown, intestazioni?: Record<string, string>) {
  return new Request("http://localhost/api/vehicles/plate-lookup", {
    method: "POST",
    headers: { "content-type": "application/json", ...(intestazioni ?? {}) },
    body: JSON.stringify(corpo),
  });
}

function supabaseConUtente(utente: { id: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: utente },
        error: utente ? null : new Error("no session"),
      }),
    },
  };
}

let fetchSpia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.OPENAPI_AUTOMOTIVE_BASE_URL = "https://fornitore.test";
  process.env.OPENAPI_AUTOMOTIVE_TOKEN = "token-a-pagamento";

  fetchSpia = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ data: { CarMake: "Audi", CarModel: "A3" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );
  vi.stubGlobal("fetch", fetchSpia);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ricerca veicolo da targa", () => {
  it("senza sessione non interroga il fornitore a pagamento", async () => {
    const risposta = await POST(richiesta({ licensePlate: "AA123BB" }));

    expect(risposta.status).toBe(401);
    expect(fetchSpia).not.toHaveBeenCalled();
    expect(mocks.createClientMock).not.toHaveBeenCalled();
  });

  it("con un'intestazione che non e' un Bearer non interroga il fornitore", async () => {
    const risposta = await POST(
      richiesta({ licensePlate: "AA123BB" }, { authorization: "Basic dXRlbnRlOnBhc3N3b3Jk" })
    );

    expect(risposta.status).toBe(401);
    expect(fetchSpia).not.toHaveBeenCalled();
  });

  it("con una sessione non valida non interroga il fornitore", async () => {
    mocks.createClientMock.mockReturnValue(supabaseConUtente(null));

    const risposta = await POST(richiesta({ licensePlate: "AA123BB" }, { authorization: "Bearer scaduto" }));

    expect(risposta.status).toBe(401);
    expect(fetchSpia).not.toHaveBeenCalled();
  });

  it("con una sessione valida ma senza concessionaria non interroga il fornitore", async () => {
    // Con la registrazione autonoma aperta un account si crea in un momento:
    // "essere collegati" non e' una barriera, esserlo a una concessionaria si'.
    mocks.createClientMock.mockReturnValue(supabaseConUtente({ id: "utente-1" }));
    mocks.resolveDealerIdMock.mockResolvedValue(null);

    const risposta = await POST(richiesta({ licensePlate: "AA123BB" }, { authorization: "Bearer valido" }));

    expect(risposta.status).toBe(403);
    expect(fetchSpia).not.toHaveBeenCalled();
  });

  it("a una concessionaria collegata risponde, interrogando il fornitore", async () => {
    mocks.createClientMock.mockReturnValue(supabaseConUtente({ id: "utente-1" }));
    mocks.resolveDealerIdMock.mockResolvedValue("dealer-1");

    const risposta = await POST(richiesta({ licensePlate: "AA123BB" }, { authorization: "Bearer valido" }));
    const corpo = (await risposta.json()) as { vehicle?: { brand?: string } };

    expect(risposta.status).toBe(200);
    expect(corpo.vehicle?.brand).toBe("Audi");
    expect(fetchSpia).toHaveBeenCalledOnce();

    const [indirizzo] = fetchSpia.mock.calls[0] as [string];
    expect(indirizzo).toBe("https://fornitore.test/IT-car/AA123BB");
  });

  it("la targa la controlla dopo aver riconosciuto chi chiede, non prima", async () => {
    // Se la forma della targa venisse controllata per prima, un estraneo
    // saprebbe distinguere "targa scritta male" da "non sei nessuno", e
    // avrebbe comunque un endpoint con cui giocare.
    const risposta = await POST(richiesta({ licensePlate: "non-e-una-targa" }));

    expect(risposta.status).toBe(401);
    expect(fetchSpia).not.toHaveBeenCalled();
  });

  it("a chi ha diritto, una targa scritta male resta un 400", async () => {
    mocks.createClientMock.mockReturnValue(supabaseConUtente({ id: "utente-1" }));
    mocks.resolveDealerIdMock.mockResolvedValue("dealer-1");

    const risposta = await POST(richiesta({ licensePlate: "non-e-una-targa" }, { authorization: "Bearer valido" }));

    expect(risposta.status).toBe(400);
    expect(fetchSpia).not.toHaveBeenCalled();
  });
});
