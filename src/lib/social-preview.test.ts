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

// Disegnare un'anteprima costa: interrogazione al database, scaricamento di
// una foto da qualche megabyte, composizione del PNG. Misurato in produzione:
// quasi cinque secondi, e veniva rifatto a ogni richiesta.
describe("le anteprime non si ridisegnano a ogni richiesta", () => {
  const card = read("src/lib/og-card.tsx");

  it("dichiara per quanto si puo' riusare quella gia' disegnata", () => {
    expect(card).toContain("OG_CACHE_CONTROL");
    expect(card).toContain("s-maxage=86400");
    expect(card).toContain("stale-while-revalidate");
  });

  it("l'intestazione viene davvero applicata all'immagine", () => {
    expect(card).toContain('headers: { "Cache-Control": OG_CACHE_CONTROL }');
  });
});

// Le foto arrivano da concessionari e da listini esterni: nessuno dei due e'
// un fornitore su cui contare.
describe("una foto lenta o enorme non blocca la generazione", () => {
  const card = read("src/lib/og-card.tsx");

  it("lo scaricamento ha un limite di tempo", () => {
    expect(card).toContain("AbortSignal.timeout(PHOTO_TIMEOUT_MS)");
  });

  it("e un tetto di peso, controllato due volte", () => {
    // "content-length" puo' mancare o mentire: serve anche la misura vera.
    expect(card).toContain("content-length");
    expect(card).toContain("buffer.byteLength > MAX_PHOTO_BYTES");
  });

  it("quando scarta la foto, l'anteprima resta di solo testo", () => {
    // Non deve mai propagare l'errore: sarebbe di nuovo il riquadro vuoto.
    expect(card).toMatch(/catch \{\s*return null;/);
  });
});

// Le foto importate dai siti delle concessionarie passano dal nostro proxy,
// che le serviva in webp: il compositore delle anteprime non sa leggere quel
// formato e sollevava "Unsupported image type", cioe' un errore 500 al posto
// dell'immagine.
describe("un formato che il compositore non sa leggere non fa fallire l'anteprima", () => {
  const card = read("src/lib/og-card.tsx");
  const proxy = read("src/app/api/image-proxy/route.ts");

  it("accetta solo i formati leggibili e scarta gli altri", () => {
    expect(card).toContain("FORMATI_LEGGIBILI");
    expect(card).toContain('"image/jpeg"');
    expect(card).toContain('"image/png"');
    expect(card).not.toMatch(/FORMATI_LEGGIBILI = \[[^\]]*webp/);
  });

  it("la foto viene chiesta in un formato leggibile", () => {
    expect(card).toContain('Accept: "image/jpeg,image/png;q=0.9,*/*;q=0.1"');
  });

  // Senza questo la richiesta resta inascoltata: il proxy imponeva webp
  // all'origine qualunque cosa chiedesse chi lo interrogava.
  it("il proxy inoltra la preferenza di chi chiede l'immagine", () => {
    expect(proxy).toContain("const acceptRichiesto = request.headers.get(\"accept\")");
    expect(proxy).toContain("Accept: acceptRichiesto ||");
  });
});
