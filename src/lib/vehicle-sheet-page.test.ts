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

describe("la foto del veicolo sulla scheda", () => {
  it("si puo' escludere dalla stampa come il prezzo", () => {
    // Una foto grande a colori costa toner: chi stampa venti schede deve
    // poterla togliere senza rinunciare al resto.
    expect(sheet).toContain("Mostra foto");
    expect(sheet).toMatch(/showPhoto && coverUrl/);
  });

  it("spegne la spunta quando il veicolo non ha foto", () => {
    // Una spunta accesa che non produce nulla si legge come un guasto.
    expect(sheet).toMatch(/disabled=\{!coverUrl\}/);
  });

  it("usa un <img>, non uno sfondo CSS", () => {
    // Gli sfondi CSS spariscono in stampa se il concessionario non attiva
    // "Grafica di sfondo"; un <img> si stampa e basta.
    expect(sheet).toMatch(/<img\b/);
    expect(sheet).not.toMatch(/backgroundImage.*coverUrl/);
    expect(styles).toMatch(/\.vehicle-sheet img\s*\{[^}]*print-color-adjust:\s*exact/);
  });

  it("carica la foto subito, non pigramente", () => {
    // window.print() non aspetta le immagini con loading="lazy": una foto non
    // ancora scaricata finirebbe come riquadro vuoto sul foglio.
    const img = sheet.slice(sheet.indexOf("<img"), sheet.indexOf("/>", sheet.indexOf("<img")));
    expect(img).toContain('loading="eager"');
  });

  it("tiene la foto dentro uno spazio fisso accanto al prezzo", () => {
    // Senza dimensioni fisse una foto verticale da telefono occuperebbe mezza
    // pagina e spingerebbe i dati tecnici sul secondo foglio.
    const img = sheet.slice(sheet.indexOf("<img"), sheet.indexOf("/>", sheet.indexOf("<img")));
    expect(img).toMatch(/h-\[\d+mm\]/);
    expect(img).toMatch(/w-\[\d+mm\]/);
    expect(img).toContain("object-cover");
  });

  it("non duplica la risoluzione delle foto gia' scritta per la pagina veicolo", () => {
    // Il bucket in produzione e' privato per drift, quindi serve createSignedUrl:
    // due copie di quella soluzione si aggiustano in un posto solo e si rompono
    // nell'altro.
    expect(sheet).toContain("resolveVehicleImageRows");
    expect(detail).toContain("resolveVehicleImageRows");
    expect(sheet).not.toContain("createSignedUrl");
    expect(detail).not.toContain("createSignedUrl");
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

  it("shows the same record on the vehicle page it prints on the sheet", () => {
    // The two views drifted apart independently: the sheet was missing ten
    // fields, the vehicle page five. Deriving both from the creation payload
    // is what stops them drifting again one field at a time.
    for (const column of creationColumns()) {
      expect(detail, `la pagina veicolo non legge "${column}"`).toContain(`${column},`);
      expect(detail, `la pagina veicolo legge "${column}" ma non lo mostra`).toMatch(
        new RegExp(`vehicle\\??\\.${column}\\b`),
      );
    }
  });

  it("keeps single blocks whole when the sheet runs past one page", () => {
    // Carrying the full record means a long vehicle legitimately needs a
    // second sheet; pinning the whole page would cut it instead.
    expect(styles).not.toMatch(/\.vehicle-sheet\s*\{[^}]*page-break-inside:\s*avoid/);
    expect(styles).toMatch(/\.vehicle-sheet \.sheet-block\s*\{[^}]*break-inside:\s*avoid/);
    expect(sheet).toContain("sheet-block");
  });
});
