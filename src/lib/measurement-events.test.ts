import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stripPersonalData, trackEvent, trackLead, trackWhatsAppContact } from "@/lib/measurement-events";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function installaGtag() {
  const chiamate: Array<[string, string, Record<string, unknown> | undefined]> = [];
  vi.stubGlobal("window", {
    gtag: (command: string, eventName: string, params?: Record<string, unknown>) => {
      chiamate.push([command, eventName, params]);
    },
  });
  return chiamate;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Mandare nome, email o telefono a uno strumento di misura e' vietato dalle
// condizioni di Google, oltre che sbagliato: quei dati appartengono alla
// richiesta che arriva alla concessionaria, non alle statistiche.
describe("nessun dato personale finisce nelle statistiche", () => {
  it("scarta i campi che identificano una persona", () => {
    const ripulito = stripPersonalData({
      veicolo: "Audi A4",
      nome: "Mario",
      cognome: "Rossi",
      email: "mario@esempio.it",
      telefono: "3331234567",
      messaggio: "Sono interessato",
    });

    expect(ripulito).toEqual({ veicolo: "Audi A4" });
  });

  it("li scarta anche quando il nome del campo li contiene", () => {
    const ripulito = stripPersonalData({
      customer_email: "mario@esempio.it",
      user_phone: "333",
      contact_name: "Mario",
      prezzo: 21500,
    });

    expect(ripulito).toEqual({ prezzo: 21500 });
  });

  it("il filtro vale su ogni evento, non solo dove ci si ricorda di chiamarlo", () => {
    const chiamate = installaGtag();
    trackLead("veicolo", { veicolo: "Audi A4", email: "mario@esempio.it" });

    expect(chiamate[0][2]).toEqual({ tipo: "veicolo", veicolo: "Audi A4" });
  });

  it("non manda i campi vuoti", () => {
    expect(stripPersonalData({ veicolo: "", prezzo: undefined, marca: "Audi" })).toEqual({ marca: "Audi" });
  });
});

// Senza consenso lo strumento non e' stato caricato: un errore qui
// bloccherebbe l'invio di una richiesta vera per un problema di statistiche.
describe("le statistiche non possono rompere il sito", () => {
  it("senza strumento caricato non fa niente e non protesta", () => {
    vi.stubGlobal("window", {});
    expect(() => trackLead("veicolo")).not.toThrow();
    expect(() => trackWhatsAppContact()).not.toThrow();
  });

  it("se lo strumento va in errore, l'errore non esce", () => {
    vi.stubGlobal("window", {
      gtag: () => {
        throw new Error("rete assente");
      },
    });

    expect(() => trackEvent("prova")).not.toThrow();
  });

  it("sul server non tenta nemmeno", () => {
    vi.stubGlobal("window", undefined);
    expect(() => trackEvent("prova")).not.toThrow();
  });
});

describe("i momenti che contano vengono raccontati", () => {
  it("usa il nome che Google Ads riconosce da solo come conversione", () => {
    const chiamate = installaGtag();
    trackLead("demo_concessionaria");

    expect(chiamate[0][0]).toBe("event");
    expect(chiamate[0][1]).toBe("generate_lead");
    expect(chiamate[0][2]).toEqual({ tipo: "demo_concessionaria" });
  });

  it("distingue le tre richieste", () => {
    const chiamate = installaGtag();
    trackLead("veicolo");
    trackLead("demo_concessionaria");
    trackLead("info_concessionaria");

    expect(chiamate.map((c) => (c[2] as { tipo: string }).tipo)).toEqual([
      "veicolo",
      "demo_concessionaria",
      "info_concessionaria",
    ]);
  });

  // Contare un tentativo fallito come contatto renderebbe i numeri piu' belli
  // e inutili.
  it("l'evento parte solo dopo che la richiesta e' arrivata davvero", () => {
    const modulo = read("src/app/(marketplace)/auto/[id]/request-information-form.tsx");
    const primaDelSuccesso = modulo.slice(0, modulo.indexOf("trackLead("));

    expect(primaDelSuccesso).toContain("if (!response.ok)");
    expect(primaDelSuccesso).toContain("return;");
  });

  it("copre tutti e tre i moduli pubblici piu' WhatsApp", () => {
    expect(read("src/app/(marketplace)/auto/[id]/request-information-form.tsx")).toContain('trackLead("veicolo"');
    expect(read("src/app/(marketplace)/demo/page.tsx")).toContain('trackLead("demo_concessionaria")');
    expect(read("src/app/(marketplace)/registrazione/dealer-info-request-form.tsx")).toContain(
      'trackLead("info_concessionaria")',
    );
    expect(read("src/components/marketplace/whatsapp-contact-button.tsx")).toContain("trackWhatsAppContact");
  });
});
