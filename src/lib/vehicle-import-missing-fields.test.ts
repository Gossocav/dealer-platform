import { describe, expect, it } from "vitest";
import {
  buildInitialVehicleImportMapping,
  buildVehicleInsertPayload,
  canonicalizeVehicleBodyType,
  canonicalizeVehicleCategory,
  canonicalizeVehicleCondition,
  createEmptyVehicleImportMapping,
  getVehicleImportFields,
  mapVehicleImportRow,
  parseImportEquipment,
  parseImportRegistrationDate,
  type VehicleImportMappedRow,
} from "@/lib/vehicle-import";
import { VEHICLE_BODY_TYPES } from "@/lib/vehicle-body-types";

function mappedRow(overrides: Partial<VehicleImportMappedRow>): VehicleImportMappedRow {
  const empty = Object.fromEntries(getVehicleImportFields().map((field) => [field, ""])) as VehicleImportMappedRow;
  return { ...empty, brand: "Audi", model: "A4", ...overrides };
}

// Un'auto importata non aveva condizioni, carrozzeria ne' tipo veicolo: quei
// campi non erano proprio importabili. Restava fuori da tutti i filtri della
// ricerca e da ogni categoria in home, senza che niente lo segnalasse.
describe("condizioni, tipo veicolo e carrozzeria si importano", () => {
  it("riconosce come si scrive davvero nei listini", () => {
    for (const written of ["Usato", "usato", "USATA", "used", "di occasione"]) {
      expect(canonicalizeVehicleCondition(written), written).toBe("Usato");
    }
    for (const written of ["Km 0", "km0", "0 km", "KM ZERO", "chilometri zero"]) {
      expect(canonicalizeVehicleCondition(written), written).toBe("Km/0");
    }
    expect(canonicalizeVehicleCondition("nuova")).toBe("Nuovo");
    expect(canonicalizeVehicleCondition("ex demo")).toBe("Aziendale");
  });

  it("riconosce le carrozzerie con i nomi dei portali", () => {
    expect(canonicalizeVehicleBodyType("SUV")).toBe("SUV/Pick-up");
    expect(canonicalizeVehicleBodyType("station wagon")).toBe("Station Wagon");
    expect(canonicalizeVehicleBodyType("familiare")).toBe("Station Wagon");
    expect(canonicalizeVehicleBodyType("sedan")).toBe("Berlina");
    expect(canonicalizeVehicleBodyType("cabriolet")).toBe("Cabrio");
    expect(canonicalizeVehicleBodyType("monovolume")).toBe("Monovolume");
  });

  it("accetta il valore gia' scritto come lo scrive la piattaforma", () => {
    // "SUV/Pick-up" normalizzato diventa "suvpickup", che nella tabella dei
    // sinonimi non c'e': senza il confronto diretto andrebbe perso.
    for (const bodyType of VEHICLE_BODY_TYPES) {
      expect(canonicalizeVehicleBodyType(bodyType), bodyType).toBe(bodyType);
    }
    expect(canonicalizeVehicleCategory("Veicolo commerciale")).toBe("Veicolo commerciale");
  });

  it("restituisce esattamente i valori che i filtri confrontano", () => {
    // I filtri della ricerca usano l'uguaglianza esatta: "usato" minuscolo non
    // corrisponderebbe a niente, ed e' il motivo per cui i valori si
    // normalizzano invece di essere salvati com'e'.
    expect(["Nuovo", "Usato", "Aziendale", "Km/0"]).toContain(canonicalizeVehicleCondition("USATO"));
    expect(["Auto", "Veicolo commerciale"]).toContain(canonicalizeVehicleCategory("autovettura"));
    expect(VEHICLE_BODY_TYPES).toContain(canonicalizeVehicleBodyType("suv") as never);
  });

  it("lascia vuoto cio' che non riconosce, invece di salvarlo com'e'", () => {
    // Un testo estraneo non comparirebbe comunque nei filtri, e il modulo di
    // modifica non saprebbe mostrarlo: lo cancellerebbe al primo salvataggio.
    expect(canonicalizeVehicleCondition("da vedere")).toBeNull();
    expect(canonicalizeVehicleBodyType("astronave")).toBeNull();
    expect(canonicalizeVehicleCategory("")).toBeNull();
  });
});

