import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";

/** Le tabelle che appartengono a una concessionaria e non al mondo. */
const TABELLE_DI_CONCESSIONARIA = [
  "vehicles",
  "vehicle_images",
  "leads",
  "customers",
  "appointments",
  "notifications",
  "email_messages",
  "email_threads",
  "lead_activities",
  // Il conto economico di un veicolo: quanto e' costato e quanto ha reso.
  // Sta in una tabella a parte proprio perche' non deve mai uscire, e vale
  // la stessa regola di tutte le altre.
  "vehicle_economics",
];

const CARTELLE = [
  "src/app/dashboard",
  "src/app/veicoli",
  "src/app/lead",
  "src/app/clienti",
  "src/app/agenda",
  "src/app/statistiche",
  "src/app/vendite",
  "src/app/email",
  "src/app/impostazioni",
  "src/app/account",
  "src/components/vehicles",
  // Il conto del mese legge i margini di una concessionaria: vale la stessa
  // regola di tutto il resto del gestionale.
  "src/components/dashboard",
];

function tuttiIFile(cartella: string): string[] {
  const percorso = resolve(process.cwd(), cartella);
  const voci: string[] = [];

  for (const nome of readdirSync(percorso)) {
    const completo = `${percorso}/${nome}`;
    if (statSync(completo).isDirectory()) {
      voci.push(...tuttiIFile(`${cartella}/${nome}`));
    } else if (nome.endsWith(".tsx")) {
      voci.push(`${cartella}/${nome}`);
    }
  }

  return voci;
}

type Interrogazione = { file: string; riga: number; tabella: string; catena: string };

function interrogazioniSenzaConcessionaria(): Interrogazione[] {
  const trovate: Interrogazione[] = [];

  for (const cartella of CARTELLE) {
    for (const file of tuttiIFile(cartella)) {
      const testo = readFileSync(resolve(process.cwd(), file), "utf8");

      for (const m of testo.matchAll(/\.from\("([a-z_]+)"\)/g)) {
        if (!TABELLE_DI_CONCESSIONARIA.includes(m[1])) continue;

        const coda = testo.slice(m.index! + m[0].length, m.index! + m[0].length + 900);
        const fine = coda.indexOf(";");
        const catena = coda.slice(0, fine > 0 ? fine : 900);

        // Un inserimento non filtra: dichiara la concessionaria dentro il
        // contenuto che scrive, e quello puo' essere costruito altrove.
        const inserimento = /^\s*\.insert\(/.test(catena);
        if (inserimento) continue;

        if (!catena.includes("dealer_id") && !catena.includes("dealerId")) {
          trovate.push({ file, riga: testo.slice(0, m.index!).split("\n").length, tabella: m[1], catena: catena.replace(/\s+/g, " ").slice(0, 80) });
        }
      }
    }
  }

  return trovate;
}

/**
 * Il 22/08/2026, alla prima prova con due concessionarie, la seconda vedeva i
 * dati della prima. La causa vera era il database -- la protezione per riga
 * non era accesa -- ma il danno passava di qui: 33 interrogazioni su 69
 * chiedevano "i veicoli" invece dei "miei veicoli", e con un cliente solo non
 * si vedeva.
 *
 * Adesso la protezione c'e' e regge da sola. Questo controllo serve al caso
 * in cui un domani venisse allentata: la seconda serratura deve restare.
 */
describe("ogni interrogazione dice di quale concessionaria sono i dati", () => {
  it("nessuna pagina del gestionale chiede dati senza dire di chi sono", () => {
    const senzaFiltro = interrogazioniSenzaConcessionaria();
    const elenco = senzaFiltro.map((x) => `${x.file}:${x.riga} [${x.tabella}] ${x.catena}`).join("\n");

    expect(senzaFiltro, `interrogazioni senza dealer_id:\n${elenco}`).toHaveLength(0);
  });

  it("il controllo guarda davvero qualcosa", () => {
    // Se un domani i percorsi cambiassero, il controllo passerebbe a vuoto
    // senza che nessuno se ne accorga.
    const file = CARTELLE.flatMap((c) => tuttiIFile(c));
    expect(file.length).toBeGreaterThan(10);
  });
});
