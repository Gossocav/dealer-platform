import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveVehicleRegistrationDate, type MarketplaceVehicle } from "@/lib/public-marketplace";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function vehicle(fields: Partial<MarketplaceVehicle>) {
  return fields as MarketplaceVehicle;
}

// La data arriva dal database nel formato ISO, 2026-07-02, e finiva cosi'
// com'era sulle card e sull'annuncio: un formato che in Italia non si scrive
// e non si legge a colpo d'occhio.
describe("immatricolazione sulle pagine pubbliche", () => {
  it("esce come giorno/mese/anno", () => {
    expect(resolveVehicleRegistrationDate(vehicle({ registration_date: "2026-07-02" }))).toBe("02/07/2026");
    expect(resolveVehicleRegistrationDate(vehicle({ registration_date: "2019-03-15" }))).toBe("15/03/2019");
  });

  it("ripiega sull'anno per i veicoli importati", () => {
    // Le importazioni portano spesso solo l'anno: prima il riquadro restava
    // con un trattino anche quando l'anno c'era.
    expect(resolveVehicleRegistrationDate(vehicle({ year: 2019 }))).toBe("2019");
  });

  it("non inventa una data quando non c'e' nulla", () => {
    expect(resolveVehicleRegistrationDate(vehicle({}))).toBe("—");
  });

  it("tiene un valore che non e' una data invece di scartarlo", () => {
    expect(resolveVehicleRegistrationDate(vehicle({ registration_date: "03/2019" }))).toBe("03/2019");
  });

  it("usa la stessa funzione del pannello", () => {
    // Cosi' la data che il concessionario vede nella sua scheda e quella che
    // vede il cliente sull'annuncio sono scritte allo stesso modo.
    expect(read("src/lib/public-marketplace.ts")).toContain("formatRegistrationLabel");
  });

  it("non stampa piu' il valore grezzo sull'annuncio", () => {
    const listing = read("src/app/(marketplace)/auto/[id]/page.tsx");
    expect(listing).not.toContain("formatText(vehicle.registration_date)");
    expect(listing).toContain("resolveVehicleRegistrationDate(vehicle)");
  });
});
