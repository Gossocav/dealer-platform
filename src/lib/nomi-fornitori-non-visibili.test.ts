import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Il nome del fornitore tecnico non si mostra a chi usa la piattaforma.
 *
 * Nella pagina di modifica veicolo si leggeva "gestisci immagini da Supabase
 * Storage", e altrove "collegati a Supabase", "basata su Supabase Auth",
 * "Sicurezza Supabase". Al concessionario quel nome non dice niente: e' il
 * fornitore di chi gli vende il servizio, non qualcosa che lui usa. E dove
 * compariva prendeva il posto della frase che avrebbe dovuto spiegargli cosa
 * puo' fare in quella pagina.
 *
 * L'informativa privacy e' l'eccezione, e non e' negoziabile: li' i fornitori
 * che trattano i dati vanno nominati per esteso.
 */

const RADICI = ["src/app", "src/components"];

const CONSENTITI = new Set([
  // Obbligatorio: l'elenco di chi tratta i dati per conto della piattaforma.
  "src/app/(marketplace)/privacy/page.tsx",
]);

function fileTsx(radice: string): string[] {
  const base = resolve(process.cwd(), radice);
  const trovati: string[] = [];

  const visita = (cartella: string) => {
    for (const voce of readdirSync(cartella)) {
      const percorso = join(cartella, voce);
      if (statSync(percorso).isDirectory()) {
        visita(percorso);
      } else if (percorso.endsWith(".tsx")) {
        trovati.push(percorso);
      }
    }
  };

  visita(base);
  return trovati;
}

/** Via i commenti: quello che spiega il codice non lo legge nessun visitatore. */
function senzaCommenti(sorgente: string) {
  return sorgente.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

describe("il nome del fornitore tecnico non si legge sulle pagine", () => {
  it("nessuna pagina lo mostra, tranne l'informativa privacy", () => {
    const colpevoli: string[] = [];

    for (const radice of RADICI) {
      for (const percorso of fileTsx(radice)) {
        const relativo = relative(process.cwd(), percorso).replace(/\\/g, "/");
        if (CONSENTITI.has(relativo)) continue;

        // "Supabase" da solo e' testo scritto per chi guarda; dentro un nome
        // come createSupabaseBrowserClient o publicSupabase e' codice, e resta.
        const testo = senzaCommenti(readFileSync(percorso, "utf8"));
        if (/(^|[^A-Za-z])Supabase([^A-Za-z]|$)/.test(testo)) {
          colpevoli.push(relativo);
        }
      }
    }

    expect(colpevoli, `queste pagine mostrano il nome del fornitore: ${colpevoli.join(", ")}`).toEqual([]);
  });

  it("l'informativa privacy continua a nominarlo, com'e' giusto", () => {
    const privacy = readFileSync(resolve(process.cwd(), "src/app/(marketplace)/privacy/page.tsx"), "utf8");
    expect(privacy).toContain("Supabase");
  });
});
