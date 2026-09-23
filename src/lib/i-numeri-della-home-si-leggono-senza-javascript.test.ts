import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * I quattro numeri in cima alla home devono stare nell'HTML servito.
 *
 * IL DIFETTO CHE IMPEDISCE, misurato il 22/09/2026 chiedendo
 * https://www.keyauto.it/ con l'agente di Googlebot: la pagina servita
 * conteneva `0 | Veicoli pubblicati`, `0 | Concessionarie partner`,
 * `0 | Citta' coperte`, `0 | Marche disponibili`. Il totale vero non
 * compariva in nessun punto dei 166 KB, nemmeno fra i dati di idratazione:
 * il conteggio giusto (270, misurato con la chiave pubblica sulla stessa
 * interrogazione della pagina) esisteva solo lato server e veniva consegnato
 * a un componente client che partiva da zero.
 *
 * Chi non esegue JavaScript leggeva una home che dichiara **zero veicoli** --
 * su un sito la cui unica strada per farsi trovare e' l'indicizzazione.
 *
 * QUESTO CONTROLLO GUARDA LA PROPRIETA', NON IL TESTO: pretende che il file
 * della home non importi nessun componente client per disegnare quei numeri,
 * e che il componente che lo faceva non torni a esistere. Un test che
 * cercasse la riga esatta cadrebbe alla prima riformattazione e passerebbe
 * davanti a un componente client con un altro nome.
 */
describe("i numeri della home si leggono senza JavaScript", () => {
  const sorgente = readFileSync("src/app/(marketplace)/page.tsx", "utf8");

  /**
   * **I commenti si tolgono prima di cercare**, e questo controllo lo ha
   * imparato cadendo: la prima stesura cercava "AnimatedCounter" nel file e
   * diventava rossa **sul file gia' corretto**, perche' il commento che
   * spiega perche' quel componente e' stato tolto ne contiene il nome.
   * E' la regola gia' scritta in AGENTS.md -- *il mio controllo sa
   * distinguere cio' che fa da cio' che ne parla?* -- incontrata dal vivo
   * il 22/09/2026, dentro il guardiano scritto per un altro difetto.
   */
  const home = sorgente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("la home non passa i suoi numeri a un contatore animato", () => {
    expect(home).not.toMatch(/AnimatedCounter/);
  });

  it("il componente che partiva da zero non esiste piu'", () => {
    // Toglierlo invece di correggerlo e' la scelta del 22/09/2026: aveva un
    // utilizzatore solo, e un componente riusabile male e' un'occasione di
    // sbagliare che si toglie invece di documentare.
    expect(existsSync("src/components/marketplace/animated-counter.tsx")).toBe(false);
  });

  it("nessun componente client disegna i quattro riquadri", () => {
    // La funzione Stat e' il solo punto che rende quei numeri: deve scriverli
    // direttamente, non delegarli. Si cerca la proprieta' -- che dentro Stat
    // compaia il valore -- non una riga precisa.
    const stat = home.slice(home.indexOf("function Stat("));
    const corpo = stat.slice(0, stat.indexOf("\n}"));
    expect(corpo).toMatch(/\{value\.toLocaleString\(/);
    expect(corpo).not.toMatch(/<[A-Z][A-Za-z]*Counter/);
  });
});
