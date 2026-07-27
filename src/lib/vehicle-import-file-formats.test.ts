import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseVehicleImportFile } from "./vehicle-import";

const importPage = readFileSync(
  resolve(process.cwd(), "src/components/vehicles/vehicles-import-page.tsx"),
  "utf8",
);

const HEADERS = ["Marca", "Modello", "Anno", "Prezzo", "Chilometri", "Trazione"];
const ROW = ["Fiat", "Panda", "2019", "9.500,00", "45.000", "Anteriore"];

function fileFrom(bytes: ArrayBuffer | string, name: string) {
  // The parser only needs .name and .arrayBuffer(), so a File stand-in keeps
  // this runnable under node without jsdom's File implementation.
  const buffer = typeof bytes === "string" ? new TextEncoder().encode(bytes).buffer : bytes;
  return {
    name,
    arrayBuffer: async () => buffer,
  } as unknown as File;
}

function xlsxBytes(bookType: "xlsx" | "xls") {
  const sheet = XLSX.utils.aoa_to_sheet([HEADERS, ROW]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Veicoli");
  return XLSX.write(book, { bookType, type: "array" }) as ArrayBuffer;
}

describe("vehicle import file formats", () => {
  it("offers Excel and CSV in the upload control", () => {
    // The engine has always handled Excel; the picker used to allow only .csv,
    // which contradicted the FAQ promise of "un file Excel".
    const accept = importPage.match(/accept="([^"]+)"/)?.[1] ?? "";
    expect(accept).toContain(".xlsx");
    expect(accept).toContain(".xls");
    expect(accept).toContain(".csv");
  });

  it("no longer calls the file upload a temporary CSV-only feature", () => {
    expect(importPage).not.toMatch(/Formato supportato temporaneamente/i);
    expect(importPage).toMatch(/Formati supportati:.*Excel/i);
  });

  it("reads a real .xlsx workbook", async () => {
    const parsed = await parseVehicleImportFile(fileFrom(xlsxBytes("xlsx"), "stock.xlsx"));

    expect(parsed.headers).toEqual(HEADERS);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].values.Marca).toBe("Fiat");
    expect(parsed.rows[0].values.Modello).toBe("Panda");
  });

  it("reads a legacy .xls workbook", async () => {
    const parsed = await parseVehicleImportFile(fileFrom(xlsxBytes("xls"), "stock.xls"));

    expect(parsed.headers).toEqual(HEADERS);
    expect(parsed.rows[0].values.Marca).toBe("Fiat");
  });

  it.each([
    ["comma", ","],
    // Italian Excel writes CSV with semicolons, so this is the common case here.
    ["semicolon", ";"],
    ["tab", "\t"],
  ])("reads a CSV separated by %s", async (_label, separator) => {
    const csv = [HEADERS.join(separator), ROW.join(separator)].join("\n");
    const parsed = await parseVehicleImportFile(fileFrom(csv, "stock.csv"));

    expect(parsed.headers).toEqual(HEADERS);
    expect(parsed.rows[0].values.Modello).toBe("Panda");
  });

  it("rejects a format the engine cannot read", async () => {
    await expect(parseVehicleImportFile(fileFrom("qualsiasi", "stock.pdf"))).rejects.toThrow(
      /Formato file non supportato/i,
    );
  });
});
