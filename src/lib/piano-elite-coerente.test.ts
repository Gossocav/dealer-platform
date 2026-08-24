import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getDemoPlan } from "@/lib/demo-plan-catalog";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

/**
 * Il contenuto del Piano Elite e' scritto in tre posti: il catalogo dei piani,
 * la pagina pubblica del piano e la pagina abbonamento del gestionale.
 *
 * Tre copie della stessa promessa commerciale. Se una si aggiorna e le altre
 * no, il piano si racconta in modo diverso a seconda di dove lo si guarda --
 * e la differenza la scopre il cliente, non noi. E' successo con le foto dei
 * veicoli, dove la stessa regola scritta due volte aveva smesso di combaciare.
 */

const paginaPubblica = read("src/app/(marketplace)/registrazione/elite/page.tsx");
const paginaAbbonamento = read("src/app/abbonamento/page.tsx");

/** I titoli delle voci elencate nella pagina pubblica del piano. */
function vociPaginaPubblica() {
  const blocco = paginaPubblica.slice(
    paginaPubblica.indexOf("const eliteFeatures = ["),
    paginaPubblica.indexOf("export default function")
  );
  return Array.from(blocco.matchAll(/title: "([^"]+)"/g)).map((match) => match[1]);
}

/** Le voci del riquadro Elite nella pagina abbonamento. */
function vociPaginaAbbonamento() {
  const inizioElite = paginaAbbonamento.indexOf('name: "Piano Elite"');
  const inizioElenco = paginaAbbonamento.indexOf("features: [", inizioElite);
  const blocco = paginaAbbonamento.slice(inizioElenco, paginaAbbonamento.indexOf("]", inizioElenco));
  return Array.from(blocco.matchAll(/"([^"]+)"/g)).map((match) => match[1]);
}

describe("il Piano Elite si racconta allo stesso modo ovunque", () => {
  const catalogo = getDemoPlan("elite")?.includedServices ?? [];

  it("il catalogo elenca qualcosa: se fosse vuoto il confronto non proverebbe niente", () => {
    expect(catalogo.length).toBeGreaterThan(5);
  });

  it("la pagina pubblica del piano elenca le stesse voci del catalogo", () => {
    expect(vociPaginaPubblica()).toEqual(catalogo);
  });

  it("la pagina abbonamento elenca le stesse voci del catalogo", () => {
    expect(vociPaginaAbbonamento()).toEqual(catalogo);
  });
});

// Tolte su richiesta del titolare il 24/08/2026: il piano non comprende piu'
// la gestione della pubblicita' online ne' il rendiconto mensile. Restano
// scritte qui perche' un ritorno silenzioso sarebbe una promessa commerciale
// riaccesa senza che nessuno l'abbia decisa.
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
  it("la scheda consegna veicolo e' elencata dappertutto", () => {
    expect(getDemoPlan("elite")?.includedServices).toContain("Scheda consegna veicolo");
    expect(vociPaginaPubblica()).toContain("Scheda consegna veicolo");
    expect(vociPaginaAbbonamento()).toContain("Scheda consegna veicolo");
  });

  // Il numero non e' un dettaglio: e' il motivo per cui si sceglie l'Elite
  // invece del Pro, ed e' scritto nel limite vero dei piani.
  it("la capienza dichiarata resta quella del piano, 300 annunci", () => {
    expect(getDemoPlan("elite")?.includedServices).toContain("Fino a 300 annunci veicolo attivi");
    expect(paginaPubblica).toContain("fino a 300");
  });
});
