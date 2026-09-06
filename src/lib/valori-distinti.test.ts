import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { perConfrontoSenzaMaiuscole, valoriDistinti } from "./valori-distinti";

/**
 * Le tendine non ripetono la stessa voce, e sceglierla trova tutte le auto.
 *
 * **Quale difetto impedisce.** Segnalato dal titolare il 06/09/2026: nelle
 * tendine la stessa voce compariva due volte. Misurato in produzione:
 *
 *     marche:   35 valori,  0 scritti in piu' modi
 *     modelli:  94 valori,  8 scritti in piu' modi
 *
 * E non era estetica. Il filtro confrontava in modo esatto, quindi
 * **qualunque delle due voci si scegliesse si perdevano le altre auto**:
 *
 *     chi sceglieva "Kona"  trovava  1 auto  invece di 8
 *     chi sceglieva "C3"    trovava 11       invece di 13
 *     chi sceglieva "c3"    trovava  2       invece di 13
 */

describe("una voce sola per ogni valore", () => {
  it("le scritture diverse della stessa cosa diventano una", () => {
    expect(valoriDistinti(["C3", "c3", "C3"])).toEqual(["C3"]);
  });

  it("vince la scrittura piu' usata nei dati, non la prima incontrata", () => {
    // In produzione "kona" compare 7 volte e "Kona" una: la tendina deve
    // mostrare quella che il concessionario usa davvero.
    expect(valoriDistinti(["Kona", "kona", "kona", "kona"])).toEqual(["kona"]);
    expect(valoriDistinti(["c3", "C3", "C3"])).toEqual(["C3"]);
  });

  it("a parita' la scelta e' stabile, non a caso", () => {
    // Un elenco che cambia da una visita all'altra sembra rotto anche
    // quando le auto sono le stesse.
    const primo = valoriDistinti(["Corsa", "corsa"]);
    const secondo = valoriDistinti(["corsa", "Corsa"]);
    expect(primo).toEqual(secondo);
  });

  it("gli accenti non creano una voce in piu'", () => {
    expect(valoriDistinti(["Citroën", "citroen", "Citroën"])).toEqual(["Citroën"]);
  });

  it("valori vuoti e assenti restano fuori", () => {
    // Prima finivano dentro come "-" e comparivano in tendina.
    expect(valoriDistinti(["", "  ", null, undefined, "Audi"])).toEqual(["Audi"]);
  });

  it("l'ordine e' quello che si legge in italiano", () => {
    expect(valoriDistinti(["Zoe", "Ãgila", "Audi"])[0]).not.toBe("Zoe");
    expect(valoriDistinti(["Panda", "Audi", "Clio"])).toEqual(["Audi", "Clio", "Panda"]);
  });
});

describe("i caratteri jolly non allargano la ricerca", () => {
  /**
   * Dentro un confronto senza maiuscole `%` significa "qualsiasi cosa" e `_`
   * "un carattere qualsiasi". Misurato sulla produzione: cercare il modello
   * `C%` restituisce **49 auto** invece di nessuna, `C_` ne restituisce 15.
   * Protetti ne restituiscono zero, che e' la risposta giusta.
   *
   * Oggi nessun modello contiene quei caratteri, ma i nomi li scrivono le
   * concessionarie e nessuno glielo impedisce.
   */
  it("il percento diventa testo", () => {
    expect(perConfrontoSenzaMaiuscole("C%")).toBe("C\\%");
  });

  it("il trattino basso diventa testo", () => {
    expect(perConfrontoSenzaMaiuscole("C_")).toBe("C\\_");
  });

  it("la barra rovescia stessa viene protetta", () => {
    // Senza, "C\%" proteggerebbe il percento per sbaglio o lascerebbe una
    // barra spaiata che rompe il confronto.
    expect(perConfrontoSenzaMaiuscole("C\\")).toBe("C\\\\");
  });

  it("un nome normale non viene toccato", () => {
    for (const nome of ["C3", "C5 Aircross", "1.6 HDi", "Citroën"]) {
      expect(perConfrontoSenzaMaiuscole(nome)).toBe(nome);
    }
  });
});

describe("le due parti vanno insieme, in tutte le pagine", () => {
  /**
   * Unificare la tendina senza rendere il confronto indifferente alle
   * maiuscole **peggiorerebbe le cose**: chi sceglie "C3" continuerebbe a
   * vederne 11 su 13, e non avrebbe piu' nemmeno la voce "c3" per trovare
   * le altre due.
   */
  const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

  const pagine = [
    "src/app/(marketplace)/ricerca/page.tsx",
    "src/components/vehicles/vehicles-management-page.tsx",
  ];

  it("marca e modello si confrontano senza maiuscole", () => {
    for (const percorso of pagine) {
      const codice = leggi(percorso);
      expect(codice, `${percorso} confronta ancora la marca in modo esatto`).not.toMatch(/\.eq\("brand"/);
      expect(codice, `${percorso} confronta ancora il modello in modo esatto`).not.toMatch(/\.eq\("model"/);
      expect(codice, `${percorso} non protegge i caratteri jolly`).toContain("perConfrontoSenzaMaiuscole");
    }
  });

  it("le tendine passano tutte dalla stessa regola", () => {
    for (const percorso of [...pagine, "src/app/(marketplace)/page.tsx"]) {
      expect(leggi(percorso), `${percorso} non usa valoriDistinti`).toContain("valoriDistinti");
    }
  });

  it("nessuna pagina si riscrive la propria versione di uniqueValues", () => {
    // Ce n'erano due copie identiche, una per pagina: e' il modo in cui due
    // regole uguali diventano diverse.
    for (const percorso of [...pagine, "src/app/(marketplace)/page.tsx"]) {
      expect(leggi(percorso), `${percorso} ha ancora la sua copia`).not.toContain("function uniqueValues");
    }
  });
});
