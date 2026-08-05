import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const statistiche = read("src/app/statistiche/page.tsx");
const config = read("supabase/config.toml");

// Il database restituisce al massimo mille righe per richiesta. La pagina
// scaricava tutto e ne misurava la lunghezza: superata quella soglia i numeri
// smettevano di crescere, senza errori e senza avvisi.
describe("i totali non si fermano a mille", () => {
  it("il tetto del database e' quello che credevamo", () => {
    // Se un giorno cambia, questo test lo fa notare invece di lasciare che i
    // numeri diventino silenziosamente sbagliati in modo diverso.
    expect(config).toContain("max_rows = 1000");
  });

  it("lead, clienti e appuntamenti si contano nel database", () => {
    for (const tabella of ["leads", "customers", "appointments"]) {
      const conteggio = new RegExp(
        `from\\("${tabella}"\\)\\s*\\.select\\("id", \\{ count: "exact", head: true \\}\\)`,
      );
      expect(statistiche, `${tabella} non viene contato nel database`).toMatch(conteggio);
    }
  });

  it("i totali mostrati vengono dal conteggio, non dalla lunghezza dell'elenco", () => {
    expect(statistiche).toContain("const totalLeads = totals.leads");
    expect(statistiche).toContain("const totalCustomers = totals.customers");
    expect(statistiche).toContain("const totalAppointments = totals.appointments");
    expect(statistiche).not.toContain("const totalLeads = leads.length");
  });

  // I veicoli restano scaricati per intero, ed e' corretto: il piano piu' alto
  // ne consente 300, e servono comunque per il prezzo medio.
  it("i veicoli si contano ancora sull'elenco, che il tetto non tocca", () => {
    expect(statistiche).toContain("const totalVehicles = vehicles.length");
  });
});

// Ordinare a mano un elenco gia' troncato dava "gli ultimi cinque fra i primi
// mille", che non sono gli ultimi cinque.
describe("gli ultimi cinque li sceglie il database", () => {
  it("lead e clienti arrivano gia' ordinati e limitati", () => {
    const ordinati = statistiche.match(/\.order\("created_at", \{ ascending: false \}\)\s*\.limit\(5\)/g) ?? [];
    expect(ordinati.length).toBeGreaterThanOrEqual(2);
  });

  it("gli appuntamenti in arrivo sono filtrati e ordinati dal database", () => {
    expect(statistiche).toContain('.gte("start_at", adesso)');
    expect(statistiche).toContain('.order("start_at", { ascending: true })');
  });

  // .sort() riordina l'elenco sul posto: modificava lo stato di React invece
  // di ricavarne una copia.
  it("nessun ordinamento modifica piu' lo stato sul posto", () => {
    expect(statistiche).not.toMatch(/\b(vehicles|leads|customers|appointments)\.sort\(/);
  });
});

describe("niente comandi che non fanno niente", () => {
  it("il bottone degli appuntamenti porta dove si creano", () => {
    expect(statistiche).toContain('href="/agenda"');
    expect(statistiche).not.toMatch(/<button[^>]*>\s*Nuovo appuntamento/);
  });
});
