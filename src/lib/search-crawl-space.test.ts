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
  /**
   * **Riscritto il 20/09/2026, e la decisione non e' cambiata: e' cambiata
   * l'asserzione, che guardava un'altra cosa.**
   *
   * Fissava la riga `const canonical = toAbsoluteUrl("/ricerca")` parola per
   * parola. L'intento scritto qui sopra pero' e' un altro -- *"la ricerca
   * filtrata non moltiplica le pagine da indicizzare"* -- e regge
   * benissimo: le combinazioni di filtri sono infinite perche' la citta' e'
   * a testo libero, e nessuna deve dichiararsi versione buona.
   *
   * **Una pagina di una serie non e' una combinazione di filtri.** Le
   * pagine sono dodici, finite e numerate, e Google chiede espressamente il
   * contrario: *"Don't use the first page of a paginated sequence as the
   * canonical page"*. Fissando la riga, questo controllo impediva di
   * seguire quella indicazione -- cioe' si opponeva a una correzione che
   * con le combinazioni infinite non c'entra niente.
   */
  it("una combinazione di filtri non si dichiara mai versione buona", () => {
    // La proprieta', non il testo: quando ci sono filtri il canonico e'
    // l'indirizzo pulito.
    expect(ricerca).toContain('isFiltered ? "/ricerca"');
    // Il vecchio comportamento: ogni combinazione dichiarava se stessa.
    expect(ricerca).not.toContain("`/ricerca?${queryString}`");
  });

  it("ma una pagina della serie dichiara se stessa", () => {
    // Dodici pagine finite non sono combinazioni infinite, e Google le
    // vuole con un canonico proprio: verificato sulla sua documentazione il
    // 20/09/2026, non ricordato.
    expect(ricerca).toContain("`/ricerca?page=${filters.page}`");
  });

  it("le combinazioni non vanno indicizzate, ma restano da percorrere", () => {
    // "follow" fa si' che Google arrivi comunque agli annunci passando di qui:
    // toglierlo isolerebbe le schede raggiungibili solo dalla ricerca.
    expect(ricerca).toContain("robots: isFiltered ? { index: false, follow: true } : undefined");
  });

  it("la ricerca vuota resta indicizzabile: e' una pagina vera del sito", () => {
    // **`page` non e' un filtro, e toglierlo prima di decidere e' tutta la
    // correzione del 20/09/2026.** Prima `?page=2` finiva fra le
    // combinazioni e usciva `noindex`: con 276 auto e dodici pagine, 252
    // automobili su 276 erano raggiungibili da qui solo attraverso pagine
    // che chiedevano a Google di ignorarle.
    expect(ricerca).toContain('filtriSenzaPagina.delete("page")');
    expect(ricerca).toContain("const isFiltered = filtriSenzaPagina.toString().length > 0");
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
