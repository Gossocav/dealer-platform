import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { conditionOptions, countActiveVehicleFilters, defaultVehicleFilters } from "@/lib/vehicles";
import { VEHICLE_CONDITION_LABELS, VEHICLE_CONDITION_VALUES } from "@/lib/vehicle-conditions";
import { canonicalizeVehicleCondition } from "@/lib/vehicle-import";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

const pagina = leggi("src/components/vehicles/vehicles-management-page.tsx");
const barra = leggi("src/components/vehicles/vehicles-toolbar.tsx");

/**
 * Il filtro per condizione nel parco auto del concessionario, chiesto dal
 * titolare il 02/09/2026: nuove, usate, km 0, aziendali.
 */
describe("la tendina offre le quattro condizioni chieste", () => {
  it("le quattro ci sono tutte, piu' la voce che non filtra", () => {
    expect(conditionOptions.map((o) => o.value)).toEqual(["all", "Nuovo", "Usato", "Aziendale", "Km/0"]);
  });

  it("si leggono al plurale, come si legge una tendina di filtro", () => {
    const etichette = conditionOptions.map((o) => o.label);
    expect(etichette).toContain("Nuove");
    expect(etichette).toContain("Usate");
    expect(etichette).toContain("Km 0");
    expect(etichette).toContain("Aziendali");
  });

  /**
   * Il difetto che questo test impedisce: un valore scritto a mano nella
   * tendina, diverso da quello che sta nel database. Il filtro confronta per
   * uguaglianza esatta, quindi non troverebbe **mai** niente -- e il
   * concessionario vedrebbe un parco vuoto invece di un filtro rotto.
   */
  it("i valori sono quelli veri del database, non riscritti", () => {
    for (const valore of VEHICLE_CONDITION_VALUES) {
      expect(conditionOptions.map((o) => o.value)).toContain(valore);
      // E sono gli stessi a cui l'importazione riconduce i sinonimi.
      expect(canonicalizeVehicleCondition(valore)).toBe(valore);
    }
    expect(Object.keys(VEHICLE_CONDITION_LABELS).sort()).toEqual([...VEHICLE_CONDITION_VALUES].sort());
  });

  // Tutte e tre le strade che scrivono una vettura passano dallo stesso
  // elenco: modulo di inserimento, importazione da file, sincronizzazione dal
  // sito. Se una divergesse, le sue vetture sparirebbero dal filtro.
  it("le tre strade che scrivono una vettura usano le stesse parole", () => {
    const modulo = leggi("src/components/vehicles/vehicle-editor-page.tsx");
    for (const valore of VEHICLE_CONDITION_VALUES) {
      expect(modulo, `il modulo non offre "${valore}"`).toContain(`<option value="${valore}">`);
    }

    const sito = leggi("src/lib/dealer-site-import.ts");
    expect(sito).toContain('export type StockCondition = "Usato" | "Km/0" | "Nuovo"');
  });
});

describe("il filtro restringe davvero l'elenco", () => {
  it("l'interrogazione confronta la colonna della condizione", () => {
    expect(pagina).toContain('query.eq("vehicle_condition", filters.condition)');
  });

  it("la tendina sta nella barra dei filtri", () => {
    expect(barra).toContain('label="Condizione"');
    expect(barra).toContain("conditionOptions");
  });

  // Un filtro che non si conta non compare fra i "filtri attivi", e chi
  // guarda un elenco ristretto non capisce perche' e' ristretto.
  it("conta fra i filtri attivi", () => {
    expect(countActiveVehicleFilters({ ...defaultVehicleFilters, condition: "Usato" })).toBe(1);
    expect(countActiveVehicleFilters(defaultVehicleFilters)).toBe(0);
  });

  /**
   * L'elenco filtrato si puo' mandare a qualcuno o tenere fra i preferiti, e
   * tornando indietro da una scheda si ritrova come lo si era lasciato: per
   * questo ogni filtro vive nell'indirizzo.
   */
  it("resta nell'indirizzo, come gli altri filtri", () => {
    expect(pagina).toContain('testo("condizione", defaultVehicleFilters.condition)');
    expect(pagina).toContain('aggiungi("condizione", filters.condition, defaultVehicleFilters.condition)');
  });
});
