import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const gallery = readFileSync(
  resolve(process.cwd(), "src/app/(marketplace)/auto/[id]/vehicle-gallery.tsx"),
  "utf8",
);

// Su telefono le foto si cambiavano solo toccando le frecce laterali: due
// bersagli piccoli agli angoli, mentre il gesto naturale su una foto e'
// trascinarla di lato.
describe("scorrimento delle foto con il dito", () => {
  it("ascolta il gesto sulla zona della foto", () => {
    expect(gallery).toContain("onTouchStart={handleTouchStart}");
    expect(gallery).toContain("onTouchEnd={handleTouchEnd}");
  });

  it("cambia foto nel verso giusto", () => {
    // Trascinando verso sinistra si va avanti, come sfogliare.
    const handler = gallery.slice(gallery.indexOf("const handleTouchEnd"), gallery.indexOf("const closeUnlessSwiping"));
    expect(handler).toMatch(/deltaX < 0\)\s*showNext\(\);/);
    expect(handler).toContain("showPrevious()");
  });

  it("ignora i gesti verticali e obliqui", () => {
    // Scorrendo la pagina in verticale sopra la foto, questa non deve saltare.
    const handler = gallery.slice(gallery.indexOf("const handleTouchEnd"), gallery.indexOf("const closeUnlessSwiping"));
    expect(handler).toContain("Math.abs(deltaX) <= Math.abs(deltaY)");
  });

  it("ignora i micro-movimenti", () => {
    // Un tocco un po' mosso sullo sfondo deve chiudere, non cambiare foto.
    expect(gallery).toMatch(/const SWIPE_MIN_DISTANCE = \d+;/);
    expect(gallery).toContain("Math.abs(deltaX) < SWIPE_MIN_DISTANCE");
  });

  it("non cambia foto mentre si pizzica per ingrandire", () => {
    const start = gallery.slice(gallery.indexOf("const handleTouchStart"), gallery.indexOf("const handleTouchEnd"));
    expect(start).toContain("event.touches.length === 1");
  });

  it("non chiude la galleria alla fine di uno scorrimento", () => {
    // Il gesto produce anche un clic sullo sfondo: senza questo, cambiare foto
    // chiuderebbe la galleria nello stesso istante.
    expect(gallery).toContain("swipeHandledRef");
    expect(gallery).toContain("onClick={closeUnlessSwiping}");
  });

  it("lascia in piedi frecce e tastiera", () => {
    // Lo scorrimento si aggiunge, non sostituisce: su computer le frecce
    // restano l'unico modo col mouse.
    expect(gallery).toContain('aria-label="Foto precedente"');
    expect(gallery).toContain('aria-label="Foto successiva"');
    expect(gallery).toContain('event.key === "ArrowLeft"');
    expect(gallery).toContain('event.key === "ArrowRight"');
  });
});
