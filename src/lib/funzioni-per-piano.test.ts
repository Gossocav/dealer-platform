import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getDemoPlan } from "@/lib/demo-plan-catalog";
import {
  nomeDelPiano,
  pianoComprende,
  pianoMinimoPer,
  spiegazioneFunzioneChiusa,
  type FunzioneDiPiano,
} from "@/lib/funzioni-per-piano";

const TUTTE: FunzioneDiPiano[] = ["conto-economico", "vendite", "giacenza", "scheda-consegna", "vetrina-home"];

describe("chi apre cosa", () => {
  it("il conto economico parte dal Pro", () => {
    expect(pianoComprende("base", "conto-economico")).toBe(false);
    expect(pianoComprende("pro", "conto-economico")).toBe(true);
    expect(pianoComprende("elite", "conto-economico")).toBe(true);
  });

  it("vendite e giacenza vanno insieme al conto economico", () => {
    // Nascono dallo stesso dato: la giacenza si conta dalla data di acquisto,
    // che si scrive nel conto economico. Separarli lascerebbe mezza funzione
    // aperta a chi non l'ha pagata.
    for (const funzione of ["vendite", "giacenza"] as const) {
      expect(pianoComprende("base", funzione), funzione).toBe(false);
      expect(pianoComprende("pro", funzione), funzione).toBe(true);
    }
  });

  it("la scheda consegna e la vetrina restano dell'Elite", () => {
    for (const funzione of ["scheda-consegna", "vetrina-home"] as const) {
      expect(pianoComprende("pro", funzione), funzione).toBe(false);
      expect(pianoComprende("elite", funzione), funzione).toBe(true);
    }
  });
});

/**
 * Il difetto che questi test impediscono: un codice di piano storto -- una
 * stringa vuota, un valore mai visto, un `null` mentre la risposta del server
 * non e' ancora arrivata -- che apre una funzione riservata. Meglio negarla a
 * chi ne ha diritto, che se ne accorge e lo dice, che regalarla a chi non
 * l'ha pagata, che non lo dira' mai.
 */
describe("un piano che non si riconosce non apre niente", () => {
  const STORTI = [null, undefined, "", "   ", "premium", "BASE_PLUS", "0", "elit"];

  for (const valore of STORTI) {
    it(`"${String(valore)}" non apre nessuna funzione`, () => {
      for (const funzione of TUTTE) {
        expect(pianoComprende(valore, funzione), funzione).toBe(false);
      }
    });
  }

  it("ma le maiuscole e gli spazi non tolgono un diritto vero", () => {
    expect(pianoComprende("  ELITE ", "scheda-consegna")).toBe(true);
    expect(pianoComprende("Pro", "conto-economico")).toBe(true);
  });
});

describe("i piani restano cumulativi", () => {
  // Il difetto che questo impedisce: dichiarare le funzioni come elenchi di
  // piani invece che come soglia permetterebbe di scrivere una funzione che
  // c'e' nel Pro e non nell'Elite. Chi paga di piu' non deve perdere niente.
  it("tutto quello che apre il Pro lo apre anche l'Elite", () => {
    for (const funzione of TUTTE) {
      if (pianoComprende("pro", funzione)) {
        expect(pianoComprende("elite", funzione), funzione).toBe(true);
      }
    }
  });

  it("tutto quello che apre il Base lo aprono anche gli altri due", () => {
    for (const funzione of TUTTE) {
      if (pianoComprende("base", funzione)) {
        expect(pianoComprende("pro", funzione), funzione).toBe(true);
        expect(pianoComprende("elite", funzione), funzione).toBe(true);
      }
    }
  });
});

/**
 * La regola e' scritta in un posto solo, ma viene raccontata in due: qui e
 * nelle pagine di vendita. Se divergono, il concessionario paga per una
 * funzione che poi non trova -- o non paga per una che avrebbe.
 */
describe("quello che si vende e quello che si apre combaciano", () => {
  const CORRISPONDENZE: Array<{ funzione: FunzioneDiPiano; voce: string }> = [
    { funzione: "conto-economico", voce: "Conto economico di ogni vettura" },
    { funzione: "vendite", voce: "Vendite mese per mese" },
    { funzione: "giacenza", voce: "Giorni di giacenza del parco" },
    { funzione: "scheda-consegna", voce: "Scheda consegna veicolo" },
  ];

  for (const { funzione, voce } of CORRISPONDENZE) {
    it(`"${voce}" e' promessa esattamente ai piani che la aprono`, () => {
      for (const piano of ["base", "pro", "elite"] as const) {
        const promessa = (getDemoPlan(piano)?.includedServices ?? []).includes(voce);
        expect(promessa, `${piano}: promessa=${promessa}, aperta=${pianoComprende(piano, funzione)}`).toBe(
          pianoComprende(piano, funzione)
        );
      }
    });
  }
});

describe("a chi non ce l'ha si dice cosa gli manca e da quale piano", () => {
  it("la spiegazione nomina il piano che serve", () => {
    expect(spiegazioneFunzioneChiusa("conto-economico")).toContain("Piano Pro");
    expect(spiegazioneFunzioneChiusa("scheda-consegna")).toContain("Piano Elite");
  });

  // Una schermata che dice solo "non disponibile con il tuo piano" fa
  // ripartire il concessionario da zero: deve capire cosa si sta perdendo.
  it("dice anche cosa fa la funzione, non solo che e' chiusa", () => {
    for (const funzione of TUTTE) {
      const frase = spiegazioneFunzioneChiusa(funzione);
      expect(frase.length, funzione).toBeGreaterThan(80);
      expect(frase, funzione).toContain("E' compresa a partire dal");
    }
  });

  it("il nome del piano si scrive come sulle pagine di vendita", () => {
    expect(nomeDelPiano("pro")).toBe("Piano Pro");
    expect(nomeDelPiano("elite")).toBe("Piano Elite");
  });
});

// La scheda consegna aveva la sua regola scritta dentro il proprio modulo.
// Due elenchi separati sarebbero divergiti al primo cambio di piano.
describe("la scheda consegna non tiene piu' una regola sua", () => {
  it("delega alla soglia comune", () => {
    const modulo = readFileSync(resolve(process.cwd(), "src/lib/scheda-consegna.ts"), "utf8");
    expect(modulo).toContain('pianoComprende(planCode, "scheda-consegna")');
    expect(modulo).not.toMatch(/PIANI_CON_SCHEDA_CONSEGNA: readonly DealerPlanCode\[\] = \["elite"\]/);
  });

  it("e continua a rispondere come prima", () => {
    expect(pianoMinimoPer("scheda-consegna")).toBe("elite");
  });
});
