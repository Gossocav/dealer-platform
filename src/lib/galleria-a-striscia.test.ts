import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * **La galleria: una foto grande e una striscia che scorre.**
 *
 * Misurato con un browser vero a 390x844 sulla stessa scheda, il
 * 20/09/2026:
 *
 * | | prima | dopo |
 * |---|---|---|
 * | galleria | 1.618px | 566px |
 * | pagina | 4.971px (5,9 schermate) | 3.919px (4,6) |
 * | il modulo comincia a | 2.598px | 1.546px |
 * | foto raggiungibili senza clic | 8 su 13 | **13 su 13** |
 * | immagini all'apertura | 4 (44 KB) | 5 (59 KB) |
 *
 * L'ultima riga e' la condizione che ha quasi fatto fallire il lavoro, ed e'
 * raccontata sotto: una prima versione scaricava **14 immagini e 113 KB**.
 */
const galleria = readFileSync("src/app/(marketplace)/auto/[id]/vehicle-gallery.tsx", "utf8");

const senzaCommenti = galleria
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((riga) => !riga.trimStart().startsWith("//"))
  .join("\n");

describe("tutte le foto si raggiungono scorrendo, senza clic in piu'", () => {
  it("la striscia le disegna tutte, non le prime otto", () => {
    // Prima erano otto in griglia e le altre dietro un riquadro "+5 foto":
    // per vedere la nona serviva un clic, e le foto sono la cosa che fa
    // vendere.
    expect(senzaCommenti).toContain("images.map(");
    expect(senzaCommenti).not.toContain("THUMBNAIL_LIMIT");
    expect(senzaCommenti).not.toMatch(/\+\{[^}]*\}\s*foto/);
  });

  it("e si scorre di lato invece di impilarsi", () => {
    // Su un telefono la griglia era a una colonna: otto miniature alte
    // 128px facevano circa 1.120px, i due terzi della galleria.
    expect(senzaCommenti).toMatch(/overflow-x-auto/);
    expect(senzaCommenti).toMatch(/flex-none/);
    // Arrivando in fondo il gesto non deve trascinare la pagina.
    expect(senzaCommenti).toMatch(/overscroll-x-contain/);
  });
});

describe("le miniature fuori schermo non si scaricano", () => {
  it("se ne caricano poche all'apertura e le altre a gruppi", () => {
    // **`loading="lazy"` da solo non bastava, e solo la misura lo ha detto.**
    // In una striscia orizzontale il browser considera "in vista" anche
    // quello che sta oltre il bordo destro: con tredici miniature scaricava
    // tredici immagini. Misurato: da 4 immagini e 44 KB si passava a 14 e
    // 113 KB. La pagina si accorciava e il telefono rallentava.
    expect(senzaCommenti).toContain("MINIATURE_SUBITO");
    expect(senzaCommenti).toContain("IntersectionObserver");
    // L'osservatore deve guardare **dentro** la striscia, non la pagina:
    // altrimenti non si accorge mai di uno scorrimento laterale.
    expect(senzaCommenti).toMatch(/root:\s*striscia/);
  });

  it("quelle non ancora caricate tengono il posto", () => {
    // Senza, la striscia si allungherebbe mentre il dito scorre e le foto
    // scapperebbero da sotto il pollice.
    expect(senzaCommenti).toMatch(/index < miniatureCaricate/);
    expect(senzaCommenti).toMatch(/aria-hidden="true" className="block h-full w-full/);
  });

  it("la foto grande resta l'unica che parte subito", () => {
    // `priority` su piu' di un'immagine annulla il senso di `priority`.
    expect((senzaCommenti.match(/priority/g) ?? []).length).toBe(1);
  });
});

describe("toccando la foto grande si ingrandisce e si scorre", () => {
  it("la foto grande apre lo schermo intero", () => {
    // Verificato con un browser: tocco -> "1 / 13", scorro avanti ->
    // "2 / 13", scorro indietro -> "1 / 13", chiudo col bottone e con Esc.
    expect(senzaCommenti).toMatch(/aria-label=\{`Apri le foto di \$\{label\}`\}/);
    expect(senzaCommenti).toContain('role="dialog"');
    expect(senzaCommenti).toContain('aria-modal="true"');
  });

  it("il gesto per cambiare foto c'e' ancora", () => {
    expect(senzaCommenti).toContain("onTouchStart");
    expect(senzaCommenti).toContain("onTouchEnd");
    expect(senzaCommenti).toContain("SWIPE_MIN_DISTANCE");
  });

  it("ogni miniatura apre la sua foto, non la prima", () => {
    expect(senzaCommenti).toMatch(/onClick=\{\(\) => setOpenIndex\(index\)\}/);
  });

  it("chi ascolta la pagina sente **un** comando per chiudere, non due", () => {
    // Il difetto, corretto il 20/09/2026: lo sfondo toccabile si chiamava
    // "Chiudi le foto" come il bottone in alto. Un lettore di schermo
    // annunciava due comandi con la stessa identica dicitura, e uno dei due
    // e' un rettangolo invisibile grande quanto lo schermo: chi ascolta non
    // ha nessun modo di sapere quale fa cosa.
    //
    // Verificato con un browser: prima ne annunciava 2, adesso 1, e lo
    // sfondo continua a chiudere al tocco.
    expect((senzaCommenti.match(/aria-label="Chiudi le foto"/g) ?? []).length).toBe(1);

    // Lo sfondo resta toccabile ma sparisce dalla voce. Le due righe vanno
    // **insieme**: nascosto alla voce ma raggiungibile col Tab sarebbe
    // peggio di prima, perche' il fuoco finirebbe su qualcosa che il
    // lettore dichiara inesistente.
    const sfondo = senzaCommenti.slice(senzaCommenti.indexOf("closeUnlessSwiping}"));
    const tag = sfondo.slice(0, sfondo.indexOf("/>"));
    expect(tag).toContain('aria-hidden="true"');
    expect(tag).toContain("tabIndex={-1}");
    expect(tag).not.toContain("aria-label");
  });
});
