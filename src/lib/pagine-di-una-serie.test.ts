import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * **Una pagina di una serie non e' un doppione della prima.**
 *
 * Il difetto, trovato il 20/09/2026 andando a scrivere la paginazione di
 * `/ricerca` e scoprendo che c'era gia': quella pagina diceva a Google
 * tutte e due le cose sbagliate che la sua documentazione elenca.
 *
 * - `?page=2` finiva fra le combinazioni filtrate e usciva **`noindex`**;
 * - e dichiarava **canonica la pagina 1**, cioe' "sono un doppione".
 *
 * Con 276 auto pubblicate le pagine sono dodici: **252 automobili su 276**
 * erano raggiungibili da li' solo attraverso pagine che chiedevano a Google
 * di ignorarle.
 *
 * Le due righe della documentazione di Google, **lette il 20/09/2026 e non
 * ricordate**: *"Don't use the first page of a paginated sequence as the
 * canonical page. Instead, give each page its own canonical URL"* e, su
 * `rel="next"`/`rel="prev"`, *"Google no longer uses these tags"*.
 *
 * E la convenzione giusta **il progetto ce l'aveva gia'**, su `/auto`: e'
 * quella che si e' copiata. E' lo stesso schema di "una regola messa in un
 * posto solo non chiude le porte che non la chiamano".
 */
const ricerca = readFileSync("src/app/(marketplace)/ricerca/page.tsx", "utf8");
const catalogo = readFileSync("src/app/(marketplace)/auto/page.tsx", "utf8");

/**
 * Il sorgente senza i commenti.
 *
 * Serve perche' i commenti di quella pagina **parlano** di `rel="next"` per
 * spiegare perche' non si scrive, e cercarlo nel file intero lo trovava
 * li'. E' il terzo inciampo dello stesso tipo in due giorni: un guardiano
 * che legge il testo di un sorgente legge anche cio' che il sorgente dice
 * **di** se stesso.
 */
const soloCodice = (testo: string) =>
  testo
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((riga) => !riga.trimStart().startsWith("//"))
    .join("\n");

describe("ogni pagina della serie dichiara se stessa", () => {
  it("la ricerca paginata non e' canonica alla prima pagina", () => {
    expect(ricerca).toContain("`/ricerca?page=${filters.page}`");
  });

  it("il catalogo lo faceva gia', e la regola e' la stessa", () => {
    // Se un giorno cambiasse una delle due, questo test dice che sono due.
    expect(catalogo).toContain("`/auto?page=${page}`");
  });

  it("le pagine numerate non finiscono fra le combinazioni da non indicizzare", () => {
    // `page` non e' un filtro: toglierlo prima di decidere e' tutta la
    // correzione. Le combinazioni di filtri restano noindex, e ci restano
    // apposta: con la citta' a testo libero sono infinite.
    expect(ricerca).toContain('filtriSenzaPagina.delete("page")');
    expect(ricerca).toContain("const isFiltered = filtriSenzaPagina.toString().length > 0");
  });

  it("ogni pagina ha un titolo suo", () => {
    expect(ricerca).toContain("`Ricerca Veicoli - Pagina ${filters.page}`");
  });
});

describe("le pagine oltre la fine non si dichiarano ufficiali", () => {
  it("la ricerca le mette fuori indice, come gia' il catalogo", () => {
    // Senza, `?page=999` risponderebbe 200 con zero risultati e
    // dichiarerebbe se stessa come indirizzo buono: uno spazio infinito di
    // pagine vuote. Misurato sul catalogo il 05/09/2026.
    expect(ricerca).toContain("contaVeicoliRicercabili");
    expect(ricerca).toMatch(/robots: \{ index: false, follow: true \}/);
    expect(catalogo).toContain("oltreLaFine");
  });

  it("senza conteggio non si dichiara niente fuori posto", () => {
    // Un guasto del database non e' una pagina che non esiste: se il
    // conteggio non riesce, la pagina resta com'era.
    expect(ricerca).toContain("totale !== null &&");
  });
});

describe("cosa NON si scrive a Google", () => {
  it("niente rel=prev/next: Google non li usa piu'", () => {
    // *"Google no longer uses these tags"*. Scriverli farebbe credere a chi
    // legge il codice che il problema sia risolto da li', mentre quello che
    // conta e' il canonico suo per ogni pagina piu' collegamenti
    // percorribili.
    expect(soloCodice(ricerca)).not.toContain('rel="next"');
    expect(soloCodice(ricerca)).not.toContain('rel="prev"');
  });

  it("i collegamenti fra le pagine sono percorribili, non bottoni", () => {
    // Google segue `<a href>`. Un bottone che naviga con JavaScript non
    // porta da nessuna parte per chi indicizza -- ne' per chi apre in una
    // scheda nuova.
    expect(ricerca).toContain("href={prevHref}");
    expect(ricerca).toContain("href={nextHref}");
  });
});
