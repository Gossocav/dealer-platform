import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatMileage } from "@/lib/vehicles";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

/**
 * Il testo senza i commenti: le visualizzazioni si nominano ancora, ma solo
 * per spiegare perche' non ci sono piu'. Un controllo che non distinguesse le
 * due cose costringerebbe a cancellare la spiegazione.
 */
function senzaCommenti(sorgente: string) {
  return sorgente
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const schede = read("src/components/vehicles/vehicles-card-grid.tsx");
const tabella = read("src/components/vehicles/vehicles-table.tsx");
const pagina = read("src/components/vehicles/vehicles-management-page.tsx");
const libreria = read("src/lib/vehicles.ts");

// "Visualizzazioni" mostrava sempre 0: nel codice era scritto "viewsCount: 0",
// e nel database non esiste nessuna colonna, nessuna tabella e nessun codice
// che registri le visite. Un dato inventato mostrato come se fosse misurato.
describe("i dati sulle schede veicolo sono dati veri", () => {
  it("le visualizzazioni finte non compaiono piu' da nessuna parte", () => {
    for (const [nome, sorgente] of [["schede", schede], ["tabella", tabella], ["pagina", pagina], ["libreria", libreria]] as const) {
      expect(sorgente, `${nome} usa ancora il valore finto`).not.toContain("viewsCount");
      expect(senzaCommenti(sorgente), `${nome} mostra ancora le visualizzazioni`).not.toContain("Visualizzazioni");
    }
  });

  it("la scheda mostra chilometri e alimentazione", () => {
    expect(schede).toContain("Chilometri");
    expect(schede).toContain("{vehicle.mileageLabel}");
    expect(schede).toContain("Alimentazione");
    expect(schede).toContain("{vehicle.fuel}");
  });

  // Le quattro caselle devono comportarsi allo stesso modo: etichetta sopra,
  // valore sotto. Con "inline-flex" il valore restava in coda all'etichetta.
  it("tutte le etichette delle caselle occupano la propria riga", () => {
    const caselle = schede.match(/<span className="[^"]*text-xs uppercase tracking-\[0\.12em\][^"]*"/g) ?? [];

    expect(caselle.length).toBeGreaterThanOrEqual(2);
    for (const casella of caselle) {
      expect(casella, casella).not.toContain("inline-flex");
    }
  });

  it("nella tabella i chilometri si ordinano come prezzo e immatricolazione", () => {
    expect(tabella).toContain('field="mileage"');
  });
});

describe("i chilometri scritti come si leggono", () => {
  it("mette il punto delle migliaia", () => {
    expect(formatMileage(29870)).toBe("29.870 km");
    expect(formatMileage(120000)).toBe("120.000 km");
  });

  // Una km 0 ha davvero zero chilometri: e' un dato, non un dato mancante.
  it("distingue zero da non saputo", () => {
    expect(formatMileage(0)).toBe("0 km");
    expect(formatMileage(null)).toBe("-");
    expect(formatMileage(undefined)).toBe("-");
  });

  it("non si fa ingannare da un valore assurdo", () => {
    expect(formatMileage(-5)).toBe("-");
    expect(formatMileage(Number.NaN)).toBe("-");
  });
});
