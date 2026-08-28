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

/**
 * Il modulo pretendeva nome, cognome, email **e** telefono: sei campi
 * obbligatori. La pagina "Come funziona" prometteva invece "nome, un contatto
 * (email o telefono) e un messaggio", e a valere era la richiesta piu' esosa.
 *
 * E' il punto del sito in cui nasce ogni euro della piattaforma, ed era anche
 * quello con piu' attrito. Adesso la promessa e' vera.
 */
describe("per farsi ricontattare basta un recapito", () => {
  const modulo = readFileSync(
    resolve(process.cwd(), "src/app/(marketplace)/auto/[id]/request-information-form.tsx"),
    "utf8"
  );
  const comeFunziona = readFileSync(
    resolve(process.cwd(), "src/app/(marketplace)/come-funziona/page.tsx"),
    "utf8"
  );

  it("il server accetta la richiesta con la sola email o il solo telefono", () => {
    expect(route).toContain("const almenoUnRecapito = Boolean(customerEmail) || Boolean(customerPhone);");
    expect(route).toContain("!almenoUnRecapito");
    // Le due condizioni vecchie: pretendevano entrambi i recapiti.
    expect(route).not.toMatch(/^\s*!customerEmail \|\|$/m);
    expect(route).not.toMatch(/^\s*!customerPhone \|\|$/m);
  });

  it("il cognome non e' piu' obbligatorio", () => {
    // Chi scrive per chiedere il prezzo di un'auto non sta firmando un
    // contratto: il cognome lo dara' alla concessionaria che lo richiama.
    expect(route).not.toMatch(/^\s*!lastName \|\|$/m);
    expect(modulo).toContain('<Field label="Cognome" value={lastName}');
    expect(modulo).not.toContain('label="Cognome *"');
  });

  it("il modulo chiede l'asterisco solo dove serve davvero", () => {
    expect(modulo).toContain('label="Nome *"');
    expect(modulo).not.toContain('label="Email *"');
    expect(modulo).not.toContain('label="Telefono *"');
  });

  it("quello che promettiamo e quello che chiediamo coincidono", () => {
    // Se un giorno il modulo tornasse a pretendere entrambi i recapiti,
    // questa frase tornerebbe a essere falsa senza che nessuno se ne accorga.
    // La frase e' spezzata su due righe nel sorgente: si controlla il pezzo
    // che porta la promessa.
    expect(comeFunziona).toContain("contatto (email o telefono)");
    expect(route).toContain("almenoUnRecapito");
  });
});
