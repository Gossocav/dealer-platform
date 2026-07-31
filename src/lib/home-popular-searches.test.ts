import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const home = readFileSync(resolve(process.cwd(), "src/app/(marketplace)/page.tsx"), "utf8");
// Il ritaglio finisce sul markup: nel file c'e' un "return (" prima,
// nel ramo che gestisce l'errore di caricamento.
const block = home.slice(home.indexOf("const brandCounts"), home.indexOf('<main className="bg-slate-950">'));

// "Ricerche popolari" proponeva un'alimentazione, una fascia di prezzo fissa e
// un tipo di cambio: tre cose scelte a tavolino, nessuna delle quali dice cosa
// c'e' davvero in catalogo.
describe("ricerche popolari in home", () => {
  it("propone le marche", () => {
    expect(block).toMatch(/href: `\/ricerca\?brand=\$\{encodeURIComponent\(brand\)\}`/);
  });

  it("non propone piu' alimentazione, fascia di prezzo e cambio", () => {
    expect(home).not.toContain("Sotto 15.000");
    expect(block).not.toContain("fuel=");
    expect(block).not.toContain("transmission=");
  });

  it("ordina per quante auto ha davvero ogni marca", () => {
    // E' l'unico elenco della pagina in cui "popolare" puo' significare
    // qualcosa di misurato invece che deciso a tavolino.
    expect(block).toContain("brandCounts");
    expect(block).toMatch(/sort\(\(a, b\) => b\[1\] - a\[1\]/);
  });

  it("conta su tutto il pubblicato, non sugli ultimi 24", () => {
    // I 24 veicoli caricati per le "ultime arrivate" darebbero la classifica
    // delle marche appena inserite, non delle piu' presenti.
    expect(block).toContain("publishedRows");
    const select = home.match(/\.select\("dealer_id[^"]*"\)/)?.[0] ?? "";
    expect(select).toContain("brand");
  });

  it("si ferma prima di diventare un muro di etichette", () => {
    expect(block).toMatch(/\.slice\(0, 8\)/);
  });
});
