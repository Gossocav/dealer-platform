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

  it("tiene l'iconcina del venditore raggiungibile nel suo angolo", () => {
    // Un collegamento dentro un altro non e' valido: senza z-10 il tocco
    // finirebbe sull'annuncio e la scorciatoia al venditore sarebbe morta.
    const dealerLink = card.slice(card.indexOf("href={`/concessionarie/"), card.indexOf("<StoreIcon"));
    expect(dealerLink).toContain("relative z-10");
  });

  it("non allunga la scheda per ospitare quel collegamento", () => {
    // Il nome del venditore resta testo semplice accanto al prezzo: reso
    // toccabile aveva bisogno di spazio sopra e sotto, e la scheda cresceva
    // di 12 px -- meta' di quanto ne avevamo appena guadagnati accorciando la
    // foto.
    //
    // **Riscritto il 19/09/2026.** Il controllo fissava la riga intera,
    // compresa la classe `truncate`, che con la ragione qui sopra non
    // c'entra niente: il punto e' che il nome **non sia un collegamento**,
    // non come sia scritto il testo. Quando il taglio e' stato tolto -- su
    // una scheda stretta "Ferrari Automobili Srl" finiva a tre puntini -- il
    // test e' caduto per il motivo sbagliato. Adesso guarda quello che la
    // sua spiegazione dice di guardare.
    const bottom = card.slice(card.indexOf("border-t border-white/10 pt-4"));
    const primaDelNome = bottom.slice(0, bottom.indexOf("{dealerName}"));
    const elementoCheLoContiene = primaDelNome.slice(primaDelNome.lastIndexOf("<"));
    expect(elementoCheLoContiene, "il nome del venditore e' diventato un collegamento").toMatch(/^<span/);
  });

  it("porta ancora all'annuncio giusto", () => {
    expect(card).toMatch(/href=\{`\/auto\/\$\{vehicle\.id\}`\}/);
  });
});
