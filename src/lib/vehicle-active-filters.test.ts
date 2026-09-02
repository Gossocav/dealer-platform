import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { countActiveVehicleFilters, defaultVehicleFilters } from "@/lib/vehicles";

// Nella barra "Ricerca e filtri" del gestionale l'etichetta "Filtri attivi"
// era scritta in duro dentro un riquadro azzurro: restava accesa sempre, anche
// appena aperta la pagina con nessun filtro impostato. Chi la leggeva pensava
// di stare guardando un elenco ristretto, e cercava il filtro da togliere.
// E' lo stesso errore della barra del pannello (PR #146) e delle
// "Visualizzazioni" ferme a zero (PR #172): un dato dichiarato e non vero.
describe("conteggio dei filtri attivi nei veicoli", () => {
  it("a filtri vuoti non ne conta nessuno", () => {
    expect(countActiveVehicleFilters(defaultVehicleFilters)).toBe(0);
  });

  it("conta una tendina impostata", () => {
    expect(countActiveVehicleFilters({ ...defaultVehicleFilters, status: "published" })).toBe(1);
  });

  it("conta la ricerca scritta", () => {
    expect(countActiveVehicleFilters({ ...defaultVehicleFilters, query: "golf" })).toBe(1);
  });

  // Una ricerca fatta di soli spazi non restringe niente: contarla avrebbe
  // acceso l'etichetta su un elenco completo.
  it("non conta una ricerca di soli spazi", () => {
    expect(countActiveVehicleFilters({ ...defaultVehicleFilters, query: "   " })).toBe(0);
  });

  it("li somma quando sono piu' di uno", () => {
    const filtri = { ...defaultVehicleFilters, query: "golf", brand: "Volkswagen", priceBand: "10000-20000" };
    expect(countActiveVehicleFilters(filtri)).toBe(3);
  });

  it("conta al massimo i sette filtri esistenti", () => {
    const tutti = {
      query: "golf",
      brand: "Volkswagen",
      model: "Golf",
      fuel: "Diesel",
      transmission: "Manuale",
      condition: "Usato",
      status: "published",
      priceBand: "10000-20000",
    };
    expect(countActiveVehicleFilters(tutti)).toBe(Object.keys(defaultVehicleFilters).length);
  });
});

// Questo controllo legge il sorgente: dice che l'etichetta e' calcolata, non
// che a video si veda giusto. La resa e' stata guardata a mano in un browser.
describe("etichetta dei filtri nella barra dei veicoli", () => {
  const barra = readFileSync(resolve(process.cwd(), "src/components/vehicles/vehicles-toolbar.tsx"), "utf8");

  it("ricava l'etichetta dal conteggio invece di scriverla in duro", () => {
    expect(barra).toContain("countActiveVehicleFilters(filters)");
    expect(barra).toContain('"Nessun filtro attivo"');
    expect(barra).toContain('"1 filtro attivo"');
  });

  it("spegne il pulsante di azzeramento quando non c'e' niente da azzerare", () => {
    expect(barra).toContain("disabled={filtriAttivi === 0}");
  });
});
