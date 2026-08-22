import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalizeVehicleBodyType } from "@/lib/vehicle-import";
import { VEHICLE_BODY_TYPES } from "@/lib/vehicle-body-types";

const route = readFileSync(resolve(process.cwd(), "src/app/api/vehicles/import-site/route.ts"), "utf8");

// I nomi veri usati dai siti delle concessionarie, raccolti leggendo quindici
// schede su autogepy.it e delorenziauto.it il 22/08/2026.
const COME_LE_SCRIVONO_I_SITI: Array<[string, string | null]> = [
  ["SUV", "SUV/Pick-up/Fuoristrada"],
  ["Fuoristrada", "SUV/Pick-up/Fuoristrada"],
  ["Crossover", "SUV/Pick-up/Fuoristrada"],
  ["Berlina due volumi", "Berlina"],
  ["Berlina tre volumi", "Berlina"],
  ["Station Wagon", "Station Wagon"],
  ["Monovolume", "Monovolume"],
  ["Furgone - Van", "Furgone/Van"],
  ["Furgoni/Van", "Furgone/Van"],
  // "Altro" non e' una carrozzeria: meglio nessuna che una sbagliata.
  ["Altro", null],
];

describe("le carrozzerie dei siti diventano le nostre", () => {
  it.each(COME_LE_SCRIVONO_I_SITI)("%s", (scritta, attesa) => {
    expect(canonicalizeVehicleBodyType(scritta)).toBe(attesa);
  });

  it("quando riconosce, riconosce una delle nostre voci", () => {
    for (const [scritta] of COME_LE_SCRIVONO_I_SITI) {
      const nostra = canonicalizeVehicleBodyType(scritta);
      if (nostra !== null) {
        expect(VEHICLE_BODY_TYPES as readonly string[], `${scritta} -> ${nostra}`).toContain(nostra);
      }
    }
  });

  it("l'importazione dal sito la salva sul veicolo", () => {
    expect(route).toContain("body_type: canonicalizeVehicleBodyType(v.bodyType");
  });
});
