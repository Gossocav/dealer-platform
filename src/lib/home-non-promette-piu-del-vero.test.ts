import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getDemoPlan } from "@/lib/demo-plan-catalog";

/**
 * Quello che la home promette alle concessionarie deve esistere davvero, e
 * nel piano giusto.
 *
 * Il difetto che questo test impedisce e' gia' successo una volta, il
 * 01/09/2026: le pagine di vendita promettevano quattro funzioni che non
 * esistevano -- nessuno si era accorto di averle scritte. Da allora ogni voce
 * dei piani e' legata al codice che la realizza
 * (`piani-funzioni-reali.test.ts`). La home pero' e' rimasta fuori da quel
 * legame: e' testo libero dentro una pagina, e nessuno la confronta con i
 * piani.
 *
 * Qui si chiude quel varco per le sole promesse che costano care: quelle sui
 * soldi. Sono nel Pro, non nel Base, e scriverle sulla home senza dirlo
 * significa far credere a chi paga 99 euro che siano comprese.
 */

const home = readFileSync(resolve(process.cwd(), "src/app/(marketplace)/page.tsx"), "utf8");

/** Il riquadro rivolto alle concessionarie, non tutta la pagina. */
const riquadro = home.slice(
  home.indexOf('occhiello="Ho una concessionaria"'),
  home.indexOf("inEvidenza", home.indexOf('occhiello="Ho una concessionaria"'))
);

describe("la home non promette alle concessionarie piu' di quello che c'e'", () => {
  it("il riquadro esiste ancora, altrimenti questo test non guarda niente", () => {
    expect(riquadro.length).toBeGreaterThan(200);
    expect(riquadro).toContain("Cosa offre KeyAuto a chi vende");
  });

  /**
   * Conto economico, giacenza e vendite sono del Pro. Nominarli sulla home
   * senza dire da quale piano partono e' la stessa promessa vaga che il
   * progetto ha gia' pagato.
   */
  it("quando nomina i soldi, dice da quale piano", () => {
    for (const parola of ["conto economico", "giacenza", "vendite"]) {
      const posizione = riquadro.toLowerCase().indexOf(parola);
      if (posizione < 0) continue;

      // La parola "Pro" deve comparire nella stessa riga.
      const inizioRiga = riquadro.lastIndexOf("\n", posizione) + 1;
      const fineRiga = riquadro.indexOf("\n", posizione);
      const riga = riquadro.slice(inizioRiga, fineRiga < 0 ? undefined : fineRiga);

      expect(riga, `"${parola}" e' promessa senza dire che parte dal Pro`).toMatch(/\bPro\b/);
    }
  });

  it("le funzioni che nomina esistono davvero nel piano che dichiara", () => {
    const pro = getDemoPlan("pro")!.includedServices.join(" ").toLowerCase();

    expect(pro).toContain("conto economico");
    expect(pro).toContain("giacenza");
    expect(pro).toContain("vendite mese per mese");
  });

  /**
   * Documenti e promemoria sono nel Base: si possono nominare senza
   * qualificarli, ed e' giusto che restino nel riquadro perche' sono meta'
   * del lavoro quotidiano di una concessionaria.
   */
  it("quello che nomina senza qualificarlo e' davvero compreso nel Base", () => {
    const base = getDemoPlan("base")!.includedServices.join(" ").toLowerCase();

    expect(riquadro.toLowerCase()).toContain("documenti");
    expect(base).toContain("documenti");
    expect(base).toContain("promemoria");
  });
});
