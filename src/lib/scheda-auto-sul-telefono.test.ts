import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * **La scheda auto sul telefono: l'ordine e cosa si richiude.**
 *
 * Misurato con un browser vero a 390x844 su otto schede di produzione, il
 * 20/09/2026:
 *
 * | | prima | dopo |
 * |---|---|---|
 * | altezza tipica | 6.205px (7,4 schermate) | 4.971px (5,9) |
 * | la piu' lunga | 6.300px (7,5 schermate) | 4.999px (5,9) |
 * | il modulo comincia a | 3.780px | 2.598px |
 *
 * Il numero che conta e' il terzo: il modulo "Richiedi informazioni" e'
 * l'unico punto della pagina che produce clienti, e stava dopo quattro
 * schermate e mezzo di scorrimento. Adesso e' a tre.
 *
 * Questi controlli leggono il sorgente: dicono che le decisioni sono
 * scritte, **non** che il browser le applichi. La prova vera e' stata fatta
 * con Playwright alle due larghezze, e i numeri qui sopra vengono da li'.
 */
const scheda = readFileSync("src/app/(marketplace)/auto/[id]/page.tsx", "utf8");

/**
 * Il sorgente senza i commenti.
 *
 * Serve perche' i commenti di questa pagina **parlano** di `<details>` e di
 * `order-*` per spiegarli: contarli insieme al codice faceva dire al
 * guardiano che il modulo sta dentro tre riquadri richiudibili, e non e'
 * vero. E' lo stesso inciampo gia' visto il 19/09 con "Su richiesta".
 */
const senzaCommenti = (testo: string) =>
  testo
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((riga) => !riga.trimStart().startsWith("//"))
    .join("\n");

const schedaSolaCodice = senzaCommenti(scheda);
const involucro = readFileSync("src/app/(marketplace)/layout.tsx", "utf8");
const stili = readFileSync("src/app/globals.css", "utf8");

describe("i quattro dati che decidono restano fuori da tutto", () => {
  it("sono quattro, e sono quelli", () => {
    const blocco = scheda.slice(scheda.indexOf("const heroSpecs"), scheda.indexOf("const descrizione"));
    const chiavi = [...blocco.matchAll(/key: "([a-z0-9_]+)"/g)].map((m) => m[1]);
    expect(chiavi).toEqual(["registration_date", "mileage", "fuel", "transmission"]);
  });

  it("la potenza tolta di li' non e' sparita dalla pagina", () => {
    // Toglierla dai quattro dati senza rimetterla altrove l'avrebbe fatta
    // sparire: in Italia la potenza si legge in cavalli, ed era l'unica
    // delle due misure che il compratore capisce.
    const tecnica = readFileSync("src/lib/scheda-tecnica.ts", "utf8");
    expect(tecnica).toContain('label: "Potenza CV"');
    expect(tecnica).toContain("veicolo.power_cv");
  });
});

describe("l'ordine sul telefono", () => {
  /**
   * **Questo caso e' stato riscritto il 20/09/2026, e non e' un
   * aggiustamento: la decisione e' cambiata.**
   *
   * Fissava l'ordine deciso il giorno prima -- foto, titolo, quattro dati,
   * **modulo** -- costruito ragionando sulla distanza in pixel. Guardando
   * la pagina si e' visto che il modulo arrivava **prima della
   * descrizione**: si chiedeva al cliente di scrivere prima di avergli
   * mostrato cosa compra. L'ordine giusto e' quello in cui uno decide --
   * guarda, capisce, contatta -- e sta in
   * `src/lib/ordine-della-scheda-auto.test.ts`, che lo controlla per
   * intero.
   *
   * Qui resta solo cio' che quel file non copre: che le foto vengano prima
   * dei quattro dati, e che l'ordine valga solo sul telefono.
   */
  it("le foto vengono prima dei quattro dati", () => {
    // Le classi `order-*`: il numero e' la posizione sul telefono.
    const posizione = (ancora: string) => {
      const i = schedaSolaCodice.indexOf(ancora);
      expect(i, `non trovo ${ancora}`).toBeGreaterThan(-1);
      const m = [...schedaSolaCodice.slice(0, i).matchAll(/\border-(\d)\b/g)];
      return m.length ? Number(m[m.length - 1][1]) : null;
    };
    expect(posizione("<VehicleGallery")).toBe(2);
    expect(posizione("heroSpecs.map")).toBe(3);
  });

  it("l'ordine vale solo sul telefono: sopra i 1024px torna la pagina a due colonne", () => {
    // `contents` scioglie i due contenitori nella griglia, e `lg:block` li
    // ricompone. Senza il secondo, il desktop diventerebbe una colonna sola.
    expect(scheda).toMatch(/<section className="contents[^"]*lg:block/);
    expect(scheda).toMatch(/<aside className="contents[^"]*lg:block/);
  });
});

describe("cosa si richiude, e cosa non si tocca", () => {
  it("scheda tecnica, recapiti e colonne del pie' di pagina si richiudono", () => {
    // Tre riquadri, tutti con la stessa classe: si aprono da soli sopra i
    // 1024px, cosi' su desktop non si nasconde niente.
    expect((schedaSolaCodice.match(/aperto-da-grande/g) ?? []).length).toBe(2);
    expect(involucro).toContain("aperto-da-grande");
  });

  it("**il modulo di contatto non si richiude e non si stringe**", () => {
    // E' il punto in cui il sito guadagna, sistemato il 19/09/2026.
    // Portarlo su e' meta' del lavoro; nasconderlo dietro un clic
    // disferebbe l'altra meta'.
    const i = schedaSolaCodice.indexOf("<RequestInformationForm");
    const prima = schedaSolaCodice.slice(0, i);
    const dettagliAperti = (prima.match(/<details/g) ?? []).length - (prima.match(/<\/details>/g) ?? []).length;
    expect(dettagliAperti, "il modulo e' finito dentro un <details>").toBe(0);
  });

  it("il contenuto richiuso resta nel documento, quindi si indicizza", () => {
    // `<details>` nasconde con il foglio di stile, non toglie dalla pagina:
    // e' la ragione per cui si usa questo e non JavaScript. Nessun
    // `hidden`, nessun `display:none` condizionale sul contenuto.
    expect(scheda).not.toMatch(/\{\s*larghezza\s*[<>]/);
    expect(scheda).toContain("<details");
  });
});

describe("la regola che apre i riquadri sullo schermo largo", () => {
  it("agisce su ::details-content, non sui figli", () => {
    // Il primo tentativo era `display: block !important` sui figli, e **non
    // funzionava**: un `<details>` chiuso salta il contenuto con
    // `content-visibility` sullo pseudo-elemento, e una regola sui figli non
    // lo tocca. Misurato con un browser: su desktop restava tutto chiuso.
    expect(stili).toContain("details.aperto-da-grande::details-content");
    expect(stili).toContain("content-visibility: visible");
  });

  it("nasconde il pulsante solo dove il contenuto compare davvero", () => {
    // Senza il `@supports`, un browser che non conosce quello
    // pseudo-elemento nasconderebbe il pulsante **e** terrebbe chiuso il
    // contenuto: il riquadro diventerebbe irraggiungibile.
    const i = stili.indexOf("details.aperto-da-grande > summary");
    expect(i).toBeGreaterThan(-1);
    expect(stili.slice(Math.max(0, i - 400), i)).toContain("@supports selector(::details-content)");
  });
});
