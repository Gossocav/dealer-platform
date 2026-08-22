import { describe, expect, it } from "vitest";
import { derivaVersioneDalTitolo, stripLeadingRepeat } from "@/lib/vehicle-label";

describe("stripLeadingRepeat", () => {
  it("toglie la ripetizione in testa", () => {
    expect(stripLeadingRepeat("Hyundai Tucson N Line", "Hyundai Tucson")).toBe("N Line");
  });

  it("svuota il campo quando e' solo la ripetizione", () => {
    expect(stripLeadingRepeat("Hyundai Tucson", "Hyundai Tucson")).toBe("");
  });

  it("non guarda le maiuscole", () => {
    expect(stripLeadingRepeat("hyundai tucson 1.6", "Hyundai Tucson")).toBe("1.6");
  });

  // Solo a parola intera: "Tucson" non e' una ripetizione di "Tuc".
  it("non taglia a meta' di una parola", () => {
    expect(stripLeadingRepeat("Tucson", "Tuc")).toBe("Tucson");
  });

  it("lascia stare una ripetizione che non e' in testa", () => {
    expect(stripLeadingRepeat("1.6 CRDi Tucson Edition", "Tucson")).toBe("1.6 CRDi Tucson Edition");
  });

  it("con un campo vuoto non fa niente", () => {
    expect(stripLeadingRepeat("", "Hyundai")).toBe("");
    expect(stripLeadingRepeat("Hyundai Tucson", "")).toBe("Hyundai Tucson");
  });
});

// Il difetto vero: l'importazione da sito trova un titolo intero, non una
// versione, e scrivendolo tal quale ogni veicolo importato nasceva con marca e
// modello ripetuti dentro la versione.
describe("derivaVersioneDalTitolo", () => {
  it("tiene solo quello che il titolo aggiunge a marca e modello", () => {
    expect(derivaVersioneDalTitolo("Hyundai Tucson 1.6 CRDi Xline", "Hyundai", "Tucson")).toBe("1.6 CRDi Xline");
  });

  it("torna null quando il titolo e' solo marca e modello", () => {
    expect(derivaVersioneDalTitolo("Hyundai Tucson", "Hyundai", "Tucson")).toBeNull();
  });

  it("toglie anche il solo modello ripetuto", () => {
    expect(derivaVersioneDalTitolo("Tucson 1.6 CRDi", "Hyundai", "Tucson")).toBe("1.6 CRDi");
  });

  it("lascia intero un titolo che non ripete niente", () => {
    expect(derivaVersioneDalTitolo("1.6 CRDi Xline", "Hyundai", "Tucson")).toBe("1.6 CRDi Xline");
  });

  it("regge marca o modello mancanti", () => {
    expect(derivaVersioneDalTitolo("Hyundai Tucson 1.6", null, "Tucson")).toBe("Hyundai Tucson 1.6");
    expect(derivaVersioneDalTitolo("Hyundai Tucson 1.6", "Hyundai", null)).toBe("Tucson 1.6");
  });

  it("torna null su un titolo vuoto", () => {
    expect(derivaVersioneDalTitolo(null, "Hyundai", "Tucson")).toBeNull();
    expect(derivaVersioneDalTitolo("   ", "Hyundai", "Tucson")).toBeNull();
  });
});
