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

describe("il riquadro dei filtri si richiude sul telefono", () => {
  /**
   * **Erano due pagine, il 20/09/2026 e' rimasta una.**
   *
   * La pagina di una concessionaria aveva il suo riquadro di filtri, uguale
   * a questo. Non ce l'ha piu': quei filtri giravano nel browser, e farli
   * girare nel database obbligava la pagina a ricostruirsi a ogni visita
   * (0,3-0,6 secondi contro 0,07, con `no-store`) -- la condizione che il
   * 06/09 aveva lasciato 124 schede fuori dall'indice. Adesso quella pagina
   * mostra le auto e manda qui per filtrarle, con `?dealer=<id>`.
   *
   * Quindi **una ricerca sola per tutto il sito**, ed e' la stessa ragione
   * per cui le pagine dei risultati sono numerate: due convenzioni sullo
   * stesso archivio sono peggio di una convenzione imperfetta.
   */
  it("il <details> si apre da solo su schermo largo", () => {
    expect(ricerca).toContain('className="aperto-da-grande group"');
    expect(ricerca).toContain("etichettaFiltra(");
    expect(ricerca).toContain("filtriDaMostrareSubito(");
    expect(stili).toContain("details.aperto-da-grande::details-content");
  });

  it("i campi restano dentro il modulo anche da chiusi", () => {
    // `<details>` nasconde con il foglio di stile, non toglie dalla pagina:
    // premendo Cerca si spedisce tutto, e funziona senza JavaScript.
    const modulo = ricerca.slice(ricerca.indexOf('<form className='), ricerca.indexOf("</form>"));
    const dentro = modulo.slice(modulo.indexOf("<details"), modulo.indexOf("</details>"));
    for (const campo of ["<SearchField", "<SearchSelect", "<TendineMarcaModello", 'type="submit"']) {
      expect(dentro, `${campo} deve stare dentro il riquadro richiudibile`).toContain(campo);
    }
  });

  it("la concessionaria da cui si arriva sopravvive a ogni altro filtro", () => {
    // Senza, premere Cerca o cambiare pagina allargherebbe la ricerca a
    // tutta Italia **senza dirlo**: chi stava guardando le auto di Autogepy
    // si ritroverebbe il marketplace intero e non capirebbe perche'.
    expect(ricerca).toContain('["dealer", filters.dealer]');
    expect(ricerca).toContain('<input type="hidden" name="dealer"');
  });

  it("e si toglie con un gesto solo, tenendo gli altri filtri", () => {
    // "Cerca in tutto il marketplace" azzera solo la concessionaria: chi
    // aveva scelto Diesel continua a cercare Diesel.
    expect(ricerca).toContain('buildSearchParams({ ...filters, dealer: "", page: 1 })');
  });
});


