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
    // Niente "?? []": caricaTutto consegna sempre un elenco, mai null.
    expect(home).toContain("raggruppaConcessionariePartner(publishedRows)");
    expect(home).not.toContain("groupDealers(vehicles)");
  });
});

// Le stesse righe che danno le concessionarie danno anche le citta' coperte,
// le categorie e le marche piu' presenti. Erano lette con una richiesta sola,
// e il database ne consegna mille per volta senza dirlo: al millesimo veicolo
// pubblicato tutti quei numeri sarebbero calati in silenzio. Con i tetti dei
// piani (50/150/300 annunci) il tetto si tocca con quattro o cinque
// concessionarie, non con venti.
//
// Legge il sorgente: dice che l'elenco e' letto per intero, non che il
// database consegni davvero tutto. La prova vera e' in carica-tutto.test.ts.
describe("la home legge il pubblicato per intero", () => {
  const home = readFileSync(resolve(process.cwd(), "src/app/(marketplace)/page.tsx"), "utf8");

  it("usa caricaTutto invece di una richiesta sola", () => {
    expect(home).toContain("caricaTutto<PublishedRow>");
    expect(home).toContain(".range(da, a)");
  });

  // Senza un ordine stabile due blocchi possono consegnare due volte la stessa
  // riga e saltarne un'altra: i conteggi sballerebbero senza che nulla avvisi.
  it("chiede le righe in un ordine stabile", () => {
    const blocco = home.slice(home.indexOf("caricaTutto<PublishedRow>"), home.indexOf(".range(da, a)"));
    expect(blocco).toContain('.order("created_at", { ascending: false })');
  });

  it("segnala nei log quando l'elenco si ferma al tetto", () => {
    expect(home).toContain("if (elencoTroncato)");
    expect(home).toContain('logMarketplaceTruncatedList("home"');
  });
});
