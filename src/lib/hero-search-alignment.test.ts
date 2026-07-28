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

  it("copre tutti e tre i campi", () => {
    // Marca e Modello stanno nel componente, Prezzo max nella home: se un
    // giorno si spostano, questo conteggio lo segnala.
    expect(selects).toHaveLength(3);
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
