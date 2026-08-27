import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalizeVehicleBodyType } from "@/lib/vehicle-import";
import { VEHICLE_BODY_TYPES } from "@/lib/vehicle-body-types";

// La mappatura sito -> nostre colonne e' uscita dall'endpoint quando la
// sincronizzazione notturna ha avuto bisogno della stessa: sta qui, e vale
// per entrambe.
const route = readFileSync(resolve(process.cwd(), "src/lib/dealer-site-sync.ts"), "utf8");

// I nomi veri usati dai siti delle concessionarie, raccolti leggendo quindici
// schede su autogepy.it e delorenziauto.it il 22/08/2026.
const COME_LE_SCRIVONO_I_SITI: Array<[string, string | null]> = [
  // Divise il 27/08/2026: "SUV" e "Pick-up/Fuoristrada" sono due cose diverse
  // per chi cerca. Il crossover sta coi SUV -- e' un SUV piccolo, non un
  // mezzo da sterrato.
  ["SUV", "SUV"],
  ["Crossover", "SUV"],
  ["Fuoristrada", "Pick-up/Fuoristrada"],
  ["Pick-up", "Pick-up/Fuoristrada"],
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
