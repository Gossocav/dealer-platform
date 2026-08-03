import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

// Le pagine che dichiarano openGraph per tenersi og:url: a queste Next NON
// aggiunge l'anteprima da solo, va indicata a mano. Chi non lo fa condivide un
// rettangolo grigio, che e' com'era tutto il sito prima.
const PAGINE_CON_OPENGRAPH = [
  "src/app/(marketplace)/page.tsx",
  "src/app/(marketplace)/auto/page.tsx",
  "src/app/(marketplace)/auto/[id]/page.tsx",
  "src/app/(marketplace)/ricerca/page.tsx",
  "src/app/(marketplace)/concessionarie/page.tsx",
  "src/app/(marketplace)/concessionarie/[slug]/page.tsx",
  "src/app/(marketplace)/registrazione/page.tsx",
  "src/app/(marketplace)/registrazione/base/page.tsx",
  "src/app/(marketplace)/registrazione/pro/page.tsx",
  "src/app/(marketplace)/registrazione/elite/page.tsx",
  "src/app/(marketplace)/demo/layout.tsx",
];

describe("nessun link condiviso resta senza anteprima", () => {
  it("ogni pagina che dichiara openGraph dichiara anche l'immagine", () => {
    for (const percorso of PAGINE_CON_OPENGRAPH) {
      const sorgente = read(percorso);
      expect(sorgente, `${percorso} dichiara openGraph`).toContain("openGraph: {");
      expect(sorgente, `${percorso} condividerebbe un riquadro vuoto`).toMatch(/images: \[/);
    }
  });

  it("le schede veicolo e concessionaria puntano alla loro immagine, non a quella generica", () => {
    expect(read("src/app/(marketplace)/auto/[id]/page.tsx")).toContain("`/og/veicolo/${id}`");
    expect(read("src/app/(marketplace)/concessionarie/[slug]/page.tsx")).toContain("`/og/concessionaria/${slug}`");
  });

  // robots.txt vieta /api, e il crawler di Facebook quel divieto lo rispetta:
  // un'immagine servita da li' non verrebbe mai scaricata.
  it("le immagini generate non stanno sotto /api", () => {
    for (const percorso of PAGINE_CON_OPENGRAPH) {
      expect(read(percorso), percorso).not.toMatch(/images: \[[^\]]*["'`]\/api\//);
    }
  });

  it("la misura e' quella che le piattaforme mostrano a tutta larghezza", () => {
    const card = read("src/lib/og-card.tsx");
    expect(card).toContain("width: 1200");
    expect(card).toContain("height: 630");
  });

  // Se l'archivio delle foto non risponde vogliamo una scheda senza foto, non
  // un'anteprima rotta: sarebbe di nuovo il rettangolo grigio.
  it("una foto che non si carica non rompe l'anteprima", () => {
    const card = read("src/lib/og-card.tsx");
    expect(card).toContain("async function loadPhoto");
    expect(card).toMatch(/catch \{\s*return null;/);
  });

  it("un veicolo tolto dal catalogo tiene comunque un'anteprima presentabile", () => {
    const route = read("src/app/og/veicolo/[id]/route.tsx");
    expect(route).toContain("Veicolo non disponibile");
    expect(route).toContain("renderOgCard");
  });
});
