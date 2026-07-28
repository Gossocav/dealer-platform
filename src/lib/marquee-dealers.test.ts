import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const marquee = read("src/components/marketplace/marquee-dealers.tsx");
const homePage = read("src/app/(marketplace)/page.tsx");

// La striscia scorrevole diceva "Le concessionarie partner, in un unico posto"
// e faceva scorrere le marche delle auto: Audi, BMW, Fiat. Chi leggeva ne
// deduceva che quelle fossero le concessionarie iscritte.
describe("striscia delle concessionarie partner", () => {
  it("dichiara di mostrare concessionarie", () => {
    expect(marquee).toContain("Le concessionarie partner, in un unico posto");
  });

  it("riceve i nomi delle concessionarie, non le marche", () => {
    expect(homePage).toMatch(/<MarqueeDealers dealers=\{partnerDealerNames\}/);
    expect(homePage).not.toMatch(/<Marquee\w*\s+brands=/);
    expect(marquee).not.toMatch(/\bbrands?\b/);
  });

  it("legge i nomi dalle righe gia' caricate per il conteggio", () => {
    // Una query in piu' in home costa a ogni visitatore: il nome arriva dalla
    // stessa select che conta le concessionarie.
    expect(homePage).toContain('.select("dealer_id, dealers!inner(status, name, legal_name)")');
  });

  it("non ripete la stessa concessionaria una volta per veicolo", () => {
    // Quelle righe sono una per veicolo pubblicato: senza deduplica su
    // dealer_id la striscia mostrerebbe lo stesso nome decine di volte.
    const block = homePage.slice(homePage.indexOf("const partnerDealerNames"), homePage.indexOf("MarqueeDealers dealers"));
    expect(block).toContain("new Map(");
    expect(block).toContain("row.dealer_id");
  });

  it("scarta il nome di ripiego generico", () => {
    // normalizeVehicleDealerName ripiega su "Concessionaria" quando mancano sia
    // ragione sociale sia insegna: una fila di nomi generici e' peggio di niente.
    expect(homePage).toMatch(/filter\(\(name\) => name !== "Concessionaria"\)/);
  });

  it("usa lo stesso helper del resto del marketplace", () => {
    // Un nome diverso qui rispetto alla pagina della concessionaria si
    // leggerebbe come due aziende diverse.
    expect(homePage).toContain("normalizeVehicleDealerName");
  });
});
