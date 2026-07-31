import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/app/email/page.tsx"), "utf8");

// Senza lead ne' clienti la tendina "Destinatario" conteneva una voce sola,
// "Inserisci email manualmente": un menu che chiede di scegliere fra una
// possibilita', e un passaggio in piu' prima di poter scrivere l'indirizzo.
describe("destinatario di un nuovo messaggio", () => {
  it("mostra la tendina solo quando c'e' qualcosa da scegliere", () => {
    expect(page).toContain("const hasRecipientOptions = leadOptions.length > 0 || customerOptions.length > 0;");
    expect(page).toMatch(/\{hasRecipientOptions \? \(\s*<select/);
  });

  it("lascia sempre il campo per scrivere l'indirizzo a mano", () => {
    // E' l'unico modo di scrivere a qualcuno che non e' ancora ne' lead ne'
    // cliente, e senza tendina diventa l'unico campo del destinatario.
    expect(page).toMatch(/\{!recipientPickerId \? \(\s*<input\s+type="email"/);
  });

  it("non perde la scelta fra lead e clienti quando ce ne sono", () => {
    // La tendina torna appena arriva il primo lead: non e' stata rimossa, solo
    // nascosta finche' non serve.
    expect(page).toContain('<optgroup label="Lead">');
    expect(page).toContain('<optgroup label="Clienti">');
  });
});
