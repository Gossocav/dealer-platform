import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

/**
 * In fondo alla pagina di ogni piano c'era una sola strada: "Richiedi Demo".
 * Chi non era ancora pronto a provare la piattaforma, e voleva soltanto una
 * risposta prima di decidere, non aveva dove chiederla -- e se ne andava.
 *
 * Le tre pagine sono copie l'una dell'altra: quando si aggiunge qualcosa in
 * fondo, o lo si aggiunge a tutte e tre o il piano di mezzo resta indietro
 * senza che nessuno se ne accorga.
 */
const PIANI = [
  { codice: "base", nome: "Base" },
  { codice: "pro", nome: "Pro" },
  { codice: "elite", nome: "Elite" },
] as const;

describe("da ogni pagina di piano si possono chiedere informazioni", () => {
  it("tutte e tre mostrano il modulo, non solo il pulsante della demo", () => {
    for (const { codice } of PIANI) {
      const sorgente = read(`src/app/(marketplace)/registrazione/${codice}/page.tsx`);
      expect(sorgente, codice).toContain("<DealerInfoRequestForm");
      expect(sorgente, codice).toContain('import DealerInfoRequestForm from "../dealer-info-request-form"');
    }
  });

  it("il bottone porta al modulo che sta nella stessa pagina", () => {
    // Il bottone vive nell'invito condiviso dal 01/09/2026; l'ancora a cui
    // punta deve pero' stare su **ogni** pagina, altrimenti il collegamento
    // non fa niente e sembra un bottone rotto.
    const invito = read("src/components/marketplace/invito-alla-prova.tsx");
    expect(invito).toContain("Richiedi informazioni");
    expect(invito).toContain('href="#richiedi-informazioni"');

    for (const { codice } of PIANI) {
      const sorgente = read(`src/app/(marketplace)/registrazione/${codice}/page.tsx`);
      expect(sorgente, `${codice} non ha l'ancora a cui il bottone punta`).toContain('id="richiedi-informazioni"');
      expect(sorgente, codice).toContain("<InvitoAllaProva");
    }
  });

  it("la richiesta dichiara da quale piano arriva", () => {
    for (const { codice, nome } of PIANI) {
      const sorgente = read(`src/app/(marketplace)/registrazione/${codice}/page.tsx`);
      expect(sorgente, codice).toContain(`planCode="${codice}"`);
      expect(sorgente, codice).toContain(`planName="${nome}"`);
    }
  });

  it("la strada della demo resta: il modulo si aggiunge, non sostituisce", () => {
    // Il pulsante si chiama "Richiedi la prova gratuita" dal 01/09/2026:
    // prima diceva "Richiedi Demo", che e' il nome che diamo noi alla cosa,
    // non quello che il concessionario ci vede dentro.
    const invito = read("src/components/marketplace/invito-alla-prova.tsx");
    expect(invito).toContain("Richiedi la prova gratuita");
    expect(invito).toContain("`/demo?piano=${planCode}`");

    for (const { codice } of PIANI) {
      const sorgente = read(`src/app/(marketplace)/registrazione/${codice}/page.tsx`);
      expect(sorgente, codice).toContain(`<InvitoAllaProva planCode="${codice}"`);
    }
  });
});

describe("il piano viaggia fino alla notifica", () => {
  const modulo = read("src/app/(marketplace)/registrazione/dealer-info-request-form.tsx");
  const endpoint = read("src/app/api/contact/dealer-request/route.ts");

  it("il modulo lo spedisce insieme al resto", () => {
    expect(modulo).toContain("planCode,");
  });

  it("senza piano il modulo continua a funzionare, com'e' sulla pagina dei piani", () => {
    // Le due proprieta' sono facoltative: /registrazione lo usa senza.
    expect(modulo).toContain("planCode?:");
    expect(modulo).toContain("planName?:");
    expect(read("src/app/(marketplace)/registrazione/page.tsx")).toContain("<DealerInfoRequestForm />");
  });

  it("l'email dice quale piano, nell'oggetto e nel corpo", () => {
    expect(endpoint).toContain("Richiesta informazioni sul Piano ${planLabel}");
    expect(endpoint).toContain("Piano</td>");
  });

  // Il codice del piano arriva dal browser e finisce dentro una email: uno
  // sconosciuto si ignora invece di riportarlo.
  it("un codice di piano inventato non viene ripetuto nella notifica", () => {
    expect(endpoint).toContain("PIANI_AMMESSI");
    expect(endpoint).toContain("PIANI_AMMESSI[codice] ?? null");
  });
});
