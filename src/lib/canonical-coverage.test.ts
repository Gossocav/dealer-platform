import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

/**
 * Tutte le pagine pubbliche indicizzabili, cioe' quelle dichiarate nella
 * sitemap. Le pagine a indirizzo variabile (veicolo, concessionaria) hanno il
 * canonico dentro generateMetadata e sono coperte altrove.
 */
const PAGINE_INDICIZZABILI = [
  "src/app/(marketplace)/page.tsx",
  "src/app/(marketplace)/auto/page.tsx",
  "src/app/(marketplace)/ricerca/page.tsx",
  "src/app/(marketplace)/concessionarie/page.tsx",
  "src/app/(marketplace)/come-funziona/page.tsx",
  "src/app/(marketplace)/per-chi-compra/page.tsx",
  "src/app/(marketplace)/per-le-concessionarie/page.tsx",
  "src/app/(marketplace)/faq/page.tsx",
  "src/app/(marketplace)/registrazione/page.tsx",
  "src/app/(marketplace)/registrazione/base/page.tsx",
  "src/app/(marketplace)/registrazione/pro/page.tsx",
  "src/app/(marketplace)/registrazione/elite/page.tsx",
  "src/app/(marketplace)/demo/layout.tsx",
  "src/app/(marketplace)/privacy/page.tsx",
  "src/app/(marketplace)/termini/page.tsx",
  "src/app/(marketplace)/termini-concessionari/page.tsx",
  "src/app/(marketplace)/consenso-marketing/page.tsx",
];

// Un clic su un annuncio a pagamento arriva con dei parametri attaccati
// (?utm_source=..., ?gclid=...). Senza indirizzo canonico ognuna di quelle
// varianti e' una pagina diversa per Google, e il valore della pagina si
// spezza fra tutte.
describe("ogni pagina indicizzabile dichiara qual e' il suo indirizzo vero", () => {
  it("nessuna resta senza canonico", () => {
    for (const percorso of PAGINE_INDICIZZABILI) {
      const sorgente = read(percorso);
      expect(sorgente, `${percorso} non dichiara un canonico`).toContain("canonical");
      expect(sorgente, `${percorso} non usa l'indirizzo assoluto`).toContain("toAbsoluteUrl");
    }
  });

  // La sitemap e la pagina devono dire la stessa cosa: lo stesso indirizzo
  // scritto in due modi e' un'incoerenza che poi si legge come errore.
  it("la sitemap dichiara la home come la home si dichiara", () => {
    const sitemap = read("src/app/sitemap.ts");
    expect(sitemap).toContain('entry.path === "/" ? baseUrl');
  });
});
