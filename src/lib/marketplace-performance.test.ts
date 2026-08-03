import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const COMPONENTI_CON_FOTO = [
  "src/components/marketplace/vehicle-card.tsx",
  "src/components/marketplace/spec-showcase.tsx",
  "src/app/(marketplace)/auto/[id]/vehicle-gallery.tsx",
  "src/app/(marketplace)/concessionarie/page.tsx",
];

// Le foto sono scatti da telefono da diversi megabyte. Servite grezze, su un
// telefono si pagano in secondi di attesa -- proprio dove arriva il traffico
// pubblicitario.
describe("le foto non arrivano piu' a piena risoluzione", () => {
  it("nessuna pagina pubblica usa piu' un tag immagine grezzo", () => {
    for (const percorso of COMPONENTI_CON_FOTO) {
      const sorgente = read(percorso);
      expect(sorgente, `${percorso} usa ancora <img>`).not.toContain("<img");
      expect(sorgente, `${percorso} non importa next/image`).toContain('from "next/image"');
    }
  });

  it("nessuna resta senza la disattivazione del controllo, che ora non serve", () => {
    for (const percorso of COMPONENTI_CON_FOTO) {
      expect(read(percorso), percorso).not.toContain("no-img-element");
    }
  });

  // Un'immagine che riempie il suo contenitore non sa quanto sara' larga:
  // senza "sizes" il browser scarica la versione buona per uno schermo intero
  // anche dentro una griglia a quattro colonne. Chi ha misure fisse invece le
  // dichiara gia' e non ne ha bisogno.
  it("ogni foto dice al browser quanto sara' larga", () => {
    for (const percorso of COMPONENTI_CON_FOTO) {
      const sorgente = read(percorso);
      const blocchi = sorgente.split("<Image").slice(1).map((blocco) => blocco.split("/>")[0]);

      expect(blocchi.length, `${percorso} non ha immagini`).toBeGreaterThan(0);

      for (const blocco of blocchi) {
        const riempie = /\bfill\b/.test(blocco);
        const misuraFissa = /\bwidth=/.test(blocco) && /\bheight=/.test(blocco);
        const dichiaraLarghezza = /\bsizes=/.test(blocco);

        expect(riempie || misuraFissa, `${percorso}: un'immagine senza ne' fill ne' misure`).toBe(true);
        if (riempie) {
          expect(dichiaraLarghezza, `${percorso}: un'immagine a riempimento senza sizes`).toBe(true);
        }
      }
    }
  });

  it("l'archivio delle foto e' dichiarato, altrimenti verrebbero rifiutate", () => {
    const config = read("next.config.ts");
    expect(config).toContain("remotePatterns");
    expect(config).toContain("*.supabase.co");
    expect(config).toContain("/storage/v1/object/**");
  });

  it("la foto principale della scheda parte subito", () => {
    // E' la piu' grande della pagina e la prima che si vede: aspettare che il
    // browser scopra che serve costa il tempo percepito dell'atterraggio.
    expect(read("src/app/(marketplace)/auto/[id]/vehicle-gallery.tsx")).toContain("priority");
  });
});

// Ogni visita ricalcolava tutto e il browser riceveva l'ordine di non
// conservare niente: mille persone sullo stesso annuncio erano mille calcoli.
describe("le pagine pubbliche si possono conservare", () => {
  const PAGINE = [
    ["src/app/(marketplace)/page.tsx", 60],
    ["src/app/(marketplace)/auto/[id]/page.tsx", 60],
    ["src/app/(marketplace)/concessionarie/page.tsx", 300],
    ["src/app/(marketplace)/concessionarie/[slug]/page.tsx", 300],
  ] as const;

  it("dichiarano una validita' invece di rinunciare alla cache", () => {
    for (const [percorso, secondi] of PAGINE) {
      const sorgente = read(percorso);
      expect(sorgente, `${percorso} e' ancora force-dynamic`).not.toContain('dynamic = "force-dynamic"');
      expect(sorgente, percorso).toContain(`export const revalidate = ${secondi}`);
    }
  });

  // Leggere le intestazioni della richiesta rende la pagina non conservabile,
  // qualunque validita' si dichiari.
  it("la scheda veicolo non legge piu' le intestazioni della richiesta", () => {
    const sorgente = read("src/app/(marketplace)/auto/[id]/page.tsx");
    expect(sorgente).not.toContain('from "next/headers"');
    expect(sorgente).not.toContain("x-forwarded-host");
  });

  // L'indirizzo da condividere nasceva dal nome host con cui si era arrivati:
  // senza "www" si condivideva un indirizzo diverso dello stesso annuncio.
  it("l'indirizzo da condividere e' sempre quello canonico", () => {
    expect(read("src/app/(marketplace)/auto/[id]/page.tsx")).toContain(
      "const shareUrl = toAbsoluteUrl(`/auto/${vehicle.id}`)",
    );
  });

  // Il catalogo e la ricerca leggono i filtri dall'indirizzo: restano
  // dinamici per forza, e va bene cosi'.
  it("catalogo e ricerca restano dinamici", () => {
    for (const percorso of ["src/app/(marketplace)/auto/page.tsx", "src/app/(marketplace)/ricerca/page.tsx"]) {
      expect(read(percorso), percorso).toContain('dynamic = "force-dynamic"');
    }
  });
});
