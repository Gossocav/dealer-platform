import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

const statistiche = leggi("src/app/statistiche/page.tsx");
const riquadro = leggi("src/components/dashboard/metric-card.tsx");
const contoDelMese = leggi("src/components/dashboard/margin-summary.tsx");

/**
 * Il difetto che questi test impediscono, segnalato dal titolare guardando la
 * pagina: "il totale in euro non e' congruo al box, scritta troppo grande
 * fuori dai limiti". Il valore del parco auto era scritto sempre in
 * `text-3xl`; con 250 vetture supera il milione e usciva dal riquadro.
 */
describe("le cifre restano dentro il loro riquadro", () => {
  it("la misura si sceglie sulla lunghezza, non e' fissa", () => {
    expect(riquadro).toContain("dimensioneCifra(value)");
    expect(riquadro).toContain("break-words");
  });

  it("anche il conto del mese usa la stessa regola", () => {
    expect(contoDelMese).toContain("dimensioneCifra(valore)");
  });

  it("nessun importo della pagina e' scritto con una misura fissa a mano", () => {
    // Prima erano otto riquadri con `text-3xl` scritto dentro il markup.
    expect(statistiche).not.toMatch(/text-3xl font-semibold text-slate-900">\{?€/);
    expect(statistiche).not.toContain('€{totalValue.toLocaleString("it-IT")}');
    expect(statistiche).not.toContain('€{averagePrice.toLocaleString("it-IT")}');
  });

  it("gli importi passano dal formattatore comune", () => {
    // **Si controlla che l'importo entri nel formattatore, non come ci
    // entra.** L'asserzione fissava `formattaEuroTondo(totalValue)` parola
    // per parola, ed e' caduta il 19/09/2026 per una modifica che con la
    // formattazione non c'entrava niente: il valore del parco adesso e'
    // `null` quando nessuna auto ha un prezzo, invece di dire "0 €". La
    // regola qui sopra -- "passano dal formattatore comune" -- reggeva
    // benissimo; era l'asserzione a guardare altro.
    for (const importo of ["totalValue", "averagePrice"]) {
      const passa = new RegExp(`formattaEuroTondo\\([^)]*\\b${importo}\\b`);
      expect(statistiche, `${importo} deve passare da formattaEuroTondo`).toMatch(passa);
    }
  });
});

// Il guscio del gestionale mette gia' sfondo, margini e spaziatura. La pagina
// ne aggiungeva un secondo -- `min-h-screen`, uno sfondo grigio e un riquadro
// bianco attorno a tutto -- ed era il motivo per cui sembrava disegnata da
// un'altra mano rispetto a Vendite e Giacenza.
describe("la pagina non si costruisce una cornice sua", () => {
  it("non rimette sfondo e altezza piena dentro il guscio", () => {
    expect(statistiche).not.toContain("min-h-screen bg-slate-50");
    expect(statistiche).not.toContain("max-w-7xl");
  });

  it("usa le stesse sezioni delle altre pagine del gestionale", () => {
    expect(statistiche).toContain("dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white");
  });

  // "Statistiche" compariva tre volte: nella barra in alto, come soprattitolo
  // e come titolo grande, uno sotto l'altro.
  it("il titolo non si ripete tre volte", () => {
    expect(statistiche).not.toMatch(/<h1[^>]*>\s*Statistiche\s*</);
  });
});

describe("quello che si legge e' leggibile", () => {
  // Sulla scheda di un lead compariva `Veicolo: 3f2b1c4e-...`, cioe'
  // l'identificativo interno del veicolo: trentasei caratteri che non dicono
  // niente a nessuno.
  it("il lead dice quale automobile chiede, non un codice", () => {
    expect(statistiche).not.toContain("Veicolo: {lead.vehicle_id");
    expect(statistiche).toContain("vehicles(brand, model, version)");
    expect(statistiche).toContain("resolveVehicleLabel(veicolo as never)");
  });

  it("gli elenchi in fondo portano dove si continua", () => {
    for (const dove of ['dove="/veicoli"', 'dove="/lead"', 'dove="/clienti"', 'dove="/agenda"']) {
      expect(statistiche, `manca ${dove}`).toContain(dove);
    }
  });
});

/**
 * Il grafico di prima metteva sulla stessa scala veicoli pubblicati, bozze,
 * lead e clienti: quattro numeri che non si sommano fra loro, con la barra
 * piu' lunga scelta dal massimo fra tutti. Confrontare quattro lead con
 * quattro automobili non vuol dire niente.
 */
describe("il grafico confronta cose confrontabili", () => {
  it("e' una barra sola divisa fra pubblicati e bozze", () => {
    expect(statistiche).toContain("quotaPubblicati");
    expect(statistiche).toContain("quotaBozze");
  });

  it("non mette piu' i lead sulla stessa scala dei veicoli", () => {
    expect(statistiche).not.toContain("maxGraphValue");
  });

  it("con il parco vuoto non disegna niente invece di dividere per zero", () => {
    expect(statistiche).toContain("totalVehicles > 0 ?");
  });
});
