import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * La chiave di servizio non deve poter finire nel pacchetto del browser.
 *
 * **Quale difetto impedisce.** Trovato il 06/09/2026. `public-marketplace.ts`
 * costruiva `storageSigner` leggendo `SUPABASE_SERVICE_ROLE_KEY` -- la chiave
 * che apre tutto il database, senza nessuna regola per riga davanti -- e
 * portava sopra la riga scritta:
 *
 *   "questo modulo lo usano soltanto pagine server: nessun componente del
 *    browser lo importa"
 *
 * Non era piu' vero. Sei componenti `"use client"` del gestionale lo
 * importavano, per prendersi funzioni innocue che stavano nello stesso file:
 * `caricaTutto`, `formattaImporto`, `giorniDiAttesa`.
 *
 * **Nessun segreto e' mai uscito**, e va detto: verificato sui 75 file
 * compilati che il sito serve, la chiave non compariva in nessuno. Next
 * sostituisce con `undefined` ogni variabile d'ambiente che non cominci per
 * `NEXT_PUBLIC_`, quindi in quel ramo di codice non c'era niente da rubare.
 *
 * Il pericolo era un altro, e non si sarebbe visto arrivare. Chi un giorno
 * indaga perche' le fotografie ripiegano sempre sulla firma con la chiave
 * pubblica, trova quella variabile vuota nel browser e la rinomina
 * `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` per "farla funzionare", spedirebbe
 * la chiave che apre tutto dentro ogni pagina pubblica del sito. Senza
 * errori, senza un test rosso, e senza che nessuno se ne accorga.
 *
 * Questo test toglie di mezzo il ragionamento: invece di fidarsi di un
 * commento, percorre gli import a partire da **ogni** componente del browser
 * e guarda dove si arriva.
 */

const RADICE = resolve(process.cwd(), "src");

function tuttiIFile(dir: string): string[] {
  return readdirSync(dir).flatMap((voce) => {
    const percorso = resolve(dir, voce);
    if (statSync(percorso).isDirectory()) return tuttiIFile(percorso);
    return /\.(ts|tsx)$/.test(voce) && !/\.test\.tsx?$/.test(voce) ? [percorso] : [];
  });
}

const sorgenti = tuttiIFile(RADICE);
const testo = new Map(sorgenti.map((f) => [f, readFileSync(f, "utf8")]));

/** I moduli che leggono la chiave di servizio: quelli da tenere lontani. */
const RISERVATI_AL_SERVER = sorgenti.filter((f) => (testo.get(f) ?? "").includes("SUPABASE_SERVICE_ROLE_KEY"));

/** I componenti che girano nel browser. */
const DEL_BROWSER = sorgenti.filter((f) => {
  const primeRighe = (testo.get(f) ?? "").slice(0, 200);
  return /^\s*["']use client["']/m.test(primeRighe);
});

/** Da un file, i file del progetto che importa. */
function importatiDa(file: string): string[] {
  const codice = testo.get(file) ?? "";
  const trovati: string[] = [];

  for (const m of codice.matchAll(/(?:from|import)\s+["'](@\/[^"']+|\.[^"']+)["']/g)) {
    const spec = m[1];
    const base = spec.startsWith("@/") ? resolve(RADICE, spec.slice(2)) : resolve(dirname(file), spec);

    for (const candidato of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
      if (existsSync(candidato) && testo.has(candidato)) {
        trovati.push(candidato);
        break;
      }
    }
  }

  return trovati;
}

/** Il percorso di import da un componente del browser fino a un modulo riservato, se esiste. */
function stradaVersoIlServer(partenza: string): string[] | null {
  const vietati = new Set(RISERVATI_AL_SERVER);
  const visti = new Set<string>([partenza]);
  const coda: Array<{ file: string; strada: string[] }> = [{ file: partenza, strada: [partenza] }];

  while (coda.length > 0) {
    const { file, strada } = coda.shift()!;

    for (const prossimo of importatiDa(file)) {
      if (visti.has(prossimo)) continue;
      visti.add(prossimo);

      const stradaNuova = [...strada, prossimo];
      if (vietati.has(prossimo)) return stradaNuova;

      coda.push({ file: prossimo, strada: stradaNuova });
    }
  }

  return null;
}

const breve = (f: string) => relative(process.cwd(), f);

describe("la chiave di servizio non arriva al browser", () => {
  it("i due elenchi non sono vuoti, altrimenti la prova non prova niente", () => {
    // Se un giorno cambiasse il modo di marcare i componenti del browser, o
    // il nome della variabile, questa riga fallisce invece di lasciar passare
    // tutto in silenzio.
    expect(RISERVATI_AL_SERVER.length, "nessun modulo usa SUPABASE_SERVICE_ROLE_KEY: nome cambiato?").toBeGreaterThan(0);
    expect(DEL_BROWSER.length, 'nessun componente "use client" trovato: convenzione cambiata?').toBeGreaterThan(20);
  });

  it("nessun componente del browser ci arriva, nemmeno passando per altri file", () => {
    const colpevoli: string[] = [];

    for (const componente of DEL_BROWSER) {
      const strada = stradaVersoIlServer(componente);
      if (strada) colpevoli.push(strada.map(breve).join("\n         -> "));
    }

    expect(
      colpevoli,
      colpevoli.length === 0
        ? ""
        : "Un componente del browser arriva a un modulo che legge la chiave di servizio:\n\n  " +
          colpevoli.join("\n\n  ") +
          "\n\nOggi non esce niente (Next sostituisce la variabile con undefined), ma basta " +
          "che qualcuno la rinomini NEXT_PUBLIC_* per spedire a tutti la chiave che apre il database. " +
          "Spostare la parte server in un file suo, come marketplace-foto-firmate.ts."
    ).toEqual([]);
  });
});
