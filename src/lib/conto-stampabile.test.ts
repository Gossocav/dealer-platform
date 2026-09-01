import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VOCI_DI_COSTO } from "@/lib/conto-economico";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

const foglioVeicolo = leggi("src/components/vehicles/vehicle-economics-sheet-page.tsx");
const foglioAnno = leggi("src/components/dashboard/sales-report-print-page.tsx");
const schedaVeicolo = leggi("src/components/vehicles/vehicle-detail-page.tsx");
const paginaVendite = leggi("src/components/dashboard/sales-report-page.tsx");
const letturaCondivisa = leggi("src/components/dashboard/vendite-della-concessionaria.tsx");
const stili = leggi("src/app/globals.css");

describe("i due fogli sono stampabili davvero", () => {
  it("usano l'A4 gia' definito per la scheda veicolo, non un formato loro", () => {
    for (const [nome, foglio] of [
      ["conto del veicolo", foglioVeicolo],
      ["conto dell'anno", foglioAnno],
    ] as const) {
      expect(foglio, nome).toContain('className="vehicle-sheet');
      expect(foglio, nome).toContain("w-[210mm]");
      expect(foglio, nome).toContain("window.print()");
    }

    expect(stili).toMatch(/\.vehicle-sheet\s*\{[^}]*width:\s*210mm;/);
  });

  // I comandi a schermo -- il pulsante Stampa, il link per tornare indietro --
  // finirebbero sulla carta senza questa classe.
  it("i comandi restano fuori dalla stampa", () => {
    expect(foglioVeicolo).toContain("no-print");
    expect(foglioAnno).toContain("no-print");
    expect(stili).toMatch(/\.no-print\s*\{\s*display:\s*none\s*!important;/);
  });
});

// Il difetto che questo impedisce: la scheda da parabrezza e il conto
// economico sono due fogli diversi apposta. Il prezzo di acquisto stampato
// sul vetro di un'auto in vendita e' il peggior errore possibile su questa
// piattaforma, e sarebbe bastato aggiungere il conto alla scheda esistente
// "per comodita'".
describe("il conto economico non finisce sulla scheda da parabrezza", () => {
  const schedaParabrezza = leggi("src/components/vehicles/vehicle-sheet-page.tsx");

  it("la scheda pubblica non legge il conto economico", () => {
    expect(schedaParabrezza).not.toContain("vehicle_economics");
    expect(schedaParabrezza).not.toContain("purchase_price");
  });

  it("il foglio del conto lo dice per iscritto a chi lo stampa", () => {
    expect(foglioVeicolo).toContain("Documento interno");
  });
});

/**
 * Il difetto che questo impedisce: un foglio che dice "Peugeot 2008 Allure
 * PureTech 100 S&S" e basta. Al 31/08/2026 in produzione ce n'erano cinque
 * identiche in tutto: in un fascicolo, a mesi di distanza, quel foglio non
 * dice **quale** automobile, e il conto non e' piu' attribuibile.
 */
describe("il conto dice di quale automobile parla", () => {
  it("targa e telaio hanno una sezione propria, non una riga sotto al titolo", () => {
    expect(foglioVeicolo).toContain("Identificazione del veicolo");
    expect(foglioVeicolo).toContain('etichetta="Targa"');
    expect(foglioVeicolo).toContain('etichetta="Numero di telaio"');
  });

  it("accanto ci sono immatricolazione e chilometri, che distinguono due gemelle", () => {
    expect(foglioVeicolo).toContain("formatRegistrationLabel");
    expect(foglioVeicolo).toContain("veicolo.mileage");
  });

  // Tacerlo renderebbe il foglio inutile senza che chi lo stampa se ne
  // accorga: meglio che sia il foglio stesso a dirlo.
  it("senza ne' targa ne' telaio il foglio lo dichiara", () => {
    expect(foglioVeicolo).toContain("il foglio non dice quale automobile sia");
  });

  it("l'elenco dell'anno porta lo stesso identificativo su ogni riga", () => {
    expect(foglioAnno).toContain("Targa o telaio");
    expect(foglioAnno).toContain("vendita.targa");
  });
});

describe("il conto della singola vettura riporta tutto quello che il modulo scrive", () => {
  // Se domani nasce una voce di costo nuova, il foglio deve stamparla: un
  // conto che ne dimentica una dice un totale che non torna con le sue righe.
  it("stampa tutte le voci di costo, prese dall'elenco unico", () => {
    expect(foglioVeicolo).toContain("VOCI_DI_COSTO.map");
    expect(VOCI_DI_COSTO.length).toBeGreaterThan(0);
  });

  it("stampa acquisto, vendita e le due somme", () => {
    for (const campo of ["purchase_price", "purchase_date", "supplier", "sale_price", "sale_date", "notes"]) {
      expect(foglioVeicolo, `manca ${campo}`).toContain(campo);
    }
    expect(foglioVeicolo).toContain("costoTotale");
    expect(foglioVeicolo).toContain("margine");
    expect(foglioVeicolo).toContain("marginePercentuale");
  });

  // Le somme si rifanno con le formule condivise invece di leggere le colonne
  // calcolate: un test gia' esistente lega quelle formule a quelle del
  // database, quindi cosi' schermo e carta non possono discordare.
  it("usa le formule condivise, non un calcolo suo", () => {
    expect(foglioVeicolo).toContain('from "@/lib/conto-economico"');
    expect(foglioVeicolo).not.toMatch(/sale_price\s*-\s*\(/);
  });

  it("dichiara la concessionaria in ogni interrogazione", () => {
    const interrogazioni = foglioVeicolo.match(/\.from\("(vehicles|vehicle_economics)"\)/g) ?? [];
    expect(interrogazioni.length).toBeGreaterThan(0);
    expect(foglioVeicolo.match(/\.eq\("dealer_id", dealerId\)/g)?.length ?? 0).toBeGreaterThanOrEqual(
      interrogazioni.length
    );
  });
});

// Il difetto che questo impedisce: due letture copiate divergono alla prima
// modifica, e il foglio portato al commercialista direbbe una cifra diversa
// da quella che il concessionario vede a schermo.
describe("schermo e carta leggono le stesse vendite", () => {
  it("la pagina Vendite e il foglio usano lo stesso aggancio", () => {
    expect(paginaVendite).toContain("useVenditeDellaConcessionaria");
    expect(foglioAnno).toContain("useVenditeDellaConcessionaria");
  });

  it("nessuna delle due rilegge le vendite per conto suo", () => {
    expect(paginaVendite).not.toContain('.from("vehicles")');
    expect(foglioAnno).not.toContain('.from("vehicles")');
  });

  // La lettura condivisa sta in un .tsx e non in un .ts di proposito: il
  // controllo sull'isolamento fra concessionarie ripercorre solo i .tsx, e
  // spostandola sarebbe uscita da quel controllo senza che si notasse.
  it("la lettura condivisa resta dove il controllo sull'isolamento la vede", () => {
    expect(letturaCondivisa).toContain('.eq("dealer_id", dealerId)');
    const cartelle = leggi("src/lib/tenant-scoped-queries.test.ts");
    expect(cartelle).toContain("src/components/dashboard");
  });

  it("il foglio dell'anno usa gli stessi conti della pagina", () => {
    expect(foglioAnno).toContain("riepilogoAnnuale");
  });
});

describe("si arriva ai due fogli da dove servono", () => {
  it("dalla scheda del veicolo si stampa il suo conto", () => {
    expect(schedaVeicolo).toContain("/conto`");
    expect(schedaVeicolo).toContain("Stampa conto");
  });

  it("dalla pagina Vendite si stampa il conto dell'anno che si sta guardando", () => {
    expect(paginaVendite).toContain("/vendite/stampa?anno=${anno}");
  });
});

// Un totale che tace su quello che ha lasciato fuori e' un totale di cui non
// ci si puo' fidare: su questa piattaforma e' gia' successo due volte con
// numeri inventati mostrati accanto a numeri veri.
describe("il foglio dice cosa non ha contato", () => {
  it("segnala le vendite senza conto completo", () => {
    expect(foglioAnno).toContain("senzaConto");
    expect(foglioAnno).toContain("restano fuori dai totali");
  });

  it("una vettura senza conto salvato non stampa zeri finti", () => {
    expect(foglioVeicolo).toContain("non e&apos; stato ancora compilato nessun conto");
  });
});
