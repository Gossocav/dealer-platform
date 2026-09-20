import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { contaFiltriImpostati, etichettaFiltra, filtriDaMostrareSubito } from "@/lib/filtri-richiudibili";

/**
 * **I filtri partono chiusi sul telefono.**
 *
 * Misurato a 390x844 il 20/09/2026, a che altezza comincia la prima
 * automobile:
 *
 * | pagina | prima | dopo |
 * |---|---|---|
 * | concessionaria (133 auto) | 1.737px | **527px** |
 * | /ricerca | 2.090px | **746px** |
 * | /auto | 493px | 493px (non aveva il problema: un campo solo) |
 * | /ricerca con due filtri nell'indirizzo | — | 2.136px, **riquadro aperto** |
 *
 * Chi apre la pagina di un concessionario vuole **vedere** le sue auto.
 * Filtrare viene dopo, e solo per alcuni.
 */
const concessionaria = readFileSync("src/components/marketplace/dealer-vehicle-search.tsx", "utf8");
const ricerca = readFileSync("src/app/(marketplace)/ricerca/page.tsx", "utf8");
const stili = readFileSync("src/app/globals.css", "utf8");

describe("il pulsante dice quanti filtri sono attivi", () => {
  it("senza filtri dice solo Filtra", () => {
    expect(etichettaFiltra(0)).toBe("Filtra");
    expect(etichettaFiltra(-1)).toBe("Filtra");
  });

  it("con i filtri li conta, al singolare e al plurale", () => {
    expect(etichettaFiltra(1)).toBe("Filtra · 1 attivo");
    expect(etichettaFiltra(2)).toBe("Filtra · 2 attivi");
  });

  it("conta solo i campi impostati, e il vuoto non conta", () => {
    expect(contaFiltriImpostati(["Jeep", "", null, undefined, "   ", "Diesel"])).toBe(2);
    expect(contaFiltriImpostati([])).toBe(0);
  });
});

describe("chi arriva con dei filtri gia' messi li vede", () => {
  it("il riquadro parte aperto solo se qualcosa e' impostato", () => {
    // Senza, chi arriva da un collegamento con dei filtri dentro legge
    // "12 auto" su una concessionaria che ne ha 133 e non capisce perche':
    // il riquadro chiuso nasconderebbe l'unica spiegazione.
    expect(filtriDaMostrareSubito(0)).toBe(false);
    expect(filtriDaMostrareSubito(1)).toBe(true);
  });

  it("l'ordinamento non fa aprire il riquadro a chi non ha scelto niente", () => {
    // Ha sempre un valore -- "piu' recenti" quando nessuno tocca niente --
    // quindi contarlo aprirebbe il riquadro su ogni pagina. La prova sul
    // testo: fra i campi contati da /ricerca non c'e' `filters.sort`.
    const blocco = ricerca.slice(ricerca.indexOf("contaFiltriImpostati(["), ricerca.indexOf("]);", ricerca.indexOf("contaFiltriImpostati([")));
    expect(blocco).not.toContain("filters.sort");
    expect(blocco).not.toContain("filters.page");
    expect(blocco).toContain("filters.brand");
  });
});

describe("le due pagine si richiudono allo stesso modo", () => {
  it("tutte e due usano il <details> che si apre da solo su schermo largo", () => {
    // Sono costruite in modi diversi -- /ricerca e' un modulo del server,
    // la pagina della concessionaria un componente del browser -- quindi
    // non possono condividere il componente. Condividono la regola.
    for (const [nome, sorgente] of [["la concessionaria", concessionaria], ["/ricerca", ricerca]] as const) {
      expect(sorgente, `${nome} deve usare aperto-da-grande`).toContain('className="aperto-da-grande group"');
      expect(sorgente, `${nome} deve usare la stessa dicitura`).toContain("etichettaFiltra(");
      expect(sorgente, `${nome} deve aprirsi con i filtri attivi`).toContain("filtriDaMostrareSubito(");
    }
    expect(stili).toContain("details.aperto-da-grande::details-content");
  });

  it("su /ricerca i campi restano dentro il modulo anche da chiusi", () => {
    // `<details>` nasconde con il foglio di stile, non toglie dalla pagina:
    // premendo Cerca si spedisce tutto come prima, e funziona senza
    // JavaScript -- che su quella pagina e' la regola.
    const modulo = ricerca.slice(ricerca.indexOf('<form className='), ricerca.indexOf("</form>"));
    expect(modulo).toContain("<details");
    expect(modulo).toContain("</details>");
    // I campi stanno dentro il <details>, non fuori: se ne restasse uno
    // fuori si vedrebbe da solo sul telefono, ed e' proprio cio' che si
    // sta togliendo di mezzo.
    const dentro = modulo.slice(modulo.indexOf("<details"), modulo.indexOf("</details>"));
    for (const campo of ["<SearchField", "<SearchSelect", "<TendineMarcaModello", 'type="submit"']) {
      expect(dentro, `${campo} deve stare dentro il riquadro richiudibile`).toContain(campo);
    }
  });
});

describe("il conteggio vero resta sempre visibile", () => {
  it("sta fuori dal riquadro che si richiude", () => {
    // E' l'informazione per cui uno e' entrato su quella pagina: se si
    // chiudesse insieme ai filtri, chiudere il riquadro nasconderebbe la
    // risposta.
    const dopoIlDetails = concessionaria.slice(concessionaria.indexOf("</details>"));
    expect(dopoIlDetails).toContain("fraseConteggioVeicoli(");
  });
});
