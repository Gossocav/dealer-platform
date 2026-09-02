import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { escapeHtml } from "@/lib/escape-html";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

/**
 * Le email di questa piattaforma si compongono incollando dati dentro
 * dell'HTML, e quei dati li scrive chi si registra: il nome della
 * concessionaria, il referente, il messaggio del modulo.
 */
describe("un testo scritto da altri non diventa codice dentro un'email", () => {
  it("i caratteri che aprirebbero un tag si spengono", () => {
    expect(escapeHtml('<b>Auto & Co</b>')).toBe("&lt;b&gt;Auto &amp; Co&lt;/b&gt;");
    expect(escapeHtml('Rossi "il Grande"')).toBe("Rossi &quot;il Grande&quot;");
    expect(escapeHtml("L'Auto")).toBe("L&#39;Auto");
  });

  // La & si sostituisce per prima, altrimenti le sostituzioni successive
  // verrebbero a loro volta ri-sostituite: "&lt;" diventerebbe "&amp;lt;".
  it("un nome gia' innocuo non viene rovinato", () => {
    expect(escapeHtml("Ponginibbi Spa")).toBe("Ponginibbi Spa");
    expect(escapeHtml("")).toBe("");
  });
});

/**
 * Il difetto trovato il 02/09/2026 mentre si sistemavano le email
 * dell'attivazione: la funzione esisteva, scritta tre volte identica in tre
 * file, e i posti che ne avevano bisogno per quarto non l'avevano copiata. Il
 * nome della concessionaria finiva nell'email cosi' com'era.
 */
describe("i nomi arrivano ripuliti in tutte le email, non solo in alcune", () => {
  const sorgenti = [
    "src/app/api/admin/demo-requests/route.ts",
    "src/lib/dealer-account-emails.ts",
    "src/app/api/demo/plan-request/route.ts",
    "src/app/api/contact/dealer-request/route.ts",
    "src/app/api/demo/request/route.ts",
  ];

  /**
   * Si guarda solo dentro l'HTML: l'oggetto dell'email e' testo normale, e li'
   * ripulire sarebbe sbagliato -- il destinatario leggerebbe "&amp;" al posto
   * della "e" commerciale.
   */
  function corpiHtml(sorgente: string) {
    return sorgente
      .split("html:")
      .slice(1)
      .map((pezzo) => pezzo.slice(0, pezzo.indexOf("`.trim()")))
      .join("\n");
  }

  it("nessun nome di concessionaria viene incollato cosi' com'e'", () => {
    for (const percorso of sorgenti) {
      const html = corpiHtml(leggi(percorso));
      expect(html.length, `${percorso}: non e' stato letto nessun corpo di email`).toBeGreaterThan(100);

      for (const grezzo of ["${dealerName}", "${targetRequest.dealership_name}", "${companyName}", '${dealer.data?.name ?? "-"}']) {
        expect(html, `${percorso} incolla ${grezzo} senza ripulirlo`).not.toContain(grezzo);
      }
    }
  });

  // Tre copie identiche della stessa funzione erano il motivo per cui la
  // quarta email non ce l'aveva: chi la scriveva non sapeva quale copiare.
  it("la funzione sta in un posto solo", () => {
    for (const percorso of sorgenti) {
      expect(leggi(percorso), `${percorso} ne tiene una copia sua`).not.toContain("function escapeHtml");
    }
    expect(leggi("src/lib/escape-html.ts")).toContain("export function escapeHtml");
  });
});
