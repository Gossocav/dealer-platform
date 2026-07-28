import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatRegistrationLabel } from "@/lib/vehicles";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("formatRegistrationLabel", () => {
  it("prints the registration date when there is one", () => {
    expect(formatRegistrationLabel({ registration_date: "2019-03-15", year: 2019 })).toBe("15/03/2019");
  });

  it("falls back to the year when the vehicle has no date", () => {
    // Imports map "immatricolazione" onto year and never fill
    // registration_date, so blanking this would empty the field on a whole
    // imported inventory.
    expect(formatRegistrationLabel({ registration_date: null, year: 2019 })).toBe("2019");
    expect(formatRegistrationLabel({ registration_date: "   ", year: "2019" })).toBe("2019");
  });

  it("keeps an unparseable date rather than dropping it", () => {
    expect(formatRegistrationLabel({ registration_date: "03/2019", year: null })).toBe("03/2019");
  });

  it("returns null when the vehicle carries neither", () => {
    expect(formatRegistrationLabel({ registration_date: null, year: null })).toBeNull();
    expect(formatRegistrationLabel({})).toBeNull();
  });

  it("prefers the date over the year when the two disagree", () => {
    expect(formatRegistrationLabel({ registration_date: "2020-01-02", year: 1999 })).toBe("02/01/2020");
  });
});

// The vehicle page and the printed sheet showed "Anno" and the registration
// date side by side -- the same fact twice, since the editor derives the year
// from the date. The product rule is one field, the registration.
describe('"Anno" non e\' piu\' una voce a se\'', () => {
  const views = [
    "src/components/vehicles/vehicle-sheet-page.tsx",
    "src/components/vehicles/vehicle-detail-page.tsx",
    "src/components/vehicles/vehicles-card-grid.tsx",
    "src/components/vehicles/vehicles-table.tsx",
    "src/components/vehicles/send-to-client-dialog.tsx",
    "src/app/statistiche/page.tsx",
    "src/app/(marketplace)/page.tsx",
    "src/app/api/vehicles/send-to-client/route.ts",
  ];

  for (const view of views) {
    it(`non etichetta nulla come "Anno" in ${view}`, () => {
      const source = read(view);
      // Case-sensitive on purpose: prose mentioning "l'anno" in a comment is
      // fine, a label rendered to a dealer or a customer is not.
      const labels = [/label="Anno"/, /label: "Anno"/, />Anno</, /"Anno:?"/, /`Anno:/, /\bAnno: \{/];

      for (const pattern of labels) {
        expect(source, `${view} mostra ancora una voce "Anno"`).not.toMatch(pattern);
      }
    });

    it(`mostra l'immatricolazione in ${view}`, () => {
      expect(read(view)).toMatch(/[Ii]mmatricolazione/);
    });
  }
});
