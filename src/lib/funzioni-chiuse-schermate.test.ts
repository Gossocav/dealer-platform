import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

/**
 * Il conto economico si raggiunge da sei punti: il riquadro nella scheda del
 * veicolo, la sua stampa, il conto del mese nelle statistiche, la pagina
 * Vendite, la stampa dell'anno e la giacenza. Piu' il campo del prezzo quando
 * si chiude una vendita.
 *
 * Il difetto che questi test impediscono: chiuderne cinque su sei. Il punto
 * dimenticato non da' nessun errore -- funziona, semplicemente non avrebbe
 * dovuto -- e nessuno lo segnala, perche' chi ci passa e' contento di trovarlo
 * aperto.
 */
const PUNTI_DI_ACCESSO: Array<{ percorso: string; funzione: string }> = [
  { percorso: "src/components/vehicles/vehicle-detail-page.tsx", funzione: "conto-economico" },
  { percorso: "src/components/vehicles/vehicle-economics-sheet-page.tsx", funzione: "conto-economico" },
  { percorso: "src/app/statistiche/page.tsx", funzione: "conto-economico" },
  { percorso: "src/components/vehicles/vehicles-to-close-page.tsx", funzione: "conto-economico" },
  { percorso: "src/components/dashboard/sales-report-page.tsx", funzione: "vendite" },
  { percorso: "src/components/dashboard/sales-report-print-page.tsx", funzione: "vendite" },
  { percorso: "src/components/dashboard/stock-age-page.tsx", funzione: "giacenza" },
];

describe("ogni punto d'accesso controlla il piano", () => {
  for (const { percorso, funzione } of PUNTI_DI_ACCESSO) {
    it(`${percorso} chiede il piano prima di aprire "${funzione}"`, () => {
      const sorgente = leggi(percorso);
      expect(sorgente, `${percorso} non legge il piano in vigore`).toContain("usePianoInVigore");
      expect(sorgente, `${percorso} non controlla la soglia`).toContain(`pianoComprende(planCode, "${funzione}")`);
    });
  }
});

/**
 * Nascondere la voce di menu non basta: un segnalibro, un link ricevuto o
 * l'indirizzo digitato a mano portano dentro lo stesso. E' la stessa scelta
 * gia' fatta per la scheda consegna, dove il controllo sta nella pagina e non
 * solo nel bottone che la apre.
 */
describe("le pagine intere si difendono da sole, non solo dal menu", () => {
  const PAGINE = [
    "src/components/dashboard/sales-report-page.tsx",
    "src/components/dashboard/sales-report-print-page.tsx",
    "src/components/dashboard/stock-age-page.tsx",
    "src/components/vehicles/vehicle-economics-sheet-page.tsx",
  ];

  for (const percorso of PAGINE) {
    it(`${percorso} mostra la spiegazione invece dei dati`, () => {
      expect(leggi(percorso)).toMatch(/FunzioneNonCompresa/);
    });
  }

  it("il menu nasconde le voci che il piano non apre", () => {
    const menu = leggi("src/components/layout/dealer-sidebar.tsx");
    expect(menu).toContain('funzione: "vendite"');
    expect(menu).toContain('funzione: "giacenza"');
    expect(menu).toContain("pianoComprende(planCode, item.funzione)");
  });

  // Mostrare la voce e poi toglierla farebbe accorciare il menu sotto il dito.
  it("finche' il piano non e' noto la voce riservata non compare", () => {
    expect(leggi("src/components/layout/dealer-sidebar.tsx")).toContain("!caricamentoPiano && pianoComprende");
  });
});

/**
 * Chiudere una vendita scrive il prezzo nel conto economico. A chi non ha il
 * conto economico quel campo non si chiede: farglielo compilare vorrebbe dire
 * farlo scrivere in un archivio che non puo' aprire.
 */
describe("chi non ha il conto economico chiude comunque le vendite", () => {
  const daChiudere = leggi("src/components/vehicles/vehicles-to-close-page.tsx");

  it("il campo del prezzo compare solo con il piano che lo comprende", () => {
    expect(daChiudere).toContain("const conConti = pianoComprende(planCode");
    expect(daChiudere).toContain("{conConti ? (");
  });

  it("e senza quel piano non si scrive niente nel conto economico", () => {
    expect(daChiudere).toContain('if (conConti && come === "venduta"');
  });

  // La vettura si chiude lo stesso: la vendita e' un fatto, non un conto.
  it("la chiusura della vettura non dipende dal piano", () => {
    const blocco = daChiudere.slice(daChiudere.indexOf("const chiudi"), daChiudere.indexOf("const conConti"));
    expect(blocco).not.toContain("conConti");
  });
});

/**
 * La spiegazione dice cosa manca e da quale piano: una schermata che scrive
 * solo "non disponibile" lascia il concessionario a indovinare, e una porta
 * chiusa senza spiegazione e' un'occasione di vendita buttata.
 */
describe("a chi trova la porta chiusa si dice cosa c'e' dietro", () => {
  const componente = leggi("src/components/dashboard/funzione-non-compresa.tsx");

  it("nomina il piano e spiega la funzione", () => {
    expect(componente).toContain("spiegazioneFunzioneChiusa(funzione)");
    expect(componente).toContain("nomeDelPiano(pianoMinimoPer(funzione))");
  });

  it("porta ai piani, cosi' chi vuole puo' passarci", () => {
    expect(componente).toContain('href="/abbonamento"');
  });
});
