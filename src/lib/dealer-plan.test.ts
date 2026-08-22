import { describe, expect, it } from "vitest";
import { formatPlanLabel, resolveActivePlanCode } from "@/lib/dealer-plan";

// Il pannello mostrava "Base" a una concessionaria Elite: leggeva
// dealers.subscription_plan, che la conversione non aggiorna mai.
describe("il piano in vigore", () => {
  it("e' quello scelto alla conversione, non quello della colonna vecchia", () => {
    expect(resolveActivePlanCode({ convertedPlanCode: "elite", legacyPlanCode: "base" })).toBe("elite");
  });

  it("finche' la demo non e' convertita vale il profilo della demo", () => {
    expect(resolveActivePlanCode({ convertedPlanCode: null, demoProfileCode: "pro", legacyPlanCode: "base" })).toBe("pro");
  });

  it("la colonna vecchia serve solo quando non c'e' altro", () => {
    expect(resolveActivePlanCode({ legacyPlanCode: "base" })).toBe("base");
    expect(resolveActivePlanCode({})).toBeNull();
  });

  it("ignora i valori che non sono piani", () => {
    expect(resolveActivePlanCode({ convertedPlanCode: "  ELITE  " })).toBe("elite");
    expect(resolveActivePlanCode({ convertedPlanCode: "premium", legacyPlanCode: "pro" })).toBe("pro");
  });

  // Prima l'etichetta conosceva solo base e pro: Elite, il piano da 699 euro
  // al mese, veniva stampato come un trattino.
  it("sa scrivere anche Elite", () => {
    expect(formatPlanLabel("elite")).toBe("Elite");
    expect(formatPlanLabel("base")).toBe("Base");
    expect(formatPlanLabel("pro")).toBe("Pro");
  });

  it("un piano sconosciuto si vede, non sparisce", () => {
    expect(formatPlanLabel("platinum")).toBe("platinum");
    expect(formatPlanLabel(null)).toBe("-");
    expect(formatPlanLabel("   ")).toBe("-");
  });
});
