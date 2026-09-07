import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * La raccolta errori resta **fuori dal browser**, e questo test lo tiene fermo.
 *
 * Il pezzo di Sentry che gira nel browser pesa decine di chilobyte e
 * verrebbe scaricato da chiunque apra un annuncio: restituirebbe indietro
 * parte del lavoro fatto sulle fotografie (4,7 MB -> 0,4 MB per pagina).
 * E finche' resta sul server non si tocca ne' la Content-Security-Policy ne'
 * il banner dei cookie, perche' dal browser non parte niente.
 *
 * E' una decisione che si disfa per sbaglio: basta che un giorno qualcuno
 * importi `segnalaErrore` dentro un componente per rimettere il pacchetto
 * nel pacco che scarica il visitatore, e nessuno se ne accorgerebbe --
 * il sito continuerebbe a funzionare, solo piu' pesante.
 */

const RADICE = resolve(process.cwd(), "src");

function tuttiIFile(cartella: string): string[] {
  const trovati: string[] = [];

  for (const voce of readdirSync(cartella)) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) {
      trovati.push(...tuttiIFile(percorso));
    } else if (/\.tsx?$/.test(voce) && !/\.test\.tsx?$/.test(voce)) {
      trovati.push(percorso);
    }
  }

  return trovati;
}

const NOMI_DELLA_RACCOLTA = ["@sentry/nextjs", "@/lib/segnala-errore", "@/lib/sentry-config"];

describe("la raccolta errori non entra nel browser", () => {
  it("nessun componente che gira nel browser la nomina", () => {
    const colpevoli: string[] = [];

    for (const percorso of tuttiIFile(RADICE)) {
      const sorgente = readFileSync(percorso, "utf8");

      // "use client" vale solo se sta in cima al file: piu' in basso e' testo.
      const giraNelBrowser = /^\s*(["'])use client\1/.test(sorgente);
      if (!giraNelBrowser) continue;

      if (NOMI_DELLA_RACCOLTA.some((nome) => sorgente.includes(nome))) {
        colpevoli.push(percorso.replace(`${process.cwd()}/`, ""));
      }
    }

    expect(colpevoli, `questi file girano nel browser e tirerebbero dentro Sentry: ${colpevoli.join(", ")}`).toEqual([]);
  });
});

describe("si raccolgono gli errori, non il rumore", () => {
  const strumentazione = readFileSync(resolve(process.cwd(), "src/instrumentation.ts"), "utf8");

  /**
   * `warn` e `log` riempirebbero la casella di cose che non sono guasti, e
   * consumerebbero la quota gratuita (5.000 segnalazioni al mese) con
   * messaggi che nessuno deve leggere. Una casella piena e' una casella che
   * non si guarda piu'.
   */
  it("si prende solo il livello error", () => {
    expect(strumentazione).toContain('levels: ["error"]');
    expect(strumentazione).not.toContain('"warn"');
    expect(strumentazione).not.toContain('"log"');
  });

  /** Senza indirizzo non parte niente: in locale e nelle anteprime resta spenta. */
  it("resta spenta senza indirizzo di raccolta", () => {
    expect(strumentazione).toContain("if (!indirizzoDiRaccolta()) return;");
  });

  /** L'ultimo controllo sui dati personali vale su tutto cio' che parte. */
  it("ogni segnalazione passa dalla pulizia prima di partire", () => {
    expect(strumentazione).toContain("beforeSend");
    expect(strumentazione).toContain("primaDiSpedire");
  });
});
