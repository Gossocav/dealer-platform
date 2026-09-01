import { describe, expect, it } from "vitest";
import { dimensioneCifra, formattaEuroTondo, formattaNumero, quotaPercentuale } from "@/lib/cifre";

/**
 * Il difetto che questi test impediscono: nelle Statistiche il valore del
 * parco auto era scritto sempre in `text-3xl`. Con 250 vetture in piazzale la
 * cifra arriva a "3.750.000 €" e usciva dal riquadro, coprendo quello
 * accanto. Il titolare l'ha visto e l'ha segnalato.
 */
describe("la cifra si adatta al riquadro", () => {
  it("una cifra corta resta grande", () => {
    expect(dimensioneCifra("251")).toBe("text-3xl");
    expect(dimensioneCifra("14")).toBe("text-3xl");
  });

  it("piu' e' lunga, piu' rimpicciolisce", () => {
    const gradini = ["251", "18.500 €", "375.000 €", "3.750.000 €"].map(dimensioneCifra);
    // Nessun gradino puo' essere piu' grande del precedente.
    const ordine = ["text-3xl", "text-2xl", "text-xl", "text-lg"];
    for (let i = 1; i < gradini.length; i += 1) {
      expect(ordine.indexOf(gradini[i]), `${gradini[i]} dopo ${gradini[i - 1]}`).toBeGreaterThanOrEqual(
        ordine.indexOf(gradini[i - 1])
      );
    }
  });

  it("il valore che ha rotto la pagina non resta della misura piu' grande", () => {
    expect(dimensioneCifra("3.750.000 €")).not.toBe("text-3xl");
  });

  it("non scende oltre l'ultimo gradino, per quanto lunga sia", () => {
    expect(dimensioneCifra("123.456.789.012.345 €")).toBe("text-lg");
  });

  it("una cifra vuota non manda in errore", () => {
    expect(dimensioneCifra("")).toBe("text-3xl");
  });
});

describe("gli importi si scrivono come li scrive un italiano", () => {
  it("il simbolo sta in fondo e i centesimi non ci sono", () => {
    expect(formattaEuroTondo(3_750_000)).toBe("3.750.000 €");
    expect(formattaEuroTondo(18_500)).toBe("18.500 €");
  });

  it("arrotonda invece di mostrare i centesimi del parco intero", () => {
    expect(formattaEuroTondo(18_500.49)).toBe("18.500 €");
  });

  // Un dato che manca non vale zero euro.
  it("senza valore non scrive 0 €", () => {
    expect(formattaEuroTondo(null)).toBe("—");
    expect(formattaEuroTondo(undefined)).toBe("—");
    expect(formattaEuroTondo(Number.NaN)).toBe("—");
  });

  it("le quantita' hanno il separatore delle migliaia", () => {
    expect(formattaNumero(1412)).toBe("1.412");
    expect(formattaNumero(null)).toBe("—");
  });
});

// "NaN%" a schermo e' gia' successo su questa piattaforma: nasce sempre da una
// divisione per un totale che nessuno aveva ancora riempito.
describe("le percentuali non diventano NaN", () => {
  it("su un totale a zero non si divide", () => {
    expect(quotaPercentuale(0, 0)).toBeNull();
    expect(quotaPercentuale(5, 0)).toBeNull();
  });

  it("altrimenti e' la quota sul totale", () => {
    expect(quotaPercentuale(25, 100)).toBe(25);
    expect(quotaPercentuale(1, 3)).toBeCloseTo(33.33, 1);
  });
});
