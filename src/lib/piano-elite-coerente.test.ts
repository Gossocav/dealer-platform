import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getDemoPlan } from "@/lib/demo-plan-catalog";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

/**
 * Il contenuto del Piano Elite era scritto in tre posti: il catalogo dei
 * piani, la pagina pubblica del piano e la pagina abbonamento del gestionale.
 *
 * Tre copie della stessa promessa commerciale, e si erano gia' divaricate: al
 * 01/09/2026 due delle tre promettevano "Esportazione dati", che non esiste.
 * Dal 01/09/2026 la sorgente e' una sola -- il catalogo -- e le pagine la
 * leggono. Questi test non confrontano piu' tre copie: verificano che le copie
 * non possano tornare.
 */

const paginaPubblica = read("src/app/(marketplace)/registrazione/elite/page.tsx");
const paginaAbbonamento = read("src/app/abbonamento/page.tsx");

describe("il Piano Elite si racconta allo stesso modo ovunque", () => {
  const catalogo = getDemoPlan("elite")?.includedServices ?? [];

  it("il catalogo elenca qualcosa: se fosse vuoto il confronto non proverebbe niente", () => {
    expect(catalogo.length).toBeGreaterThan(5);
  });

  it("le due pagine leggono l'elenco dal catalogo invece di riscriverlo", () => {
    for (const [nome, sorgente] of [
      ["pagina pubblica", paginaPubblica],
      ["pagina abbonamento", paginaAbbonamento],
    ] as const) {
      expect(sorgente, nome).toContain("getDemoPlan");
    }
  });

  // Il difetto che questo impedisce: qualcuno rimette un elenco a mano dentro
  // una pagina "solo per aggiungere una riga", e da li' in poi le due
  // versioni ricominciano a divergere.
  it("nessuna delle due pagine tiene piu' un elenco suo", () => {
    expect(paginaPubblica).not.toMatch(/const eliteFeatures = \[\s*\{/);
    expect(paginaAbbonamento).not.toMatch(/features: \[\s*"/);
  });
});

describe("cio' che il Piano Elite non comprende piu'", () => {
  it("nessuna pagina promette la gestione delle campagne pubblicitarie", () => {
    for (const [nome, sorgente] of [
      ["catalogo", read("src/lib/demo-plan-catalog.ts")],
      ["pagina pubblica", paginaPubblica],
      ["pagina abbonamento", paginaAbbonamento],
      ["elenco piani", read("src/app/(marketplace)/registrazione/page.tsx")],
    ] as const) {
      expect(sorgente, nome).not.toContain("Google Ads");
      expect(sorgente, nome).not.toContain("Report mensile");
    }
  });

  it("il budget pubblicitario non si nomina piu', non avendo piu' un servizio a cui riferirsi", () => {
    expect(paginaPubblica).not.toContain("budget pubblicitario");
  });
});

describe("cio' che il Piano Elite comprende adesso", () => {
  it("la scheda consegna veicolo e' elencata, e solo nell'Elite", () => {
    expect(getDemoPlan("elite")?.includedServices).toContain("Scheda consegna veicolo");
    // Resta il servizio che distingue l'Elite: spostarla in un piano
    // inferiore lascerebbe l'Elite senza uno dei suoi tre argomenti.
    expect(getDemoPlan("pro")?.includedServices).not.toContain("Scheda consegna veicolo");
    expect(getDemoPlan("base")?.includedServices).not.toContain("Scheda consegna veicolo");
  });

  // Il numero non e' un dettaglio: e' il motivo per cui si sceglie l'Elite
  // invece del Pro, ed e' scritto nel limite vero dei piani.
  it("la capienza dichiarata resta quella del piano, 300 annunci", () => {
    expect(getDemoPlan("elite")?.includedServices).toContain("Fino a 300 annunci veicolo attivi");
    expect(paginaPubblica).toContain("fino a 300");
    // E il Pro non la promette: sono 150.
    expect(getDemoPlan("pro")?.includedServices).toContain("Fino a 150 annunci veicolo attivi");
  });
});
