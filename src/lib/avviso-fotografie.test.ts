import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AVVISO_FOTOGRAFIE } from "@/lib/avviso-fotografie";

/**
 * L'avviso sulle fotografie compare in quattro posti diversi -- la scheda
 * pubblica, la scheda stampabile, l'email al cliente e il messaggio da
 * copiare -- e viene da un file solo. Il difetto che questo test impedisce non
 * e' l'assenza dell'avviso: e' che fra due anni qualcuno lo ritocchi in un
 * posto e non negli altri, e la piattaforma dica tre cose diverse sulla stessa
 * questione legale.
 *
 * Chiesto dal titolare il 27/08/2026: testo fisso, su tutti i veicoli. Su
 * tutti perche' una frase che compare solo su alcuni annunci fa domandare cosa
 * abbiano di diverso quelli in cui compare.
 */

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

const SUPERFICI: Array<[string, string]> = [
  ["la scheda pubblica del veicolo", "src/app/(marketplace)/auto/[id]/page.tsx"],
  ["la scheda stampabile", "src/components/vehicles/vehicle-sheet-page.tsx"],
  ["l'email al cliente", "src/app/api/vehicles/send-to-client/route.ts"],
  ["il messaggio da copiare", "src/components/vehicles/send-to-client-dialog.tsx"],
];

describe("l'avviso sulle fotografie", () => {
  it.each(SUPERFICI)("compare in %s", (_nome, percorso) => {
    const sorgente = leggi(percorso);

    expect(sorgente).toContain("AVVISO_FOTOGRAFIE");
    // E lo prende dal modulo comune invece di riscriverselo.
    expect(sorgente).toContain('from "@/lib/avviso-fotografie"');
  });

  it.each(SUPERFICI)("non riscrive la frase a mano in %s", (_nome, percorso) => {
    const sorgente = leggi(percorso).replace(/from "@\/lib\/avviso-fotografie"/g, "");

    expect(sorgente).not.toContain("Fotografie non vincolanti:");
  });

  // Serve a chi compra, quindi deve dire due cose: che le immagini possono non
  // corrispondere, e cosa fa fede al posto loro.
  it("dice sia il limite sia cosa vale davvero", () => {
    expect(AVVISO_FOTOGRAFIE).toContain("non vincolanti");
    expect(AVVISO_FOTOGRAFIE).toContain("visione diretta");
  });
});