describe("data di immatricolazione", () => {
  it("legge i formati che compaiono nei listini", () => {
    expect(parseImportRegistrationDate("2019-03-15")).toBe("2019-03-15");
    expect(parseImportRegistrationDate("15/03/2019")).toBe("2019-03-15");
    expect(parseImportRegistrationDate("15-03-2019")).toBe("2019-03-15");
    expect(parseImportRegistrationDate("03/2019")).toBe("2019-03-01");
    expect(parseImportRegistrationDate("2019/03")).toBe("2019-03-01");
  });

  it("non inventa una data quando c'e' solo l'anno", () => {
    // Scrivere "1 gennaio" fabbricherebbe una precisione che il file non ha.
    expect(parseImportRegistrationDate("2019")).toBeNull();
    expect(parseImportRegistrationDate("")).toBeNull();
  });

  it("rifiuta date impossibili", () => {
    expect(parseImportRegistrationDate("32/03/2019")).toBeNull();
    expect(parseImportRegistrationDate("15/13/2019")).toBeNull();
    expect(parseImportRegistrationDate("15/03/1300")).toBeNull();
  });

  it("l'anno segue la data quando c'e'", () => {
    // Come nel modulo manuale: i due non possono raccontare cose diverse.
    const payload = buildVehicleInsertPayload(mappedRow({ registrationDate: "15/03/2019", year: "2005" }), "draft");
    expect(payload.registration_date).toBe("2019-03-15");
    expect(payload.year).toBe(2019);
  });

  it("senza data resta la colonna anno", () => {
    const payload = buildVehicleInsertPayload(mappedRow({ year: "2019" }), "draft");
    expect(payload.registration_date).toBeNull();
    expect(payload.year).toBe(2019);
  });
});

describe("dotazioni", () => {
  it("spacchetta l'elenco comunque sia separato", () => {
    expect(parseImportEquipment("Navigatore, Sensori; Clima | Cerchi in lega")).toEqual([
      "Navigatore",
      "Sensori",
      "Clima",
      "Cerchi in lega",
    ]);
  });

  it("non ripete la stessa voce", () => {
    expect(parseImportEquipment("Navigatore, navigatore, NAVIGATORE")).toEqual(["Navigatore"]);
  });

  it("si ferma prima di ingoiare un file malformato", () => {
    const many = Array.from({ length: 300 }, (_, index) => `Optional ${index}`).join(",");
    expect(parseImportEquipment(many).length).toBeLessThanOrEqual(80);
  });

  it("resta vuoto invece di salvare una lista vuota", () => {
    expect(buildVehicleInsertPayload(mappedRow({}), "draft").equipment).toBeNull();
  });
});

describe("numeri tecnici", () => {
  it("importa potenza, porte e posti", () => {
    const payload = buildVehicleInsertPayload(
      mappedRow({ powerKw: "110", powerCv: "150", doors: "5", seats: "5" }),
      "draft",
    );
    expect(payload.power_kw).toBe(110);
    expect(payload.power_cv).toBe(150);
    expect(payload.doors).toBe(5);
    expect(payload.seats).toBe(5);
  });

  it("scarta valori assurdi invece di salvarli", () => {
    // Una colonna mappata male puo' contenere qualsiasi cosa.
    const payload = buildVehicleInsertPayload(mappedRow({ doors: "45000", seats: "0", powerCv: "-3" }), "draft");
    expect(payload.doors).toBeNull();
    expect(payload.seats).toBeNull();
    expect(payload.power_cv).toBeNull();
  });
});

