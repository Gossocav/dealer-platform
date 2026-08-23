import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const tabella = read("src/components/vehicles/vehicles-table.tsx");

// Da quando l'intestazione "Anno" e' diventata "Immatricolazione" (PR #104) la
// colonna della data pretende 138px per una parola sola, e a larghezza di
// laptop se li prendeva dalla colonna "Veicolo": marca, modello e allestimento
// andavano a capo tre volte e finivano appiccicati alla data, che sembrava
// scritta sopra al modello. Misurato in un browser a 1280px: il testo del
// modello arrivava a 2px dal bordo della cella, con 12px fino alla data.
//
// Questi controlli leggono il sorgente: dicono che i vincoli di larghezza sono
// scritti, non che il browser li applichi. La prova vera e' stata fatta a mano
// con uno screenshot a 1200, 1280, 1366 e 1440px.
describe("larghezza delle colonne nella tabella dei veicoli", () => {
  it("riserva una larghezza minima alla colonna del veicolo", () => {
    expect(tabella).toContain('className="flex min-w-[240px] items-center gap-3"');
  });

  it("manda a capo le parole lunghe invece di farle uscire dalla cella", () => {
    expect(tabella).toContain('<p className="break-words font-semibold text-slate-900">');
    expect(tabella).toContain('<p className="break-words text-xs text-slate-500">{vehicle.version}</p>');
  });

  it("tiene su una riga sola i valori brevi: data, prezzo, chilometri", () => {
    expect(tabella).toContain('<td className="whitespace-nowrap px-3 py-3">{vehicle.registration}</td>');
    expect(tabella).toContain('<td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-900">{vehicle.priceLabel}</td>');
    expect(tabella).toContain('<td className="whitespace-nowrap px-3 py-3">{vehicle.mileageLabel}</td>');
  });
});

// I cinque pulsanti (Visualizza, Modifica, Duplica, Pubblica, Elimina) stavano
// in fila nella colonna "Azioni", che a larghezza di laptop non li conteneva:
// andavano a capo uno per riga e ogni riga diventava alta oltre 150px, con
// quattro veicoli per schermata. Ora sono in una tendina e la riga e' alta 80px
// (misurato in un browser a 1280 e 1440px: nove veicoli per schermata).
describe("azioni di riga nella tabella dei veicoli", () => {
  it("raccoglie le cinque azioni in una tendina sola", () => {
    expect(tabella).toContain("function RowActionsMenu(");
    expect(tabella).toContain('aria-haspopup="menu"');
    expect(tabella).toContain('role="menu"');

    for (const voce of ["Visualizza", "Modifica", "Duplica", "Pubblica", "Elimina"]) {
      expect(tabella).toContain(voce);
    }
  });

  // La tabella scorre di lato dentro un contenitore con overflow, che ritaglia
  // anche in verticale: una tendina posizionata in assoluto dentro la cella
  // verrebbe tagliata a meta'. Con position: fixed sfugge al ritaglio, ma non
  // segue lo scorrimento, quindi va chiusa quando la pagina scorre.
  it("apre la tendina fuori dal contenitore che scorre, e la chiude allo scorrimento", () => {
    expect(tabella).toContain('className="fixed z-50 w-52');
    expect(tabella).toContain('window.addEventListener("scroll", chiudi, true)');
    expect(tabella).toContain('window.addEventListener("resize", chiudi)');
  });

  it("si chiude con Escape e con un clic fuori", () => {
    expect(tabella).toContain('evento.key === "Escape"');
    expect(tabella).toContain('document.addEventListener("mousedown", suClic)');
  });
});
