import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  aspettaUnaRisposta,
  giorniDiAttesa,
  puoEssereSegnataVenduta,
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
    plate: null,
    vin: null,
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
 * Prezzo e data nascono **vuoti**, per decisione del titolare del 31/08/2026.
 *
 * Li proponevo: il prezzo di listino e il giorno in cui la vettura era sparita
 * dal sito. Nessuno dei due e' il dato vero -- sul prezzo si tratta sempre, e
 * la sparizione dice quando ce ne siamo accorti noi, non quando e' stato
 * firmato il contratto.
 *
 * Il difetto che questo impedisce: un campo precompilato con un numero quasi
 * giusto si conferma senza guardarlo, e l'archivio si riempie di cifre
 * plausibili e false -- che e' peggio di un archivio incompleto, perche' non
 * si distinguono piu' dalle vere.
 */
describe("niente viene proposto: chi sa, scrive", () => {
  const pagina = readFileSync(resolve(process.cwd(), "src/components/vehicles/vehicles-to-close-page.tsx"), "utf8");

  it("i due campi nascono vuoti", () => {
    expect(pagina).toContain('prezzoVendita: ""');
    expect(pagina).toContain('dataVendita: ""');
  });

  it("le funzioni che proponevano non esistono piu'", () => {
    // Codice morto che dice "proponiamo" sarebbe fuorviante per chi legge.
    const libreria = readFileSync(resolve(process.cwd(), "src/lib/auto-da-chiudere.ts"), "utf8");
    expect(libreria).not.toContain("dataDiVenditaProposta");
    expect(libreria).not.toContain("prezzoDiVenditaProposto");
  });

  it("i giorni di attesa restano, perche' quelli sono un fatto", () => {
    // Non e' una proposta da confermare: e' da quanto tempo la vettura
    // aspetta, e serve a mettere in cima le piu' vecchie.
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

  it("senza targa ne telaio non si puo' segnare venduta", () => {
    // La regola e' cambiata il 31/08/2026: prima pretendeva il prezzo. Adesso
    // pretende cio' che identifica la vettura, e lascia i conti alla
    // discrezione del concessionario.
    expect(pagina).toContain("serve la targa oppure il numero di telaio");
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

/**
 * La regola che il titolare ha chiesto il 31/08/2026, e la sua meta' meno
 * ovvia: **la targa e' obbligatoria, i conti no**.
 */
describe("targa o telaio per chiudere una vendita", () => {
  it("basta uno dei due", () => {
    expect(puoEssereSegnataVenduta({ targa: "AB123CD", telaio: null })).toBe(true);
    expect(puoEssereSegnataVenduta({ targa: null, telaio: "WAUZZZ8K" })).toBe(true);
  });

  it("senza nessuno dei due non si chiude", () => {
    // In produzione al 31/08/2026 nessuna delle 269 automobili aveva targa o
    // telaio: arrivano tutte dall'importazione, che non li espone. Vuol dire
    // che questa regola morde davvero, su ogni singola chiusura.
    expect(puoEssereSegnataVenduta({ targa: null, telaio: null })).toBe(false);
    expect(puoEssereSegnataVenduta({})).toBe(false);
  });

  it("gli spazi non sono una targa", () => {
    expect(puoEssereSegnataVenduta({ targa: "   ", telaio: "  " })).toBe(false);
  });
});

describe("i conti economici restano facoltativi", () => {
  const pagina = readFileSync(resolve(process.cwd(), "src/components/vehicles/vehicles-to-close-page.tsx"), "utf8");

  it("si puo' chiudere una vendita senza scrivere nessun importo", () => {
    // Pretendere il prezzo costringerebbe a inventare una cifra pur di
    // chiudere la riga, ed e' il modo piu' sicuro di riempire l'archivio di
    // numeri falsi.
    const blocco = pagina.slice(pagina.indexOf("const chiudi = async"), pagina.indexOf("const aperte ="));
    expect(blocco).not.toContain('come === "venduta" && prezzo === null');
    expect(blocco).toContain('come === "venduta" && !targa && !telaio');
  });

  it("il conto economico si scrive solo se c'e' qualcosa da scriverci", () => {
    expect(pagina).toContain('come === "venduta" && (prezzo !== null || riga.dataVendita)');
  });

  it("un prezzo scritto storto si segnala, ma uno vuoto no", () => {
    expect(pagina).toContain('riga.prezzoVendita.trim() !== "" && prezzo === null');
  });
});

describe("la regola vive anche nel database", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260831020000_targa_obbligatoria_su_venduto.sql"), "utf8");

  it("un trigger la impone da qualunque schermata", () => {
    // Lo stato si cambia da piu' punti -- questa pagina, il modulo di
    // modifica, un domani un'importazione -- e una regola scritta in uno solo
    // di quei posti prima o poi si aggira senza accorgersene.
    expect(sql).toContain("create trigger trg_enforce_plate_on_sold");
    expect(sql).toContain("before insert or update on public.vehicles");
  });

  it("vale anche per 'consegnata', che viene dopo 'venduta'", () => {
    expect(sql).toContain("v_stato in ('sold', 'delivered')");
  });

  it("una targa fatta di spazi non conta", () => {
    expect(sql).toContain("btrim(coalesce(new.plate, ''))");
    expect(sql).toContain("btrim(coalesce(new.vin, ''))");
  });

  it("non pretende nessun importo", () => {
    for (const campo of ["purchase_price", "sale_price", "vehicle_economics"]) {
      expect(sql, `il trigger nomina ${campo}`).not.toContain(campo);
    }
  });
});

/**
 * Una vendita si registra anche dalla scheda del veicolo, dal 31/08/2026.
 *
 * Prima "Da chiudere" era l'unico modo, e quella pagina elenca le sole
 * vetture **sparite dal sito**: un'auto venduta mentre era ancora online, o
 * inserita a mano, non aveva nessun modo di essere chiusa e restava fuori dai
 * conti delle vendite per sempre. In produzione erano 251 in vetrina e 8
 * bozze: la situazione si sarebbe presentata presto.
 */
describe("si puo' chiudere una vendita anche dalla scheda del veicolo", () => {
  const modulo = readFileSync(resolve(process.cwd(), "src/components/vehicles/vehicle-editor-page.tsx"), "utf8");
  const macchina = readFileSync(resolve(process.cwd(), "src/lib/vehicle-state-machine.ts"), "utf8");

  it("lo stato Venduto si puo' scegliere", () => {
    expect(modulo).toContain('<option value="sold">Venduto</option>');
  });

  it("il modulo ha la targa, non solo il telaio", () => {
    // La targa e' quello che un concessionario ha sotto mano; il telaio va
    // cercato sul libretto. Il campo mancava del tutto.
    expect(modulo).toContain('<EditorField label="Targa" value={state.plate}');
    expect(modulo).toContain("plate: state.plate.trim().toUpperCase() || null,");
    expect(modulo).toContain("registration_date, color, plate, vin, mileage");
  });

  it("senza targa ne telaio il salvataggio si ferma prima del database", () => {
    // Il trigger lo rifiuterebbe comunque, ma con un errore che arriva dopo:
    // meglio dirlo mentre si compila.
    expect(modulo).toContain("puoEssereSegnataVenduta({ targa: state.plate, telaio: state.vin })");
    expect(modulo).toContain("serve la targa oppure il numero di telaio");
  });

  it("si puo' vendere anche una bozza", () => {
    // Capita di vendere una vettura prima di averla pubblicata: un cliente
    // che passa e la compra dal piazzale. Senza questo passaggio quella
    // vendita si sarebbe potuta registrare solo pubblicando prima l'annuncio
    // di un'auto gia' venduta.
    const tabella = macchina.slice(macchina.indexOf("const PIPELINE_TRANSITIONS"));
    const riga = tabella.slice(tabella.indexOf("draft: ["), tabella.indexOf("],", tabella.indexOf("draft: [")));
    expect(riga).toContain('"sold"');
  });

  it("la regola sulla targa e' una sola, scritta in un posto solo", () => {
    // La stessa funzione serve "Da chiudere" e il modulo di modifica: due
    // copie divergerebbero, e una delle due schermate finirebbe per lasciar
    // passare quello che l'altra blocca.
    const chiusura = readFileSync(resolve(process.cwd(), "src/components/vehicles/vehicles-to-close-page.tsx"), "utf8");
    expect(chiusura).toContain("!targa && !telaio");
    expect(modulo).toContain("puoEssereSegnataVenduta");
  });
});