describe("riconoscimento automatico delle colonne", () => {
  it("aggancia le intestazioni dei listini veri", () => {
    const mapping = buildInitialVehicleImportMapping([
      "Marca", "Modello", "Condizioni", "Carrozzeria", "Data immatricolazione",
      "Cilindrata", "KW", "CV", "Porte", "Posti", "Classe Euro", "Interni", "Optional",
    ]);

    expect(mapping.vehicleCondition).toBe("Condizioni");
    expect(mapping.bodyType).toBe("Carrozzeria");
    expect(mapping.registrationDate).toBe("Data immatricolazione");
    expect(mapping.engineSize).toBe("Cilindrata");
    expect(mapping.powerKw).toBe("KW");
    expect(mapping.powerCv).toBe("CV");
    expect(mapping.doors).toBe("Porte");
    expect(mapping.seats).toBe("Posti");
    expect(mapping.emissionClass).toBe("Classe Euro");
    expect(mapping.interiorType).toBe("Interni");
    expect(mapping.equipment).toBe("Optional");
  });

  it("tiene distinte data di immatricolazione e anno", () => {
    // Molti listini hanno entrambe le colonne: la data e' il dato buono.
    const mapping = buildInitialVehicleImportMapping(["Anno", "Data immatricolazione"]);
    expect(mapping.registrationDate).toBe("Data immatricolazione");
    expect(mapping.year).toBe("Anno");
  });

  it("ogni campo resta mappabile a mano", () => {
    // E' la risposta al fatto che ogni concessionaria ha un file diverso.
    const empty = createEmptyVehicleImportMapping();
    for (const field of getVehicleImportFields()) {
      expect(empty).toHaveProperty(field);
    }
  });
});

describe("un veicolo importato non e' piu' mutilato", () => {
  it("porta con se' tutto quello che serve a comparire nelle ricerche", () => {
    const row = mapVehicleImportRow(
      {
        rowNumber: 2,
        values: {
          Marca: "Audi",
          Modello: "A4",
          Condizioni: "usato",
          Carrozzeria: "station wagon",
          "Tipo veicolo": "autovettura",
          "Data immatricolazione": "15/03/2019",
          Optional: "Navigatore, Clima",
        },
      },
      buildInitialVehicleImportMapping([
        "Marca", "Modello", "Condizioni", "Carrozzeria", "Tipo veicolo", "Data immatricolazione", "Optional",
      ]),
    );

    const payload = buildVehicleInsertPayload(row, "draft");

    expect(payload.vehicle_condition).toBe("Usato");
    expect(payload.body_type).toBe("Station Wagon");
    expect(payload.vehicle_category).toBe("Auto");
    expect(payload.registration_date).toBe("2019-03-15");
    expect(payload.equipment).toEqual(["Navigatore", "Clima"]);
  });
});

// Quattro agganci sbagliati sono emersi aggiungendo i campi nuovi: "Sede"
// finiva nei posti a sedere, "Potenza" nei kW invece che nei CV, "Carrozzeria"
// nel colore, "Accessori" nella cilindrata. Nascono tutti dallo stesso
// meccanismo: le intestazioni si agganciano anche per contenimento, quindi un
// sinonimo lungo puo' inghiottire la parola di un altro campo.
describe("colonne che non devono finire nel campo sbagliato", () => {
  it.each([
    ["Sede", "seats"],
    ["Potenza", "powerKw"],
    ["Carrozzeria", "color"],
    ["Accessori", "engineSize"],
    ["Prezzo Euro", "emissionClass"],
  ])("%s non finisce in %s", (header, forbiddenField) => {
    const mapping = buildInitialVehicleImportMapping(["Marca", "Modello", header]);
    expect(mapping[forbiddenField as keyof typeof mapping]).not.toBe(header);
  });

  it.each([
    ["Potenza", "powerCv"],
    ["Carrozzeria", "bodyType"],
    ["Accessori", "equipment"],
    ["Prezzo Euro", "price"],
    ["Colore carrozzeria", "color"],
    ["Posti a sedere", "seats"],
    ["Potenza kW", "powerKw"],
  ])("%s finisce in %s", (header, expectedField) => {
    const mapping = buildInitialVehicleImportMapping(["Marca", "Modello", header]);
    expect(mapping[expectedField as keyof typeof mapping]).toBe(header);
  });
});
