import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const heroFields = read("src/components/marketplace/hero-brand-model-fields.tsx");
const homePage = read("src/app/(marketplace)/page.tsx");

// Da mobile la griglia del form di ricerca collassa a una colonna: i tre
// riquadri diventano larghi quanto lo schermo e "Qualsiasi marca", "Qualsiasi
// modello" e "Nessun limite" restavano appiccicati al bordo sinistro, con
// mezzo riquadro vuoto a destra. Da sm in su le colonne tornano strette e
// l'allineamento a sinistra e' quello giusto.
describe("form di ricerca in home", () => {
  const selects = [
    ...heroFields.matchAll(/className="(mt-0\.5 w-full appearance-none[^"]*)"/g),
    ...homePage.matchAll(/className="(mt-0\.5 w-full appearance-none[^"]*)"/g),
  ].map((match) => match[1]);

  it("copre tutte le tendine della barra", () => {
    // Marca e Modello stanno nel componente, Prezzo max e Distanza nella home:
    // se un giorno se ne aggiunge una senza allinearla, il conteggio lo segnala.
    expect(selects).toHaveLength(4);
  });

  it("centra da mobile anche il campo scrivibile", () => {
    // "Citta' o CAP" e' un input, non una tendina: senza questa riga sarebbe
    // l'unico campo della barra allineato diversamente dagli altri.
    const home = read("src/app/(marketplace)/page.tsx");
    const field = home.slice(home.indexOf("function HeroTextField"), home.indexOf("function HeroField"));
    expect(field).toMatch(/text-center[^"]*sm:text-left/);
  });

  it("centra il testo da mobile", () => {
    for (const className of selects) {
      expect(className, `"${className}" non centra il valore da mobile`).toMatch(/\btext-center\b/);
    }
  });

  it("torna allineato a sinistra da tablet in su", () => {
    for (const className of selects) {
      expect(className, `"${className}" centra anche da desktop`).toMatch(/\bsm:text-left\b/);
    }
  });
});

// La barra in home aveva marca, modello e prezzo: la distanza si poteva usare
// solo entrando nella ricerca avanzata, che quasi nessuno apre.
describe("ricerca per distanza nella barra in home", () => {
  const home = read("src/app/(marketplace)/page.tsx");
  const search = read("src/app/(marketplace)/ricerca/page.tsx");

  it("espone i due campi", () => {
    expect(home).toMatch(/label="Città o CAP" name="near"/);
    expect(home).toMatch(/label="Distanza"\s*\n?\s*name="radius"/);
  });

  it("usa gli stessi nomi che la ricerca legge", () => {
    // Il modulo fa GET su /ricerca: se i nomi non combaciano il filtro si
    // perde per strada senza dare errore.
    expect(home).toMatch(/action="\/ricerca"/);
    for (const field of ["near", "radius"]) {
      expect(search).toContain(`searchParams.${field}`);
    }
  });

  it("elenca le stesse distanze della ricerca avanzata", () => {
    for (const source of [home, search]) {
      expect(source).toContain("DISTANCE_OPTIONS");
    }
  });

  it("non trascina il dataset dei comuni dentro la home", () => {
    // geo-search importa oltre 350 KB di coordinate: alla barra serve solo
    // l'elenco dei numeri.
    expect(home).toContain('from "@/lib/search-distance"');
    expect(home).not.toContain('from "@/lib/geo-search"');
    expect(read("src/lib/search-distance.ts")).not.toContain("italian-geo-data");
  });
});
