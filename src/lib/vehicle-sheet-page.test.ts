import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const sheet = read("src/components/vehicles/vehicle-sheet-page.tsx");
const detail = read("src/components/vehicles/vehicle-detail-page.tsx");
const styles = read("src/app/globals.css");

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
