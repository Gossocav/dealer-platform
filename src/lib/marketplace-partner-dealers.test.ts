import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { raggruppaConcessionariePartner } from "@/lib/marketplace-partner-dealers";

function riga(dealerId: string, nome: string) {
  return { dealer_id: dealerId, dealers: [{ id: dealerId, name: nome, legal_name: nome }] };
}

// La sezione "Concessionarie partner" della home nasceva dai 24 veicoli delle
// "ultime arrivate". Il 23 agosto 2026, in produzione: 149 veicoli pubblicati,
// De Lorenzi 98 e AUTOGEPY 51, ma i 24 piu' recenti erano tutti di AUTOGEPY.
// Risultato: De Lorenzi spariva dalla rete, la scheda di AUTOGEPY diceva "24
// veicoli disponibili" invece di 51, e il numero "Concessionarie partner"
// poco sopra -- che gia' leggeva l'elenco intero -- diceva 2.
describe("concessionarie partner in home", () => {
  it("mostra tutte le concessionarie che hanno pubblicato, non solo le ultime", () => {
    const righe = [
      ...Array.from({ length: 51 }, () => riga("autogepy", "AUTOGEPY SPA")),
      ...Array.from({ length: 98 }, () => riga("de-lorenzi", "De Lorenzi Srl")),
    ];

    const partner = raggruppaConcessionariePartner(righe);

    expect(partner).toHaveLength(2);
    expect(partner.map((p) => p.dealerId)).toEqual(["de-lorenzi", "autogepy"]);
  });

  it("conta i veicoli veri di ciascuna, non quelli della finestra letta", () => {
    const righe = [
      ...Array.from({ length: 51 }, () => riga("autogepy", "AUTOGEPY SPA")),
      ...Array.from({ length: 98 }, () => riga("de-lorenzi", "De Lorenzi Srl")),
    ];

    const conteggi = Object.fromEntries(raggruppaConcessionariePartner(righe).map((p) => [p.dealerId, p.vehicleCount]));

    expect(conteggi).toEqual({ "de-lorenzi": 98, autogepy: 51 });
  });

  // Le prime quattro finiscono nella sezione: se l'ordine fosse quello di
  // arrivo, una concessionaria con tre auto scavalcherebbe una con cento.
  it("mette per prime le piu' fornite", () => {
    const righe = [
      riga("piccola", "Piccola Auto"),
      ...Array.from({ length: 12 }, () => riga("media", "Media Auto")),
      ...Array.from({ length: 40 }, () => riga("grande", "Grande Auto")),
    ];

    expect(raggruppaConcessionariePartner(righe).map((p) => p.dealerId)).toEqual(["grande", "media", "piccola"]);
  });

  it("non inventa niente su un elenco vuoto", () => {
    expect(raggruppaConcessionariePartner([])).toEqual([]);
  });

  // Supabase consegna la concessionaria come oggetto o come elenco di uno,
  // secondo come e' scritta la select: entrambe le forme devono contare uguale.
  it("regge sia la concessionaria in elenco sia quella singola", () => {
    const righe = [
      { dealer_id: "x", dealers: [{ id: "x", name: "Auto X", legal_name: "Auto X Srl" }] },
      { dealer_id: "x", dealers: { id: "x", name: "Auto X", legal_name: "Auto X Srl" } },
    ];

    const partner = raggruppaConcessionariePartner(righe);

    expect(partner).toHaveLength(1);
    expect(partner[0].vehicleCount).toBe(2);
  });
});

// Questo controllo legge il sorgente: dice che la home passa l'elenco intero,
// non che a video si vedano tutte. La resa e' stata guardata a mano, compilando
// con le variabili di produzione e leggendo la home sui dati veri.
describe("la home nutre la sezione con l'elenco intero", () => {
  const home = readFileSync(resolve(process.cwd(), "src/app/(marketplace)/page.tsx"), "utf8");

  it("raggruppa publishedRows e non i 24 veicoli delle ultime arrivate", () => {
    expect(home).toContain("raggruppaConcessionariePartner(publishedRows ?? [])");
    expect(home).not.toContain("groupDealers(vehicles)");
  });
});
