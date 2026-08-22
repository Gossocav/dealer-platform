import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const galleria = readFileSync(resolve(process.cwd(), "src/app/(marketplace)/auto/[id]/vehicle-gallery.tsx"), "utf8");

// La fotografia aperta a schermo intero si disegnava grande quanto il file
// arrivato -- 600 pixel dentro un'area da 1440 -- perche' aveva la misura
// automatica con un limite massimo: un massimo puo' rimpicciolire, non
// ingrandire. Restava un francobollo in mezzo allo schermo nero.
describe("visore delle foto a schermo intero", () => {
  const visore = galleria.slice(galleria.indexOf('role="dialog"'));
  const fotoGrande = visore.slice(visore.indexOf("<Image"), visore.indexOf("/>", visore.indexOf("<Image")));

  it("la foto occupa lo spazio disponibile", () => {
    expect(fotoGrande).toMatch(/\bh-full\b/);
    expect(fotoGrande).toMatch(/\bw-full\b/);
  });

  it("conserva le proporzioni invece di tagliare la foto", () => {
    expect(fotoGrande).toMatch(/\bobject-contain\b/);
    expect(fotoGrande).not.toMatch(/\bobject-cover\b/);
  });

  it("non torna alla misura automatica, che non ingrandisce", () => {
    expect(fotoGrande).not.toMatch(/\bw-auto\b/);
  });

  // Ora la foto copre tutta l'area, sfondo compreso: senza lasciar passare i
  // clic, quello per chiudere non arriverebbe piu' allo sfondo sottostante.
  it("lascia passare il clic che chiude", () => {
    expect(fotoGrande).toMatch(/\bpointer-events-none\b/);
    expect(visore).toContain("cursor-zoom-out");
  });

  it("chiede la misura piena, non quella della miniatura", () => {
    expect(fotoGrande).toMatch(/sizes="100vw"/);
  });
});
