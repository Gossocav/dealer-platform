import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const ricerca = read("src/app/(marketplace)/ricerca/page.tsx");
const catalogo = read("src/app/(marketplace)/auto/page.tsx");

// La citta' e' a testo libero: le combinazioni di filtri sono infinite. Con
// ognuna che si dichiarava versione buona di se stessa, Google avrebbe speso
// il suo tempo su migliaia di elenchi quasi identici invece che sulle schede
// dei veicoli.
describe("la ricerca filtrata non moltiplica le pagine da indicizzare", () => {
  it("l'indirizzo canonico e' sempre quello della ricerca vuota", () => {
    expect(ricerca).toContain('const canonical = toAbsoluteUrl("/ricerca")');
    // Il vecchio comportamento: ogni combinazione dichiarava se stessa.
    expect(ricerca).not.toContain("`/ricerca?${queryString}`");
  });

  it("le combinazioni non vanno indicizzate, ma restano da percorrere", () => {
    // "follow" fa si' che Google arrivi comunque agli annunci passando di qui:
    // toglierlo isolerebbe le schede raggiungibili solo dalla ricerca.
    expect(ricerca).toContain("robots: isFiltered ? { index: false, follow: true } : undefined");
  });

  it("la ricerca vuota resta indicizzabile: e' una pagina vera del sito", () => {
    expect(ricerca).toContain("const isFiltered = queryString.length > 0");
  });

  // Il catalogo faceva gia' la cosa giusta e non va toccato: i filtri
  // ricadono su /auto, mentre le pagine successive si dichiarano da se'.
  it("il catalogo continua a far ricadere i filtri sulla pagina base", () => {
    expect(catalogo).toContain("canonical");
  });
});

describe("l'icona per iPhone esiste", () => {
  it("viene disegnata, non caricata come file da tenere allineato", () => {
    const icona = read("src/app/apple-icon.tsx");
    expect(icona).toContain("ImageResponse");
    // 180x180 e' la misura che Apple si aspetta; sotto, l'icona viene sgranata.
    expect(icona).toContain("width: 180");
    expect(icona).toContain("height: 180");
  });
});
