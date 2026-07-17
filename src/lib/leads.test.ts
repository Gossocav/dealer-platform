import { describe, expect, it } from "vitest";
import { mapStageToDbStatus, normalizeLeadStage } from "@/lib/leads";

describe("leads stage mapping", () => {
  it("normalizes legacy statuses to new CRM stages", () => {
    expect(normalizeLeadStage("created")).toBe("nuovo");
    expect(normalizeLeadStage("appointment")).toBe("appuntamento");
    expect(normalizeLeadStage("negotiation")).toBe("proposta_inviata");
    expect(normalizeLeadStage("won")).toBe("chiuso_positivo");
    expect(normalizeLeadStage("lost")).toBe("chiuso_negativo");
  });

  it("maps UI stages to db statuses", () => {
    expect(mapStageToDbStatus("nuovo")).toBe("nuovo");
    expect(mapStageToDbStatus("contattato")).toBe("contattato");
    expect(mapStageToDbStatus("appuntamento")).toBe("appuntamento");
    expect(mapStageToDbStatus("proposta_inviata")).toBe("proposta_inviata");
    expect(mapStageToDbStatus("chiuso_positivo")).toBe("chiuso_positivo");
    expect(mapStageToDbStatus("chiuso_negativo")).toBe("chiuso_negativo");
  });
});
