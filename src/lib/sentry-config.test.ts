import { describe, expect, it } from "vitest";
import { primaDiSpedire, ripuliscil } from "@/lib/sentry-config";

/**
 * Questa e' la rete che conta.
 *
 * `segnalaErrore` ripulisce quello che le viene passato, ma la raccolta
 * prende **ogni** `console.error` del server: le settanta chiamate mai
 * convertite, quelle dentro le librerie, e quelle che verranno scritte
 * domani da chi non conosce questa regola. Nessuna di quelle passa da
 * `segnalaErrore`. Passano tutte di qui.
 */
describe("ripuliscil", () => {
  it("toglie i dati personali a qualsiasi profondita'", () => {
    const pulito = ripuliscil({
      dealerId: "d-1",
      richiesta: {
        email: "mario@esempio.it",
        dentro: { customer_phone: "333", vehicleId: "v-1" },
      },
      elenco: [{ password: "x", stato: 500 }],
    });

    expect(pulito).toEqual({
      dealerId: "d-1",
      richiesta: { dentro: { vehicleId: "v-1" } },
      elenco: [{ stato: 500 }],
    });
  });

  it("lascia intatto quello che non riguarda nessuno", () => {
    expect(ripuliscil({ endpoint: "/api/visite", tentativi: 2 })).toEqual({
      endpoint: "/api/visite",
      tentativi: 2,
    });
    expect(ripuliscil("una stringa")).toBe("una stringa");
    expect(ripuliscil(42)).toBe(42);
    expect(ripuliscil(null)).toBe(null);
  });

  /**
   * Un oggetto che rimanda a se stesso manderebbe la pulizia in ricorsione
   * infinita, e il guasto diventerebbe due: il secondo dentro la
   * segnalazione del primo.
   */
  it("non si perde dentro un oggetto che rimanda a se stesso", () => {
    const anello: Record<string, unknown> = { stato: 500 };
    anello.se_stesso = anello;

    expect(() => ripuliscil(anello)).not.toThrow();
  });
});

describe("primaDiSpedire", () => {
  it("non lascia partire l'utente, i cookie, le intestazioni e il corpo", () => {
    const evento = primaDiSpedire({
      message: "qualcosa e' andato storto",
      user: { id: "u-1", email: "mario@esempio.it", ip_address: "203.0.113.1" },
      request: {
        url: "https://www.keyauto.it/api/visite",
        cookies: { sb_token: "abc" },
        headers: { authorization: "Bearer abc" },
        data: { email: "anna@esempio.it" },
      },
      extra: { dealerId: "d-1", phone: "333" },
    } as Record<string, unknown>);

    expect(evento.user).toBeUndefined();
    expect(evento.request).toEqual({ url: "https://www.keyauto.it/api/visite" });
    expect(evento.extra).toEqual({ dealerId: "d-1" });
    // Il messaggio resta: senza, non si capirebbe cosa si e' rotto.
    expect(evento.message).toBe("qualcosa e' andato storto");
  });

  it("un evento gia' pulito passa senza essere svuotato", () => {
    const evento = primaDiSpedire({ message: "rotto", extra: { endpoint: "/api/visite" } } as Record<string, unknown>);

    expect(evento.message).toBe("rotto");
    expect(evento.extra).toEqual({ endpoint: "/api/visite" });
  });
});
