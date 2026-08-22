import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VEHICLE_SORT_OPTIONS, vehicleSortFromValue, vehicleSortToValue } from "@/lib/vehicles";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const toolbar = read("src/components/vehicles/vehicles-toolbar.tsx");
const pagina = read("src/components/vehicles/vehicles-management-page.tsx");

// L'ordine si cambiava solo cliccando le intestazioni della tabella, e la
// vista predefinita e' quella a schede, dove intestazioni non ce ne sono. I
// chilometri non erano ordinabili da nessuna parte.
describe("ordinamento dei veicoli nel gestionale", () => {
  it("offre prezzo e chilometri, in salita e in discesa", () => {
    const valori = VEHICLE_SORT_OPTIONS.map((opzione) => opzione.value);

    expect(valori).toContain("price:asc");
    expect(valori).toContain("price:desc");
    expect(valori).toContain("mileage:asc");
    expect(valori).toContain("mileage:desc");
  });

  it("le etichette dicono il verso in italiano", () => {
    const etichette = Object.fromEntries(VEHICLE_SORT_OPTIONS.map((o) => [o.value, o.label]));

    expect(etichette["price:asc"]).toBe("Prezzo crescente");
    expect(etichette["mileage:asc"]).toBe("Chilometri crescenti");
  });

  it("traduce avanti e indietro fra tendina e stato", () => {
    for (const opzione of VEHICLE_SORT_OPTIONS) {
      const stato = vehicleSortFromValue(opzione.value);
      expect(stato, opzione.value).not.toBeNull();
      expect(vehicleSortToValue(stato!)).toBe(opzione.value);
    }
  });

  it("rifiuta un ordinamento che non conosce", () => {
    expect(vehicleSortFromValue("colore:asc")).toBeNull();
    expect(vehicleSortFromValue("price:qualsiasi")).toBeNull();
    expect(vehicleSortFromValue("")).toBeNull();
  });

  it("la tendina sta nella barra dei filtri, non solo nella tabella", () => {
    expect(toolbar).toContain('label="Ordina per"');
    expect(toolbar).toContain("VEHICLE_SORT_OPTIONS");
    expect(pagina).toContain("onSortChange={handleSortSelection}");
  });

  // Postgres considera il valore mancante come il piu' grande: senza dirlo,
  // in ordine decrescente le auto senza prezzo aprirebbero l'elenco.
  it("mette in fondo i veicoli senza prezzo o senza chilometri", () => {
    expect(pagina).toContain("nullsFirst: false");
  });
});
