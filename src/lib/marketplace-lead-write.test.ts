import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(process.cwd(), "src/app/api/marketplace/lead/route.ts"), "utf8");

// Dal 22/08/2026 la tabella dei lead e' protetta per riga: nome, email e
// telefono di un cliente non sono leggibili da chi non e' la concessionaria
// proprietaria. L'endpoint scriveva con la chiave pubblica e si faceva
// restituire la riga appena inserita: la scrittura passava, la rilettura no, e
// il modulo contatti rispondeva errore.
describe("la richiesta informazioni dal marketplace", () => {
  it("scrive il lead con la chiave di servizio", () => {
    expect(route).toContain('supabaseAdmin.from("leads").insert(');
    expect(route).not.toMatch(/\bsupabase\.from\("leads"\)\.insert\(/);
  });

  // Il veicolo si legge invece con la chiave pubblica, ed e' giusto cosi': una
  // richiesta puo' nascere solo da un annuncio visibile al pubblico.
  it("legge il veicolo con la chiave pubblica", () => {
    expect(route).toMatch(/const \{ data: vehicleData[\s\S]{0,120}await supabase\s*\n?\s*\.from\("vehicles"\)/);
  });

  it("registra la provenienza, che e' cio' che la regola del database controlla", () => {
    expect(route).toContain('source: "marketplace"');
  });
});
