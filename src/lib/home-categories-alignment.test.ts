import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const homePage = readFileSync(resolve(process.cwd(), "src/app/(marketplace)/page.tsx"), "utf8");

function sezione(daMarcatore: string, aMarcatore: string) {
  const inizio = homePage.indexOf(daMarcatore);
  const fine = homePage.indexOf(aMarcatore, inizio);
  expect(inizio, `marcatore assente: ${daMarcatore}`).toBeGreaterThan(-1);
  expect(fine, `marcatore assente: ${aMarcatore}`).toBeGreaterThan(inizio);
  return homePage.slice(inizio, fine);
}

// "Parti da qui / Esplora per categoria" e la riga "Ricerche popolari"
// stavano ognuno dentro una scatola larga meta' pagina e centrata: su uno
// schermo largo comparivano in mezzo, mentre le carrozzerie sotto partivano
// dal bordo sinistro. Tre margini sinistri diversi nella stessa sezione, e
// nessuno uguale a quello delle sezioni vicine.
describe("allineamento della sezione categorie in home", () => {
  const categorie = sezione("{/* ============ CATEGORIES ============ */}", "{/* ============ SPEC SHOWCASE");
  const ultimiArrivi = sezione("{/* ============ ULTIMI ARRIVI ============ */}", "{/* ============ CONCESSIONARIE PARTNER");

  it("tiene titolo, carrozzerie e scorciatoie in un contenitore solo", () => {
    const contenitori = [...categorie.matchAll(/className="mx-auto max-w-\w+"/g)];

    expect(contenitori).toHaveLength(1);
    expect(contenitori[0][0]).toContain("max-w-6xl");
  });

  it("usa la stessa larghezza delle altre sezioni della home", () => {
    // Se un giorno "Gli ultimi arrivi" cambia larghezza, questo test lo
    // segnala invece di lasciare due sezioni disallineate in silenzio.
    expect(ultimiArrivi).toContain('className="mx-auto max-w-6xl"');
  });

  it("non rimette una scatola stretta e centrata attorno al titolo", () => {
    expect(categorie).not.toMatch(/RevealOnScroll className="[^"]*\bmx-auto\b/);
    expect(categorie).not.toMatch(/\bmax-w-3xl\b/);
  });

  it("lascia alle carrozzerie i margini negativi per scorrere oltre il bordo", () => {
    const corsia = readFileSync(resolve(process.cwd(), "src/components/marketplace/category-rail.tsx"), "utf8");

    expect(corsia).toMatch(/-mx-4[^"]*px-4/);
  });
});
