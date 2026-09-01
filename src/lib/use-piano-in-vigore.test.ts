import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Il difetto trovato in revisione: con la divisione dei piani questo aggancio
 * e' finito in dieci schermate, e le schermate si sovrappongono -- aprendo un
 * veicolo lo chiedono insieme il menu e la pagina. Erano due richieste
 * identiche al server per ogni apertura di pagina.
 */
describe("il piano si chiede una volta sola e si divide", () => {
  afterEach(async () => {
    const { dimenticaIlPianoInVigore } = await import("@/lib/use-piano-in-vigore");
    dimenticaIlPianoInVigore();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("due schermate che lo chiedono insieme fanno una richiesta sola", async () => {
    const chiamate: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, opzioni: { headers: Record<string, string> }) => {
      chiamate.push(opzioni.headers.authorization);
      return { ok: true, json: async () => ({ effectivePlanCode: "elite" }) };
    });

    vi.resetModules();
    const modulo = await import("@/lib/use-piano-in-vigore");
    modulo.dimenticaIlPianoInVigore();

    // Le due schermate partono insieme, com'e' nella realta': il menu e la
    // pagina si montano nello stesso istante.
    const [a, b] = await Promise.all([modulo.pianoPerProva("token-1"), modulo.pianoPerProva("token-1")]);

    expect(a).toBe("elite");
    expect(b).toBe("elite");
    expect(chiamate.length, "il server e' stato interrogato piu' di una volta").toBe(1);
  });

  /**
   * La chiave e' il token e non un valore fisso: se si esce e si rientra con
   * un altro account, la risposta vecchia non deve essere riusata. Un piano
   * preso in prestito da un'altra sessione aprirebbe funzioni che non
   * spettano, ed e' l'errore piu' caro fra quelli possibili qui.
   */
  it("una sessione diversa non riusa la risposta della precedente", async () => {
    const risposte: Record<string, string> = { "Bearer token-base": "base", "Bearer token-elite": "elite" };
    const chiamate: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, opzioni: { headers: Record<string, string> }) => {
      chiamate.push(opzioni.headers.authorization);
      return { ok: true, json: async () => ({ effectivePlanCode: risposte[opzioni.headers.authorization] ?? null }) };
    });

    vi.resetModules();
    const modulo = await import("@/lib/use-piano-in-vigore");
    modulo.dimenticaIlPianoInVigore();

    expect(await modulo.pianoPerProva("token-base")).toBe("base");
    expect(await modulo.pianoPerProva("token-elite")).toBe("elite");
    expect(chiamate.length).toBe(2);
  });

  /**
   * Una richiesta fallita non si ricorda: altrimenti "non lo so" resterebbe in
   * cache fino al ricaricamento della pagina, e "non lo so" significa funzioni
   * chiuse a chi le paga.
   */
  it("un errore non resta in cache: al giro dopo si riprova", async () => {
    let tentativo = 0;
    vi.stubGlobal("fetch", async () => {
      tentativo += 1;
      if (tentativo === 1) throw new Error("rete assente");
      return { ok: true, json: async () => ({ effectivePlanCode: "pro" }) };
    });

    vi.resetModules();
    const modulo = await import("@/lib/use-piano-in-vigore");
    modulo.dimenticaIlPianoInVigore();

    expect(await modulo.pianoPerProva("token-1")).toBeNull();
    expect(await modulo.pianoPerProva("token-1")).toBe("pro");
    expect(tentativo).toBe(2);
  });
});

describe("le schermate continuano a leggerlo dallo stesso aggancio", () => {
  it("nessuna schermata chiama l'endpoint del piano per conto suo", () => {
    const sorgenti = [
      "src/components/layout/dealer-sidebar.tsx",
      "src/components/vehicles/vehicle-detail-page.tsx",
      "src/components/vehicles/vehicle-editor-page.tsx",
      "src/app/statistiche/page.tsx",
    ];

    for (const percorso of sorgenti) {
      const sorgente = readFileSync(resolve(process.cwd(), percorso), "utf8");
      expect(sorgente, `${percorso} non usa l'aggancio comune`).toContain("usePianoInVigore");
      expect(sorgente, `${percorso} chiama l'endpoint per conto suo`).not.toContain("/api/demo/plan-request");
    }
  });
});
