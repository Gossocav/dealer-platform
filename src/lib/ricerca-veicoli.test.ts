import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { filtroRicercaVeicolo } from "./ricerca-veicoli";

/**
 * Il filtro di testo della ricerca veicoli.
 *
 * **Quale difetto impedisce.** Trovato il 06/09/2026. La stessa riga esisteva
 * in due copie -- la vetrina pubblica e il gestionale -- e le due copie **non
 * erano uguali**: la pubblica ripuliva l'input, il gestionale no.
 *
 * Misurato sulla produzione, interrogando come fa la pagina:
 *
 *     "audi"      -> ok, 3 risultati
 *     "audi,bmw"  -> HTTP 400, la ricerca non risponde
 *
 * Non e' una falla -- PostgREST rifiuta la riga, quindi nessuno puo'
 * infilarci condizioni sue -- ma nel gestionale chi scriveva una virgola non
 * otteneva niente, senza capire perche'. Ed e' il difetto tipico di due copie
 * della stessa cosa: non nasce sbagliata, diverge.
 */

describe("il filtro di ricerca non si rompe con quello che la gente scrive", () => {
  it("una ricerca normale cerca in marca, modello e allestimento", () => {
    expect(filtroRicercaVeicolo("audi")).toBe("brand.ilike.%audi%,model.ilike.%audi%,version.ilike.%audi%");
  });

  it("la virgola non arriva al database: era lei a rompere la ricerca", () => {
    const filtro = filtroRicercaVeicolo("audi,bmw") ?? "";

    // Tre condizioni, non di piu': se la virgola passasse, sarebbero sei e
    // il database risponderebbe 400.
    expect(filtro.split(",").length, "la virgola dell'utente ha spezzato la riga").toBe(3);
    expect(filtro).toBe("brand.ilike.%audi bmw%,model.ilike.%audi bmw%,version.ilike.%audi bmw%");
  });

  it("il percento non cambia di nascosto cosa si sta cercando", () => {
    // Non rompe niente, ma e' il jolly di ilike: "a%i" cercherebbe tutt'altro
    // rispetto a quello che l'utente crede di aver scritto.
    expect(filtroRicercaVeicolo("audi%")).toBe("brand.ilike.%audi%,model.ilike.%audi%,version.ilike.%audi%");
  });

  it("gli spazi in mezzo si riducono a uno solo", () => {
    expect(filtroRicercaVeicolo("  audi   a3  ")).toBe(
      "brand.ilike.%audi a3%,model.ilike.%audi a3%,version.ilike.%audi a3%"
    );
  });

  it("una ricerca vuota, o fatta solo di caratteri tolti, non filtra niente", () => {
    // Il difetto da evitare: restituire "brand.ilike.%%..." che fa passare
    // tutto e sembra una ricerca riuscita.
    for (const vuoto of ["", "   ", ",", "%", " , % ", null, undefined]) {
      expect(filtroRicercaVeicolo(vuoto), `${JSON.stringify(vuoto)} avrebbe filtrato`).toBeNull();
    }
  });

  it("le parentesi e i punti passano: provati sulla produzione, non danno fastidio", () => {
    // Toglierli restringerebbe la ricerca senza motivo. "C4 (2019)" e
    // "1.6 HDi" sono cose che si scrivono davvero.
    expect(filtroRicercaVeicolo("1.6 hdi")).toContain("brand.ilike.%1.6 hdi%");
    expect(filtroRicercaVeicolo("c4 (2019)")).toContain("brand.ilike.%c4 (2019)%");
  });
});

describe("la copia doppia non puo' rinascere", () => {
  /**
   * Il difetto non era la virgola: era che la stessa riga stesse scritta in
   * due posti. Finche' resta in due posti, un giorno divergono di nuovo.
   */
  it("nessuna pagina si ricostruisce il filtro a mano", () => {
    for (const percorso of [
      "src/components/vehicles/vehicles-management-page.tsx",
      "src/app/(marketplace)/ricerca/page.tsx",
    ]) {
      const codice = readFileSync(resolve(process.cwd(), percorso), "utf8");

      expect(codice, `${percorso} si riscrive il filtro invece di usare filtroRicercaVeicolo`).not.toMatch(
        /brand\.ilike\.%\$\{/
      );
      expect(codice, `${percorso} non usa il filtro comune`).toContain("filtroRicercaVeicolo");
    }
  });
});
