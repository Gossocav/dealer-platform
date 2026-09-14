import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { esitoTarga, messaggioTarga, normalizzaTarga, targaDaSalvare, targaValida } from "@/lib/targa";

/**
 * Il difetto che questi test impediscono, misurato il 14/09/2026 leggendo le
 * schede dei tre siti collegati: su **62 targhe pubblicate, due valevano
 * `XXX` e `XXXX`** -- segnaposto lasciati nel gestionale del concessionario.
 *
 * Una targa sbagliata e' peggio di una mancante: la ricerca a pagamento si
 * paga a interrogazione anche quando la targa non esiste, e la targa e' una
 * delle due chiavi con cui una vettura si segna venduta e con cui si
 * raggruppano i suoi documenti.
 */

describe("cosa e' una targa e cosa no", () => {
  it("le targhe vere passano, in tutti i formati che un piazzale vede", () => {
    expect(esitoTarga("GL888CA")).toEqual({ stato: "valida", targa: "GL888CA", formato: "auto" });
    expect(esitoTarga("HA849AH").stato).toBe("valida");
    // Motocicli dal 1999: due lettere e cinque cifre.
    expect(esitoTarga("AB12345")).toEqual({ stato: "valida", targa: "AB12345", formato: "moto" });
    // D'epoca, sigla della provincia: una concessionaria ne tratta di rado, ma
    // ne tratta, e rifiutarla la costringerebbe a lasciare il campo vuoto.
    // Le sigle delle province usano anche I, O, Q e U: Milano, Bologna,
    // L'Aquila. Il divieto di quelle lettere vale solo sul formato moderno.
    expect(esitoTarga("MI123456").stato).toBe("valida");
    expect(esitoTarga("BO45678").stato).toBe("valida");
    expect(esitoTarga("ROMA12345").stato).toBe("valida");
  });

  it("i segnaposto trovati sui siti veri non passano", () => {
    // Sono i due casi reali del 14/09/2026.
    expect(esitoTarga("XXX").stato).toBe("non-valida");
    expect(esitoTarga("XXXX").stato).toBe("non-valida");
    expect(esitoTarga("000000").stato).toBe("non-valida");
    expect(esitoTarga("TARGA").stato).toBe("non-valida");
    // Un trattino da solo e' il modo in cui si scrive "non ce l'ha": vale come
    // campo vuoto, e non e' un errore da segnalare.
    expect(esitoTarga("-").stato).toBe("vuota");
  });

  it("le quattro lettere che le targhe italiane non usano vengono rifiutate", () => {
    // I, O, Q, U si confondono con 1, 0 e fra loro: non compaiono mai su una
    // targa italiana. Un controllo che le accettasse lascerebbe passare targhe
    // mai esistite, e le pagheremmo alla ricerca a consumo.
    for (const targa of ["IO123QU", "AI123BB", "AB123OO", "QQ123AA"]) {
      expect(esitoTarga(targa).stato, targa).toBe("non-valida");
    }
    const esito = esitoTarga("IO123QU");
    expect(esito.stato === "non-valida" && esito.motivo).toContain("I, O, Q e U");
  });

  it("un campo vuoto e' un'assenza, non un errore", () => {
    // Una vettura importata dal sito non ha quasi mai la targa: nessuno deve
    // essere costretto a inventarsene una per poter salvare la scheda.
    expect(esitoTarga("")).toEqual({ stato: "vuota" });
    expect(esitoTarga("   ")).toEqual({ stato: "vuota" });
    expect(esitoTarga(null)).toEqual({ stato: "vuota" });
    expect(esitoTarga(undefined)).toEqual({ stato: "vuota" });
    expect(messaggioTarga("")).toBeNull();
  });

  it("la stessa targa scritta in due modi e' la stessa targa", () => {
    expect(normalizzaTarga("gl 888 ca")).toBe("GL888CA");
    expect(normalizzaTarga("GL-888-CA")).toBe("GL888CA");
    expect(normalizzaTarga(" gl888ca ")).toBe("GL888CA");
    expect(targaValida("gl 888 ca")).toBe(true);
  });

  it("solo una targa valida finisce nell'archivio", () => {
    expect(targaDaSalvare("gl 888 ca")).toBe("GL888CA");
    expect(targaDaSalvare("")).toBeNull();
    // Non valida: non si salva come targa. Chi salva si ferma e lo dice.
    expect(targaDaSalvare("XXXX")).toBeNull();
  });

  it("il messaggio dice cosa c'e' che non va, non solo che non va", () => {
    // "Targa non valida" lascia chi legge a indovinare se ha sbagliato a
    // digitare o se il formato non e' previsto.
    expect(messaggioTarga("XXXX")).toBe('"XXXX" non sembra una targa: la forma prevista e\' AA123BB per le auto, AB12345 per le moto.');
    expect(messaggioTarga("GL888CA")).toBeNull();
  });
});

/**
 * Un test sul testo dei sorgenti: il tipo non puo' esprimere "la forma della
 * targa si decide in un posto solo".
 *
 * Fino al 14/09/2026 le copie erano due e non si conoscevano: la rotta della
 * ricerca a pagamento aveva la sua, che sapeva solo il formato moderno e
 * accettava le lettere I, O, Q e U; la casella "Targa" della scheda veicolo
 * non ne aveva nessuna e salvava qualunque cosa.
 */
describe("la forma della targa si decide in un posto solo", () => {
  const percorsi = [
    "src/app/api/vehicles/plate-lookup/route.ts",
    "src/components/vehicles/vehicle-editor-page.tsx",
  ];

  it("i due punti d'ingresso chiedono a src/lib/targa.ts", () => {
    for (const percorso of percorsi) {
      const sorgente = readFileSync(resolve(process.cwd(), percorso), "utf8");
      expect(sorgente, percorso).toContain('from "@/lib/targa"');
    }
  });

  it("nessuno dei due si riscrive la forma per conto suo", () => {
    // Una seconda copia diverge: e' successo con la Content-Security-Policy,
    // con la verifica del pannello admin e con il freno alle richieste.
    for (const percorso of percorsi) {
      const sorgente = readFileSync(resolve(process.cwd(), percorso), "utf8");
      expect(sorgente, `${percorso} si riscrive la forma della targa`).not.toMatch(/\[A-Z\]\{2\}\\d\{3\}/);
    }
  });

  it("la scheda in modifica non salva piu' la targa senza guardarla", () => {
    const sorgente = readFileSync(resolve(process.cwd(), "src/components/vehicles/vehicle-editor-page.tsx"), "utf8");
    expect(sorgente).toContain("plate: targaDaSalvare(state.plate)");
    expect(sorgente).not.toContain("plate: state.plate.trim().toUpperCase()");
  });
});
