import { describe, expect, it } from "vitest";
import { etichettaStato } from "@/components/admin/stato-badge";

// Il pannello mostrava il codice tecnico cosi' com'era: "pending_review",
// "activated", "revoked". Chi amministra la piattaforma non deve tradurre.
describe("gli stati del pannello si leggono in italiano", () => {
  it("traduce gli stati di una concessionaria", () => {
    expect(etichettaStato("concessionaria", "pending_review")).toBe("Da approvare");
    expect(etichettaStato("concessionaria", "approved")).toBe("Attiva");
    expect(etichettaStato("concessionaria", "suspended")).toBe("Sospesa");
  });

  it("traduce gli stati di una richiesta demo", () => {
    expect(etichettaStato("richiesta", "pending")).toBe("Da contattare");
    expect(etichettaStato("richiesta", "converted")).toBe("Convertita in abbonamento");
    expect(etichettaStato("richiesta", "revoked")).toBe("Demo revocata");
  });

  it("non lascia in giro codici inglesi", () => {
    for (const codice of ["pending_review", "approved", "rejected", "suspended", "cancelled"]) {
      expect(etichettaStato("concessionaria", codice)).not.toBe(codice);
    }
    for (const codice of ["pending", "contacted", "activated", "rejected", "converted", "revoked"]) {
      expect(etichettaStato("richiesta", codice)).not.toBe(codice);
    }
  });

  it("uno stato sconosciuto si vede, non sparisce", () => {
    expect(etichettaStato("richiesta", "boh")).toBe("boh");
    expect(etichettaStato("richiesta", null)).toBe("-");
  });
});
