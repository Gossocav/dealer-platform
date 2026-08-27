import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VEHICLE_BODY_TYPES } from "@/lib/vehicle-body-types";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const homePage = read("src/app/(marketplace)/page.tsx");
const searchPage = read("src/app/(marketplace)/ricerca/page.tsx");
const editor = read("src/components/vehicles/vehicle-editor-page.tsx");
const rail = read("src/components/marketplace/category-rail.tsx");

describe("elenco carrozzerie condiviso", () => {
  it("e' uno solo, non tre copie", () => {
    // Viveva copiato nel modulo di inserimento, nel filtro della ricerca e
    // nelle categorie in home: una voce aggiunta in uno solo avrebbe prodotto
    // veicoli impossibili da filtrare.
    for (const source of [homePage, searchPage, editor]) {
      expect(source).toContain("VEHICLE_BODY_TYPES");
    }

    // Nessuno dei tre riscrive l'elenco a mano.
    for (const source of [homePage, searchPage, editor]) {
      expect(source).not.toMatch(/"SUV",\s*"Pick-up\/Fuoristrada"/);
      expect(source).not.toContain('<option value="Berlina">');
    }
  });

  it("contiene le voci attese", () => {
    // Divise il 27/08/2026: erano una voce sola, e chi voleva un fuoristrada
    // si trovava davanti centoventotto SUV. Misurato sui due siti prima di
    // dividerle: 109 "SUV", 19 "Crossover", 5 "Fuoristrada", nessun pick-up.
    expect(VEHICLE_BODY_TYPES).toContain("SUV");
    expect(VEHICLE_BODY_TYPES).toContain("Pick-up/Fuoristrada");
    expect(VEHICLE_BODY_TYPES).toContain("Furgone/Van");
    expect(VEHICLE_BODY_TYPES).toHaveLength(9);
  });
});

describe('"Esplora per categoria" in home', () => {
  it("elenca le carrozzerie, tutte", () => {
    expect(homePage).toMatch(/const categories: MarketplaceCategory\[\] = VEHICLE_BODY_TYPES\.map/);
  });

  it("non nasconde piu' le categorie senza veicoli", () => {
    // Prima un filter su count > 0 le faceva sparire, quindi la sezione
    // mostrava solo cio' che era gia' in catalogo e mai cosa si puo' cercare.
    const block = homePage.slice(homePage.indexOf("const categories: MarketplaceCategory[]"), homePage.indexOf("const quickChips"));
    expect(block).not.toMatch(/filter\(\(category\) => category\.count > 0\)/);
  });

  it("conta su tutto il pubblicato, non sugli ultimi 24", () => {
    // La query dei veicoli in home e' limitata a 24 righe: contare li' dentro
    // dava numeri piu' bassi del vero.
    const block = homePage.slice(homePage.indexOf("const publishedBodyTypeCounts"), homePage.indexOf("const quickChips"));
    expect(block).toContain("publishedRows");
    expect(block).not.toContain("vehicles.filter");
    // Non fissa la stringa intera: quella select serve a piu' conteggi e ci si
    // aggiungono colonne. Conta che la carrozzeria arrivi da li'.
    const select = homePage.match(/\.select\("dealer_id[^"]*"\)/)?.[0] ?? "";
    expect(select).toContain("body_type");
  });

  it("non scrive \"0 disponibili\" su una categoria vuota", () => {
    expect(rail).toMatch(/category\.count > 0/);
    expect(rail).toContain("Nessun veicolo al momento");
  });
});
