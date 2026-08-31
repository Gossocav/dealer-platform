import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  aspettaUnaRisposta,
  dataDiVenditaProposta,
  giorniDiAttesa,
  prezzoDiVenditaProposto,
  type VeicoloDaChiudere,
} from "@/lib/auto-da-chiudere";

function veicolo(campi: Partial<VeicoloDaChiudere> = {}): VeicoloDaChiudere {
  return {
    id: "v1",
    brand: "Audi",
    model: "A3",
    version: "SPB 30 TDI",
    price: 24900,
    status: "in_review",
    import_missing_since: "2026-08-18T03:12:44.000Z",
    ...campi,
  };
}

/**
 * Al 31/08/2026 in produzione: 13 automobili sparite dal sito della
 * concessionaria, 11 parcheggiate in "In revisione", e **zero** segnate come
 * vendute. Tredici conti economici che nessuno poteva chiudere, e un archivio
 * storico dei margini che non partiva.
 */
describe("quali vetture aspettano una risposta", () => {
  it("quelle sparite dal sito e non ancora chiuse", () => {
    expect(aspettaUnaRisposta(veicolo())).toBe(true);
    expect(aspettaUnaRisposta(veicolo({ status: "published" }))).toBe(true);
  });

  it("non quelle ancora sul sito", () => {
    expect(aspettaUnaRisposta(veicolo({ import_missing_since: null }))).toBe(false);
  });

  it("non quelle a cui una risposta e' gia' stata data", () => {
    for (const stato of ["sold", "delivered", "archived", "SOLD", " Archived "]) {
      expect(aspettaUnaRisposta(veicolo({ status: stato })), stato).toBe(false);
    }
  });
});

/**
 * Le proposte non sono dati: sono il punto da cui il concessionario corregge.
 * Su tredici automobili, partire dal giorno e dalla cifra giusti gli
 * risparmia di andarli a cercare tredici volte.
 */
describe("cosa si propone, e perche' e' solo una proposta", () => {
  it("la data e' il giorno in cui e' sparita dal sito", () => {
    // Dice quando la piattaforma se n'e' accorta, non quando e' stato
    // firmato il contratto: e' il motivo per cui resta correggibile.
    expect(dataDiVenditaProposta(veicolo())).toBe("2026-08-18");
  });

  it("senza sparizione non si propone nessuna data", () => {
    expect(dataDiVenditaProposta(veicolo({ import_missing_since: null }))).toBe("");
  });

  it("il prezzo e' quello a cui era esposta", () => {
    // Quasi mai e' quello vero -- si tratta sempre -- ma e' molto piu' vicino
    // del vuoto.
    expect(prezzoDiVenditaProposto(veicolo())).toBe(24900);
    expect(prezzoDiVenditaProposto(veicolo({ price: null }))).toBeNull();
  });

  it("da quanti giorni aspetta", () => {
    const adesso = new Date("2026-08-31T10:00:00.000Z");
    expect(giorniDiAttesa(veicolo(), adesso)).toBe(13);
    expect(giorniDiAttesa(veicolo({ import_missing_since: null }), adesso)).toBeNull();
  });
});

/**
 * La regola che non deve cambiare senza che qualcuno la decida: **niente si
 * chiude da solo**. Una vettura puo' sparire dal sito anche perche' il
 * concessionario l'ha tolta o perche' il sito ha avuto un intoppo. Segnarla
 * venduta in automatico metterebbe nei conti una vendita mai avvenuta.
 */
describe("niente si chiude da solo", () => {
  const pagina = readFileSync(resolve(process.cwd(), "src/components/vehicles/vehicles-to-close-page.tsx"), "utf8");
  const sincronizzazione = readFileSync(resolve(process.cwd(), "src/lib/dealer-site-sync.ts"), "utf8");

  it("la sincronizzazione non segna mai una vettura come venduta", () => {
    expect(sincronizzazione).not.toContain('"sold"');
    expect(sincronizzazione).not.toContain("'sold'");
  });

  it("lo stato cambia solo dentro la funzione che risponde al clic", () => {
    const blocco = pagina.slice(pagina.indexOf("const chiudi = async"), pagina.indexOf("const aperte ="));
    expect(blocco).toContain('status: come === "venduta" ? "sold" : "archived"');
    // E fuori da li' nessun altro punto tocca lo stato.
    expect(pagina.split('.from("vehicles")').length - 1).toBe(2);
  });

  it("senza prezzo non si puo' segnare venduta", () => {
    expect(pagina).toContain("Per segnare una vettura come venduta serve il prezzo");
  });

  it("prima il prezzo, poi lo stato", () => {
    // L'ordine opposto lascerebbe una vettura segnata venduta senza il prezzo
    // che la spiega, e il margine del mese sarebbe sbagliato in silenzio.
    const blocco = pagina.slice(pagina.indexOf("const chiudi = async"), pagina.indexOf("const aperte ="));
    expect(blocco.indexOf('from("vehicle_economics")')).toBeLessThan(blocco.indexOf('from("vehicles")'));
  });
});

describe("dallo stato in cui la sincronizzazione le parcheggia si puo' chiudere", () => {
  it("da 'in revisione' si arriva a 'venduto'", () => {
    // Prima non si poteva: le tredici auto sparite avrebbero dovuto essere
    // ripubblicate prima, cioe' rimesse in vetrina per un istante pur non
    // esistendo piu'.
    const macchina = readFileSync(resolve(process.cwd(), "src/lib/vehicle-state-machine.ts"), "utf8");
    // Ancorato alla tabella dei passaggi: "in_review" compare anche altrove,
    // per esempio nell'elenco dei permessi.
    const tabella = macchina.slice(macchina.indexOf("const PIPELINE_TRANSITIONS"));
    const inizio = tabella.indexOf("in_review: [");
    const riga = tabella.slice(inizio, tabella.indexOf("],", inizio));
    expect(riga).toContain('"sold"');
  });
});
