import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const card = read("src/components/marketplace/vehicle-card.tsx");
const home = read("src/app/(marketplace)/page.tsx");
const skeleton = read("src/components/marketplace/skeletons.tsx");

// Su telefono si vedeva un annuncio per schermata e per arrivare al secondo
// bisognava scorrere. La foto da sola era alta 194 px, un quarto di schermo.
describe("foto della scheda", () => {
  it("e' 16:9, non piu' 16:10", () => {
    for (const [name, source] of [["scheda", card], ["home", home]] as const) {
      expect(source, `${name} usa ancora 16:10`).not.toContain("aspect-[16/10]");
      expect(source, `${name} non usa 16:9`).toContain("aspect-[16/9]");
    }
  });

  it("il segnaposto di caricamento ha lo stesso formato", () => {
    // Formati diversi fanno sobbalzare la pagina quando i dati arrivano e il
    // segnaposto viene sostituito dalla scheda vera.
    expect(skeleton).toContain("aspect-[16/9]");
    expect(skeleton).not.toContain("aspect-[16/10]");
  });
});

// Il pulsante "Vedi" era un bersaglio di 60x36 px: su telefono si sbaglia. Ora
// si tocca la scheda intera.
describe("scheda apribile toccandola", () => {
  it("il collegamento copre tutta la scheda", () => {
    expect(card).toContain('<article className="group relative overflow-hidden');
    expect(card).toMatch(/after:absolute after:inset-0/);
  });

  it("il collegamento porta il nome del veicolo", () => {
    // Sta sul titolo e si allarga con uno pseudo-elemento: il testo del
    // collegamento resta il nome dell'auto, che e' quello che leggono i lettori
    // di schermo e i motori di ricerca. Un riquadro invisibile senza nome
    // sarebbe un collegamento muto.
    const block = card.slice(card.indexOf("<h3"), card.indexOf("</h3>"));
    expect(block).toContain("after:absolute");
    expect(block).toContain("{vehicleLabel}");
  });

  it("non ha piu' il pulsante Vedi", () => {
    expect(card).not.toMatch(/>\s*Vedi\s*</);
  });

  it("tiene l'iconcina della concessionaria raggiungibile", () => {
    // Un collegamento dentro un altro non e' valido: senza z-10 il tocco
    // finirebbe sull'annuncio e la scorciatoia al venditore sarebbe morta.
    const dealerLink = card.slice(card.indexOf("/concessionarie/"), card.indexOf("<StoreIcon"));
    expect(dealerLink).toContain("relative z-10");
  });

  it("porta ancora all'annuncio giusto", () => {
    expect(card).toMatch(/href=\{`\/auto\/\$\{vehicle\.id\}`\}/);
  });
});
