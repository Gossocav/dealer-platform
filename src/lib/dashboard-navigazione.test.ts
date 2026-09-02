import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const topbar = read("src/components/layout/dealer-topbar.tsx");
const elenco = read("src/components/vehicles/vehicles-management-page.tsx");
const scheda = read("src/components/vehicles/vehicle-detail-page.tsx");

// Entrando in un veicolo non si tornava indietro: l'unico modo era la freccia
// del browser, e anche quella riportava alla prima pagina dell'elenco senza
// filtri -- perche' la pagina si ricostruiva da zero, e filtri e numero di
// pagina vivevano solo in memoria.
describe("tornare indietro nel gestionale", () => {
  it("il pulsante Indietro c'e' in ogni sezione", () => {
    expect(topbar).toContain('aria-label="Torna alla pagina precedente"');
    expect(topbar).toContain("router.back()");
  });

  it("sulla dashboard non compare: e' il punto di partenza", () => {
    expect(topbar).toContain('pathname !== "/dashboard"');
  });

  // Aprendo un link ricevuto, una pagina precedente non esiste: si sale alla
  // sezione che contiene quella aperta, invece di non fare niente.
  it("senza cronologia sale alla sezione che contiene la pagina", () => {
    expect(topbar).toContain("window.history.length > 1");
    expect(topbar).toContain("sezioneContenitore(pathname)");
  });

  it('"Torna alla lista" torna dove si era, non alla prima pagina', () => {
    expect(scheda).toContain("router.back()");
    expect(scheda).not.toContain('href="/veicoli"\n');
  });
});

// Nell'indirizzo, filtri e pagina servono anche a un'altra cosa: un elenco
// filtrato si puo' mandare a qualcuno o tenere fra i preferiti.
describe("l'elenco veicoli ricorda dove si era", () => {
  it("legge lo stato dall'indirizzo all'apertura", () => {
    expect(elenco).toContain("statoDaIndirizzo");
    expect(elenco).toContain("useSearchParams");
  });

  it("scrive nell'indirizzo filtri, pagina, ordine e vista", () => {
    for (const chiave of ["cerca", "marca", "modello", "alimentazione", "cambio", "condizione", "stato", "prezzo", "pagina", "vista", "ordine"]) {
      expect(elenco, `manca "${chiave}"`).toContain(`"${chiave}"`);
    }
  });

  // "push" riempirebbe la cronologia di passaggi intermedi, e la freccia
  // indietro diventerebbe inutilizzabile.
  it("aggiorna l'indirizzo senza riempire la cronologia", () => {
    expect(elenco).toContain("router.replace(");
    expect(elenco).toContain("{ scroll: false }");
  });

  it("i valori predefiniti non finiscono nell'indirizzo", () => {
    // Un indirizzo pulito quando non si e' filtrato niente: "/veicoli", non
    // "/veicoli?marca=all&modello=all&...".
    expect(elenco).toContain("if (valore && valore !== predefinito)");
    expect(elenco).toContain("if (page > 1)");
  });
});
