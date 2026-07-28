import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const sheet = read("src/components/vehicles/vehicle-sheet-page.tsx");
const detail = read("src/components/vehicles/vehicle-detail-page.tsx");
const editor = read("src/components/vehicles/vehicle-editor-page.tsx");
const styles = read("src/app/globals.css");

// Columns the creation form writes that are not data about the car: the tenant
// it belongs to and its publication state. Everything else the dealer types in
// has to reach the printed sheet.
const NON_PRINTABLE_COLUMNS = new Set(["dealer_id", "status", "published"]);

function creationColumns() {
  const start = editor.indexOf("const vehiclePayload = {");
  const end = editor.indexOf("};", start);
  expect(start, "vehiclePayload non trovato in vehicle-editor-page.tsx").toBeGreaterThan(-1);

  const columns = [...editor.slice(start, end).matchAll(/^\s{6}([a-z_]+):/gm)].map((entry) => entry[1]);
  expect(columns.length).toBeGreaterThan(10);
  return columns.filter((column) => !NON_PRINTABLE_COLUMNS.has(column));
}

// No React rendering tooling in this project (no testing-library, no jsdom),
// so these assert on source. They cannot prove the sheet looks right on
// paper -- that needs a real print preview -- but they do pin the guarantees
// that would be silent and costly if they broke.
describe("printable vehicle sheet", () => {
  it("scopes the vehicle to the caller's dealer", () => {
    // Without this a dealer could print another tenant's vehicle by guessing
    // an id, which is a data leak rather than a cosmetic bug.
    const query = sheet.slice(sheet.indexOf('.from("vehicles")'), sheet.indexOf("maybeSingle<SheetVehicle>"));

    expect(query).toContain('.eq("id", vehicleId)');
    expect(query).toContain('.eq("dealer_id", dealerId)');
  });

  it("resolves the dealer from the tenant sources rather than trusting input", () => {
    expect(sheet).toContain("resolveDealerIdFromTenantSources");
    expect(sheet).toContain("getActiveDealerId()");
  });

  it("points the QR at the public listing of this vehicle", () => {
    expect(sheet).toMatch(/\/auto\/\$\{vehicleId\}/);
    expect(sheet).toContain("buildVehicleSheetQr");
  });

  it("keeps the on-screen controls off the printed sheet", () => {
    expect(sheet).toContain("no-print");
    expect(styles).toMatch(/\.no-print\s*\{\s*display:\s*none\s*!important;/);
  });

  it("prints on A4 without the browser's own header and footer", () => {
    // Chrome and Safari only drop the URL/date furniture when the page margin
    // is zero, so the sheet pads itself instead.
    expect(styles).toMatch(/@page\s*\{[^}]*size:\s*A4 portrait;/);
    expect(styles).toMatch(/@page\s*\{[^}]*margin:\s*0;/);
    expect(styles).toMatch(/\.vehicle-sheet\s*\{[^}]*padding:\s*14mm;/);
  });

  it("keeps the QR solid black when printed", () => {
    expect(styles).toMatch(/\.vehicle-sheet svg path\s*\{\s*fill:\s*#000\s*!important;/);
  });

  it("offers the sheet from the vehicle page", () => {
    expect(detail).toMatch(/\/veicoli\/\$\{vehicle\.id\}\/scheda/);
    expect(detail).toContain("Stampa scheda");
  });

  it("lets the dealer print without the price", () => {
    expect(sheet).toContain("Mostra prezzo");
    expect(sheet).toMatch(/showPrice && priceLabel/);
  });
});

// The sheet started as a shortlist of twelve specs and silently dropped
// everything else the dealer had typed in -- description and equipment
// included. Deriving the expectation from the creation payload means a new
// field added to the form fails this test until the sheet carries it too,
// instead of going missing on paper unnoticed.
describe("the sheet carries the whole record", () => {
  it("reads every column the creation form writes", () => {
    const selection = sheet.slice(
      sheet.indexOf("const SHEET_VEHICLE_COLUMNS"),
      sheet.indexOf('.join(", ")'),
    );

    for (const column of creationColumns()) {
      expect(selection, `la scheda non legge "${column}"`).toContain(`"${column}"`);
    }
  });

  it("prints every column it reads", () => {
    // Reading a column and then not rendering it is the exact failure being
    // guarded against. The loaded row is named `vehicleRow`, so a `vehicle.x`
    // reference only ever appears where the value is actually put on the page.
    for (const column of creationColumns()) {
      expect(sheet, `la scheda legge "${column}" ma non lo stampa`).toMatch(
        new RegExp(`vehicle\\??\\.${column}\\b`),
      );
    }
  });

  it("prints the equipment list in both shapes it can be stored in", () => {
    // jsonb array from the editor, delimited text from an import.
    expect(sheet).toContain("normalizeEquipment");
    expect(sheet).toContain("Dotazioni");
    expect(sheet).toMatch(/equipment\.length > 0/);
  });

  it("keeps single blocks whole when the sheet runs past one page", () => {
    // Carrying the full record means a long vehicle legitimately needs a
    // second sheet; pinning the whole page would cut it instead.
    expect(styles).not.toMatch(/\.vehicle-sheet\s*\{[^}]*page-break-inside:\s*avoid/);
    expect(styles).toMatch(/\.vehicle-sheet \.sheet-block\s*\{[^}]*break-inside:\s*avoid/);
    expect(sheet).toContain("sheet-block");
  });
});
