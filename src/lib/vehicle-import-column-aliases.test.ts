import { describe, expect, it } from "vitest";
import { buildInitialVehicleImportMapping, type VehicleImportColumnMapping } from "./vehicle-import";

function mappedHeaders(mapping: VehicleImportColumnMapping) {
  return Object.values(mapping).filter(Boolean) as string[];
}

function unmatched(headers: string[]) {
  const matched = mappedHeaders(buildInitialVehicleImportMapping(headers));
  return headers.filter((header) => !matched.includes(header));
}

// Layouts taken from how Italian management systems and vehicle portals
// actually name their columns. Every column must be recognised without the
// dealer touching the mapping step.
const REAL_WORLD_LAYOUTS: Record<string, string[]> = {
  "management system, Italian": [
    "Marca", "Modello", "Allestimento", "Anno", "Prezzo", "Km",
    "Alimentazione", "Cambio", "Colore", "Telaio", "Note",
  ],
  "portal export, camelCase English": [
    "make", "model", "version", "price", "mileage", "fuel",
    "gearbox", "firstRegistration", "exteriorColor", "vin", "images",
  ],
  "generic English export": [
    "Make", "Model", "Trim", "Year", "Price", "Mileage",
    "Fuel Type", "Transmission", "Exterior Color", "VIN", "Photos",
  ],
  "management system, abbreviated": [
    "MARCA", "MOD.", "VERS.", "IMMATR.", "PREZZO VENDITA", "KM",
    "ALIM.", "CAMBIO", "COL. ESTERNO",
  ],
  "XML feed, snake_case": [
    "vehicle_brand", "vehicle_model", "vehicle_version", "registration_year",
    "selling_price", "kilometers", "fuel_type", "gear_type", "color",
    "chassis_number", "image_urls",
  ],
  "full Italian set": [
    "Marca", "Modello", "Versione", "Anno", "Prezzo", "Chilometraggio",
    "Combustibile", "Trasmissione", "Trazione", "Tinta", "Telaio",
    "Commento", "Stato", "Galleria",
  ],
};

describe("import column auto-detection", () => {
  it.each(Object.entries(REAL_WORLD_LAYOUTS))(
    "recognises every column of a %s file",
    (_label, headers) => {
      expect(unmatched(headers)).toEqual([]);
    },
  );

  it("always finds the two required columns", () => {
    for (const headers of Object.values(REAL_WORLD_LAYOUTS)) {
      const mapping = buildInitialVehicleImportMapping(headers);
      expect(mapping.brand).not.toBeNull();
      expect(mapping.model).not.toBeNull();
    }
  });

  it.each([
    ["gearbox", "transmission", ["Marca", "Modello", "gearbox"]],
    ["gear_type", "transmission", ["Marca", "Modello", "gear_type"]],
    ["Trasmissione", "transmission", ["Marca", "Modello", "Trasmissione"]],
    ["firstRegistration", "year", ["Marca", "Modello", "firstRegistration"]],
    ["Trim", "version", ["Marca", "Modello", "Trim"]],
    ["Variante", "version", ["Marca", "Modello", "Variante"]],
    ["Chilometraggio", "mileage", ["Marca", "Modello", "Chilometraggio"]],
    ["Odometro", "mileage", ["Marca", "Modello", "Odometro"]],
    ["Combustibile", "fuel", ["Marca", "Modello", "Combustibile"]],
    ["Colour", "color", ["Marca", "Modello", "Colour"]],
    ["Tinta", "color", ["Marca", "Modello", "Tinta"]],
    ["Commento", "description", ["Marca", "Modello", "Commento"]],
    ["Galleria", "images", ["Marca", "Modello", "Galleria"]],
    ["Marchio", "brand", ["Marchio", "Modello"]],
  ])("maps %s to %s", (header, field, headers) => {
    const mapping = buildInitialVehicleImportMapping(headers) as unknown as Record<string, string | null>;
    expect(mapping[field]).toBe(header);
  });
});

// A containment match can hijack a neighbouring column, so the aliases must
// stay specific enough that the more precise header still wins.
describe("import column auto-detection does not mis-assign", () => {
  it("prefers the exterior colour over the interior one", () => {
    const mapping = buildInitialVehicleImportMapping([
      "Marca", "Modello", "Colore esterno", "Colore interni",
    ]);
    expect(mapping.color).toBe("Colore esterno");
  });

  it("prefers the year over unrelated date columns", () => {
    const mapping = buildInitialVehicleImportMapping([
      "Marca", "Modello", "Anno", "Data inserimento",
    ]);
    expect(mapping.year).toBe("Anno");
  });

  it("prefers the selling price over the purchase price", () => {
    const mapping = buildInitialVehicleImportMapping([
      "Marca", "Modello", "Prezzo vendita", "Prezzo acquisto",
    ]);
    expect(mapping.price).toBe("Prezzo vendita");
  });

  it("keeps transmission and traction apart", () => {
    const mapping = buildInitialVehicleImportMapping([
      "Marca", "Modello", "Cambio", "Trazione",
    ]);
    expect(mapping.transmission).toBe("Cambio");
    expect(mapping.traction).toBe("Trazione");
  });

  it("ignores columns that are not vehicle fields", () => {
    const extraneous = ["Targa", "Venditore", "Sede", "Garanzia", "Posti"];
    const mapping = buildInitialVehicleImportMapping(["Marca", "Modello", ...extraneous]);

    for (const header of extraneous) {
      expect(mappedHeaders(mapping)).not.toContain(header);
    }
  });

  it("never assigns one column to two fields", () => {
    for (const headers of Object.values(REAL_WORLD_LAYOUTS)) {
      const used = mappedHeaders(buildInitialVehicleImportMapping(headers));
      expect(new Set(used).size).toBe(used.length);
    }
  });
});
