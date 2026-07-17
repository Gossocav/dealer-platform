import { describe, expect, it } from "vitest";
import {
  buildInitialVehicleImportMapping,
  buildVehicleInsertPayload,
  getVehicleImportFields,
  mapVehicleImportRow,
  parseVehicleImportFile,
  validateVehicleImportRow,
  type VehicleImportMappedRow,
} from "./vehicle-import";

function makeCsvFile(content: string, name = "stock.csv") {
  return new File([content], name, { type: "text/csv" });
}

function createEmptyMappedRow(): VehicleImportMappedRow {
  return Object.fromEntries(getVehicleImportFields().map((field) => [field, ""])) as VehicleImportMappedRow;
}

describe("vehicle-import", () => {
  it("parses a basic CSV file", async () => {
    const file = makeCsvFile(`brand,model,year,price,mileage\nFiat,Panda,2024,15900,1200\n`);

    const parsed = await parseVehicleImportFile(file);

    expect(parsed.headers).toEqual(["brand", "model", "year", "price", "mileage"]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toEqual({
      rowNumber: 2,
      values: {
        brand: "Fiat",
        model: "Panda",
        year: "2024",
        price: "15900",
        mileage: "1200",
      },
    });
  });

  it("parses semicolon-separated CSV with italian characters", async () => {
    const file = makeCsvFile(
      `Marca;Modello;Anno immatricolazione;Prezzo;Chilometri\nAlfa Romeo;Giulia Veloce;2022;36.900,50;48.200\n`
    );

    const parsed = await parseVehicleImportFile(file);

    expect(parsed.headers).toEqual(["Marca", "Modello", "Anno immatricolazione", "Prezzo", "Chilometri"]);
    expect(parsed.rows[0].values).toMatchObject({
      Marca: "Alfa Romeo",
      Modello: "Giulia Veloce",
      "Anno immatricolazione": "2022",
      Prezzo: "36.900,50",
      Chilometri: "48.200",
    });
  });

  it("builds the initial mapping for common italian aliases", () => {
    const mapping = buildInitialVehicleImportMapping([
      "Marca",
      "Modello",
      "Anno immatricolazione",
      "Prezzo",
      "Km",
      "Colore esterno",
    ]);

    expect(mapping.brand).toBe("Marca");
    expect(mapping.model).toBe("Modello");
    expect(mapping.year).toBe("Anno immatricolazione");
    expect(mapping.price).toBe("Prezzo");
    expect(mapping.mileage).toBe("Km");
    expect(mapping.color).toBe("Colore esterno");
  });

  it("validates missing required fields", () => {
    const errors = validateVehicleImportRow(createEmptyMappedRow());

    expect(errors).toEqual(["Marca obbligatoria", "Modello obbligatorio"]);
  });

  it("normalizes price, year and mileage values in the insert payload", () => {
    const payload = buildVehicleInsertPayload(
      {
        vin: "",
        brand: "Fiat",
        model: "500",
        version: "Dolcevita",
        year: "2024",
        price: "36.900,50",
        mileage: "48.200",
        fuel: "Benzina",
        traction: "Anteriore",
        transmission: "Manuale",
        color: "Bianco",
        description: "",
        status: "published",
        images: "",
      },
      "draft"
    );

    expect(payload).toMatchObject({
      brand: "Fiat",
      model: "500",
      version: "Dolcevita",
      year: 2024,
      price: 36900.5,
      mileage: 48200,
      fuel: "Benzina",
      transmission: "Manuale",
      published: true,
      status: "published",
    });
  });

  it("maps a CSV row using the selected column mapping", () => {
    const row = {
      rowNumber: 2,
      values: {
        Marca: "BMW",
        Modello: "X1",
        Prezzo: "49800",
        Chilometri: "15000",
      },
    };

    const mapping = buildInitialVehicleImportMapping(["Marca", "Modello", "Prezzo", "Chilometri"]);
    const mapped = mapVehicleImportRow(row, mapping);

    expect(mapped.brand).toBe("BMW");
    expect(mapped.model).toBe("X1");
    expect(mapped.price).toBe("49800");
    expect(mapped.mileage).toBe("15000");
  });

  it("rejects empty or malformed inputs", async () => {
    await expect(parseVehicleImportFile(makeCsvFile("", "empty.txt"))).rejects.toThrow(
      "Formato file non supportato. Usa solo CSV."
    );

    await expect(parseVehicleImportFile(makeCsvFile("", "empty.csv"))).rejects.toThrow(
      "Intestazioni non valide. Inserisci una prima riga con i nomi colonna."
    );
  });
});
