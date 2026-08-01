import { describe, expect, it } from "vitest";
import {
  buildVehicleInsertPayload,
  createEmptyVehicleImportDefaults,
  getVehicleImportDefaultOptions,
  getVehicleImportFields,
  VEHICLE_CATEGORY_VALUES,
  VEHICLE_CONDITION_VALUES,
  VEHICLE_IMPORT_DEFAULT_FIELDS,
  type VehicleImportMappedRow,
} from "@/lib/vehicle-import";
import { VEHICLE_BODY_TYPES } from "@/lib/vehicle-body-types";
import { VEHICLE_FUEL_OPTIONS, VEHICLE_TRACTION_OPTIONS, VEHICLE_TRANSMISSION_OPTIONS } from "@/lib/vehicles";

function mappedRow(overrides: Partial<VehicleImportMappedRow> = {}): VehicleImportMappedRow {
  const empty = Object.fromEntries(getVehicleImportFields().map((field) => [field, ""])) as VehicleImportMappedRow;
  return { ...empty, brand: "Audi", model: "A4", ...overrides };
}

// Il caso che ha fatto nascere la funzione: un listino di soli usati senza
// colonna "condizioni". Prima ogni riga finiva senza condizioni e quindi fuori
// dal filtro della ricerca, e il concessionario non aveva modo di dirlo.
describe("un valore dichiarato una volta vale per tutto il file", () => {
  it("riempie il campo quando la colonna non c'e'", () => {
    const payload = buildVehicleInsertPayload(mappedRow(), "draft", { vehicleCondition: "Usato" });

    expect(payload.vehicle_condition).toBe("Usato");
  });

  it("riempie anche le righe lasciate in bianco da una colonna che esiste", () => {
    const payload = buildVehicleInsertPayload(mappedRow({ vehicleCondition: "   " }), "draft", {
      vehicleCondition: "Usato",
    });

    expect(payload.vehicle_condition).toBe("Usato");
  });

  it("vale per ognuno dei campi offerti", () => {
    const payload = buildVehicleInsertPayload(mappedRow(), "draft", {
      vehicleCondition: "Km/0",
      vehicleCategory: "Veicolo commerciale",
      bodyType: "Furgone/Van",
      fuel: "Diesel",
      transmission: "Manuale",
      traction: "Anteriore",
    });

    expect(payload.vehicle_condition).toBe("Km/0");
    expect(payload.vehicle_category).toBe("Veicolo commerciale");
    expect(payload.body_type).toBe("Furgone/Van");
    expect(payload.fuel).toBe("Diesel");
    expect(payload.transmission).toBe("Manuale");
    expect(payload.traction).toBe("Anteriore");
  });
});

describe("il file vince sempre sul predefinito", () => {
  it("non sovrascrive il valore scritto nella riga", () => {
    const payload = buildVehicleInsertPayload(mappedRow({ vehicleCondition: "Nuovo", fuel: "Elettrica" }), "draft", {
      vehicleCondition: "Usato",
      fuel: "Diesel",
    });

    expect(payload.vehicle_condition).toBe("Nuovo");
    expect(payload.fuel).toBe("Elettrica");
  });

  it("riconosce il valore della riga anche scritto come capita, senza cadere sul predefinito", () => {
    const payload = buildVehicleInsertPayload(mappedRow({ vehicleCondition: "km 0" }), "draft", {
      vehicleCondition: "Usato",
    });

    expect(payload.vehicle_condition).toBe("Km/0");
  });

  // Un dato sbagliato e' peggio di un dato mancante: se la riga ha scritto
  // qualcosa che non riconosciamo, rispondere col predefinito significherebbe
  // dire "Benzina" a un'auto che il file dichiarava ibrida.
  it("lascia vuoto un valore non riconosciuto invece di rimpiazzarlo col predefinito", () => {
    const payload = buildVehicleInsertPayload(mappedRow({ vehicleCondition: "da rottamare", fuel: "" }), "draft", {
      vehicleCondition: "Usato",
      fuel: "Benzina",
    });

    expect(payload.vehicle_condition).toBeNull();
    expect(payload.fuel).toBe("Benzina");
  });
});

describe("senza predefiniti niente cambia", () => {
  it("si comporta come prima quando non ne viene dichiarato nessuno", () => {
    const senza = buildVehicleInsertPayload(mappedRow({ fuel: "Diesel" }), "draft");
    const vuoti = buildVehicleInsertPayload(mappedRow({ fuel: "Diesel" }), "draft", createEmptyVehicleImportDefaults());

    expect(senza.vehicle_condition).toBeNull();
    expect(senza.body_type).toBeNull();
    expect(senza.traction).toBeNull();
    expect(vuoti).toEqual(senza);
  });

  it("una stringa vuota non e' una dichiarazione", () => {
    const payload = buildVehicleInsertPayload(mappedRow(), "draft", { vehicleCondition: "", fuel: "  " });

    expect(payload.vehicle_condition).toBeNull();
    expect(payload.fuel).toBeNull();
  });
});

// Le tendine dei predefiniti devono offrire esattamente i valori che la
// piattaforma sa filtrare: una voce fuori elenco verrebbe scartata al
// salvataggio e il concessionario si ritroverebbe il campo vuoto lo stesso.
describe("le scelte offerte sono quelle che la piattaforma usa davvero", () => {
  it("offre gli elenchi ufficiali di ogni campo", () => {
    expect(getVehicleImportDefaultOptions("vehicleCondition")).toEqual([...VEHICLE_CONDITION_VALUES]);
    expect(getVehicleImportDefaultOptions("vehicleCategory")).toEqual([...VEHICLE_CATEGORY_VALUES]);
    expect(getVehicleImportDefaultOptions("bodyType")).toEqual([...VEHICLE_BODY_TYPES]);
    expect(getVehicleImportDefaultOptions("fuel")).toEqual([...VEHICLE_FUEL_OPTIONS]);
    expect(getVehicleImportDefaultOptions("transmission")).toEqual([...VEHICLE_TRANSMISSION_OPTIONS]);
    expect(getVehicleImportDefaultOptions("traction")).toEqual([...VEHICLE_TRACTION_OPTIONS]);
  });

  it("ogni valore offerto sopravvive all'importazione", () => {
    for (const field of VEHICLE_IMPORT_DEFAULT_FIELDS) {
      for (const option of getVehicleImportDefaultOptions(field)) {
        const payload = buildVehicleInsertPayload(mappedRow(), "draft", { [field]: option }) as Record<string, unknown>;
        const column = {
          vehicleCondition: "vehicle_condition",
          vehicleCategory: "vehicle_category",
          bodyType: "body_type",
          fuel: "fuel",
          transmission: "transmission",
          traction: "traction",
        }[field];

        expect(payload[column], `${field} = ${option}`).toBe(option);
      }
    }
  });

  it("copre solo campi a elenco chiuso, mai quelli a testo libero", () => {
    for (const field of VEHICLE_IMPORT_DEFAULT_FIELDS) {
      expect(getVehicleImportDefaultOptions(field).length, field).toBeGreaterThan(0);
    }

    for (const libero of ["description", "version", "vin", "price", "mileage"]) {
      expect(VEHICLE_IMPORT_DEFAULT_FIELDS).not.toContain(libero);
    }
  });
});
