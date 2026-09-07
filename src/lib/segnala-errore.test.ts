import { describe, expect, it, vi } from "vitest";
import { ripuliscilDettaglio } from "@/lib/segnala-errore";

describe("ripuliscilDettaglio", () => {
  /**
   * Un errore serve a sapere **cosa** si e' rotto, non **chi** stava
   * guardando. La piattaforma non conserva gli indirizzi di rete nemmeno per
   * contare le visite: spedirli a un servizio esterno dentro il dettaglio di
   * un errore sarebbe incoerente, e nessuno se ne accorgerebbe.
   */
  it("non lascia uscire niente che riguardi una persona", () => {
    const pulito = ripuliscilDettaglio({
      dealerId: "d-1",
      vehicleId: "v-1",
      email: "mario@esempio.it",
      customer_email: "anna@esempio.it",
      phone: "3331234567",
      first_name: "Mario",
      last_name: "Rossi",
      password: "segreta",
      authorization: "Bearer abc",
      ip: "203.0.113.1",
      message: "il testo che il cliente ha scritto",
      status: 500,
    });

    expect(pulito).toEqual({ dealerId: "d-1", vehicleId: "v-1", status: 500 });
  });

  it("riconosce il nome vietato anche dentro una chiave piu' lunga", () => {
    const pulito = ripuliscilDettaglio({
      customerEmail: "x@y.it",
      dealer_phone: "333",
      accessToken: "abc",
      contatore: 3,
    });

    expect(pulito).toEqual({ contatore: 3 });
  });

  it("un dettaglio senza dati personali passa intero", () => {
    const dettagli = { endpoint: "/api/visite", tentativi: 2, esito: "fallito" };
    expect(ripuliscilDettaglio(dettagli)).toEqual(dettagli);
  });

  it("un dettaglio vuoto resta vuoto", () => {
    expect(ripuliscilDettaglio({})).toEqual({});
  });
});

describe("segnalaErrore", () => {
  /**
   * E' chiamata dentro i blocchi che gestiscono un guasto: se sollevasse, il
   * guasto diventerebbe due, e il secondo lo vedrebbe l'utente.
   */
  it("non solleva mai, nemmeno con valori strani", async () => {
    const { segnalaErrore } = await import("@/lib/segnala-errore");
    const spia = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => segnalaErrore("prova", new Error("rotto"))).not.toThrow();
    expect(() => segnalaErrore("prova", "una stringa")).not.toThrow();
    expect(() => segnalaErrore("prova", null)).not.toThrow();
    expect(() => segnalaErrore("prova", undefined, { email: "x@y.it" })).not.toThrow();

    spia.mockRestore();
  });

  /**
   * L'errore vero va passato **come errore**, non trasformato in testo: e'
   * cosi' che arriva con la sua traccia di esecuzione invece che come una
   * riga sola, e che si capisce da quale riga di codice e' partito.
   */
  it("scrive nei registri l'errore vero, con l'etichetta e senza dati personali", async () => {
    const { segnalaErrore } = await import("@/lib/segnala-errore");
    const spia = vi.spyOn(console, "error").mockImplementation(() => {});
    const guasto = new Error("database non raggiungibile");

    segnalaErrore("visita", guasto, { vehicleId: "v-1", email: "mario@esempio.it" });

    expect(spia).toHaveBeenCalledWith("visita:", guasto, { vehicleId: "v-1" });

    spia.mockRestore();
  });
});
