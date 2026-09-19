import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { PREZZO_DA_CONCORDARE, parsePrice, prezzoDaMostrare, prezzoPerIlCliente } from "@/lib/vehicles";
import { messaggioDelTetto } from "@/lib/tetto-del-piano";
import { costoTotale, leggiImporto, percheIlCosto } from "@/lib/conto-economico";
import { LO_ZERO_VUOL_DIRE_QUALCOSA, scrivi } from "@/components/vehicles/vehicle-economics-card";
import { contaPubblicate, postiLiberi } from "@/lib/tetto-del-piano-db";

/**
 * **Lo zero e il vuoto sono due cose diverse, e si sbagliano in due versi.**
 *
 * Questo file tiene insieme le due direzioni, perche' la regola che le
 * distingue e' una sola e chi ne corregge una deve vedere l'altra:
 *
 * - **il vuoto che diventa zero**: un'auto senza prezzo che dichiara "0 €";
 * - **lo zero che diventa vuoto**: un prezzo d'acquisto scritto zero che il
 *   modulo rilegge come "manca il prezzo di acquisto".
 *
 * Misura del 19/09/2026 sulla produzione, che spiega perche' nessuno se ne
 * era accorto: **372 auto su 372 hanno un prezzo**, e delle 10 righe di
 * conto economico **nessuna ha l'acquisto a zero** (9 vuote, 1 con 4.000).
 * Nessuno dei due difetti era visibile: erano tutti e due carichi.
 */

describe("il vuoto non diventa zero: il prezzo di un'auto", () => {
  it("un prezzo che c'e' si scrive, e zero e' un prezzo che c'e'", () => {
    // Non si fissa la forma scritta -- il separatore delle migliaia dipende
    // da com'e' compilato Node -- ma la proprieta': la cifra c'e' e non c'e'
    // un trattino.
    expect(prezzoDaMostrare(9500).testo).toMatch(/9[.,\s]?500/);
    expect(prezzoDaMostrare(9500).perche).toBeNull();
    // Una permuta a saldo, un'auto della casa madre: zero e' un dato.
    expect(prezzoDaMostrare(0).perche).toBeNull();
    expect(prezzoDaMostrare(0).testo).toContain("0");
  });

  it("un prezzo che non c'e' non vale zero euro, e dice perche'", () => {
    for (const assente of [null, undefined, "", "   ", "non lo so"]) {
      const { testo, perche } = prezzoDaMostrare(assente);
      expect(testo).not.toMatch(/0/);
      // Il trattino non va mai da solo.
      expect(perche).toBe("nessun prezzo indicato");
    }
  });

  it("parsePrice non risponde piu' zero a chi non ha un prezzo", () => {
    // Era una trappola con la miccia lunga: nessuno la chiamava, ma il primo
    // che l'avesse fatto si sarebbe portato dietro un'auto da zero euro.
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("ciao")).toBeNull();
    expect(parsePrice(0)).toBe(0);
    expect(parsePrice("9500")).toBe(9500);
  });
});

describe("lo zero non diventa vuoto: cio' che parte verso il cliente", () => {
  it("un'auto a zero si annuncia a zero, non 'da concordare'", () => {
    // Il difetto: la guardia era `> 0`. Una permuta o una vettura di
    // cortesia venivano annunciate al cliente come "Su richiesta".
    expect(prezzoPerIlCliente(0)).not.toBe(PREZZO_DA_CONCORDARE);
    expect(prezzoPerIlCliente(0)).toContain("0");
  });

  it("un prezzo che non abbiamo dice quello, non una condizione di vendita", () => {
    // "Su richiesta" e' una frase che il concessionario non ha detto: lo
    // impegnava a una condizione che nessuno aveva scelto.
    expect(prezzoPerIlCliente(null)).toBe(PREZZO_DA_CONCORDARE);
    expect(PREZZO_DA_CONCORDARE).not.toMatch(/su richiesta/i);
  });

  it("la finestra e l'email rispondono alla stessa domanda nello stesso modo", () => {
    // Prima erano due frasi diverse per lo stesso vuoto, nello stesso invio:
    // la finestra "Su richiesta", l'email "-". Il guardiano non confronta i
    // due testi, controlla che **passino dalla stessa funzione**.
    const senzaCommenti = (percorso: string) =>
      readFileSync(percorso, "utf8")
        .split("\n")
        .filter((riga) => !riga.trimStart().startsWith("//") && !riga.trimStart().startsWith("*"))
        .join("\n");
    const finestra = senzaCommenti("src/components/vehicles/send-to-client-dialog.tsx");
    const email = senzaCommenti("src/app/api/vehicles/send-to-client/route.ts");
    for (const [nome, sorgente] of [["la finestra", finestra], ["l'email", email]] as const) {
      expect(sorgente, `${nome} deve usare prezzoPerIlCliente`).toContain("prezzoPerIlCliente");
      expect(sorgente, `${nome} non deve piu' dire "Su richiesta"`).not.toContain("Su richiesta");
    }
  });
});

/**
 * Un finto database che risponde come quello vero: o con un conteggio, o con
 * un errore. Serve a provare il caso che in produzione non si puo'
 * provocare, ed e' l'unico in cui il difetto si vedeva.
 */
function databaseChe(risposta: { count: number | null; error: unknown }) {
  const catena: Record<string, unknown> = {};
  for (const metodo of ["select", "eq", "not", "is"]) {
    catena[metodo] = () => catena;
  }
  // La catena e' anche la promessa: `await` sull'ultimo anello restituisce
  // la risposta, come fa il client di Supabase.
  catena.then = (risolvi: (v: unknown) => unknown) => Promise.resolve(risposta).then(risolvi);
  return { from: () => catena } as never;
}

describe("un conteggio che non riesce non vale zero", () => {
  it("le auto pubblicate si contano, e quando non si riesce si dice", async () => {
    expect(await contaPubblicate(databaseChe({ count: 93, error: null }), "d1")).toBe(93);
    // Il caso vero: nessuna pubblicata **e' un fatto**, e si distingue.
    expect(await contaPubblicate(databaseChe({ count: 0, error: null }), "d1")).toBe(0);
    // Il difetto: `count ?? 0` rispondeva "nessuna pubblicata" a una
    // richiesta fallita, cioe' "c'e' posto per tutto".
    expect(await contaPubblicate(databaseChe({ count: null, error: { message: "boom" } }), "d1")).toBeNull();
    expect(await contaPubblicate(databaseChe({ count: null, error: null }), "d1")).toBeNull();
  });

  it("i posti liberi non si calcolano su un conteggio che non c'e'", async () => {
    expect(await postiLiberi(databaseChe({ count: 40, error: null }), "d1", 50)).toBe(10);
    // Non piu' di quanti ne permette il piano, e mai negativo.
    expect(await postiLiberi(databaseChe({ count: 60, error: null }), "d1", 50)).toBe(0);
    // Con il conteggio ignoto rispondeva **50 posti liberi**, e un clic che
    // il database avrebbe rifiutato passava il controllo preventivo.
    expect(await postiLiberi(databaseChe({ count: null, error: { message: "boom" } }), "d1", 50)).toBeNull();
    // Senza tetto leggibile era gia' `null` e resta cosi'.
    expect(await postiLiberi(databaseChe({ count: 40, error: null }), "d1", null)).toBeNull();
  });

  it("senza il numero delle auto in attesa non si scrive la frase del tetto", () => {
    // Il seguito del difetto: l'avviso spariva, e il concessionario non
    // sapeva di avere auto ferme fuori dalla vetrina.
    expect(messaggioDelTetto(50, null)).toBeNull();
    expect(messaggioDelTetto(50, 0)).toBeNull();
    expect(messaggioDelTetto(50, 76)).toContain("76 auto");
    expect(messaggioDelTetto(50, 1)).toContain("1 auto");
  });
});

/**
 * **Il guardiano sul testo dei sorgenti.** Il test qui sopra dice che le
 * funzioni fanno la cosa giusta; questo dice che **nessuno puo' rifarla per
 * conto suo**. Il difetto arrivera' da una porta nuova, non da quella gia'
 * corretta -- e' successo con il tetto del piano, corretto in un posto e
 * aggirato in dodici.
 */
const RIPIEGO_A_ZERO_SUL_PREZZO = /\b(?:price|prezzo)[A-Za-z_]*\s*(?:\?\?|\|\|)\s*0\b/;

function ripieghiSulPrezzo(sorgente: string): string[] {
  return sorgente
    .split("\n")
    .filter((riga) => !riga.trimStart().startsWith("//") && !riga.trimStart().startsWith("*"))
    .filter((riga) => RIPIEGO_A_ZERO_SUL_PREZZO.test(riga))
    .map((riga) => riga.trim());
}

/**
 * L'unico rimasto, e non e' un valore mostrato: e' il **confronto** con cui
 * la home ordina le auto dalla piu' cara. Un'auto senza prezzo trattata come
 * zero finisce in fondo, che e' dove deve stare -- la stessa cosa che fa il
 * database con `nullsFirst: false`. L'elenco puo' solo accorciarsi.
 */
const ORDINAMENTI_CONOSCIUTI = ["src/app/(marketplace)/page.tsx"];

describe("nessuna porta nuova fa valere zero un prezzo che non c'e'", () => {
  it("nessun file mostra un prezzo con un ripiego a zero", () => {
    const file = execSync("find src -name '*.ts' -o -name '*.tsx'")
      .toString()
      .trim()
      .split("\n")
      .filter((percorso) => percorso && !percorso.includes(".test."));
    expect(file.length).toBeGreaterThan(50);

    const trovati: string[] = [];
    for (const percorso of file) {
      if (ORDINAMENTI_CONOSCIUTI.includes(percorso)) continue;
      for (const riga of ripieghiSulPrezzo(readFileSync(percorso, "utf8"))) {
        trovati.push(`${percorso} · ${riga}`);
      }
    }
    expect(trovati).toEqual([]);
  });

  it("il guardiano diventa rosso davanti a una porta nuova", () => {
    // Senza questo, un errore nell'espressione risponderebbe "tutto a posto"
    // per sempre.
    expect(ripieghiSulPrezzo("const x = Number(vehicle.price ?? 0);")).toHaveLength(1);
    expect(ripieghiSulPrezzo("const y = prezzoDiListino || 0;")).toHaveLength(1);
    // Un commento che ne parla non e' una porta.
    expect(ripieghiSulPrezzo("// qui c'era price ?? 0, ed era sbagliato")).toEqual([]);
    expect(ripieghiSulPrezzo("const z = prezzoDaMostrare(vehicle.price);")).toEqual([]);
  });
});

/**
 * **Lo zero che diventava vuoto nel conto economico.**
 *
 * La catena intera, e ogni anello peggiorava il precedente:
 *
 * 1. nel database `purchase_price = 0` (una permuta a saldo, un'auto della
 *    casa madre);
 * 2. `scrivi(0)` rispondeva `""` per via di `valore !== 0`;
 * 3. la casella appariva **vuota**;
 * 4. `leggiImporto("")` rispondeva `null`;
 * 5. il costo totale diventava `null` e la scheda annunciava **"manca il
 *    prezzo di acquisto"** su un prezzo che c'e';
 * 6. e al primo salvataggio successivo il modulo **riscriveva `null` nel
 *    database** al posto dello zero. Non si perdeva una frase: si perdeva
 *    il dato, senza che nessuno avesse toccato quel campo.
 *
 * **Non e' stato possibile provarlo su una riga vera**: il 19/09/2026 in
 * produzione le righe di conto economico sono dieci, nove completamente
 * vuote e una con l'acquisto a 4.000 -- **nessuna con lo zero**. Si prova
 * quindi sul giro completo, che e' il posto dove il difetto viveva.
 */
describe("lo zero non diventa vuoto: il conto economico", () => {
  it("un acquisto a zero resta zero per tutto il giro, e non torna vuoto", () => {
    const nellaCasella = scrivi(0, "purchase_price");
    expect(nellaCasella).toBe("0");
    // Il passaggio che perdeva il dato: da qui usciva `null`.
    expect(leggiImporto(nellaCasella)).toBe(0);
    // E il conto si fa, invece di dire che manca l'acquisto.
    expect(percheIlCosto({ purchase_price: 0, cost_transport: 500 })).toBeNull();
    expect(costoTotale({ purchase_price: 0, cost_transport: 500 })).toBe(500);
  });

  it("un acquisto che non c'e' resta vuoto, e il conto non si inventa", () => {
    expect(scrivi(null, "purchase_price")).toBe("");
    expect(leggiImporto("")).toBeNull();
    expect(costoTotale({ cost_transport: 500 })).toBeNull();
    expect(percheIlCosto({ cost_transport: 500 })).toBe("manca il prezzo di acquisto");
  });

  it("le dieci voci di costo restano vuote a zero, e c'e' un motivo", () => {
    // Nel database sono obbligatorie con valore predefinito zero: li' lo
    // zero **e'** il campo vuoto, e mostrarle tutte e dieci con uno "0"
    // riempirebbe il modulo di cifre che nessuno ha digitato.
    for (const costo of ["cost_transport", "cost_bodywork", "cost_bollo", "cost_other"]) {
      expect(scrivi(0, costo)).toBe("");
    }
    // Un importo vero si scrive sempre, con la virgola italiana.
    expect(scrivi(1500.5, "cost_transport")).toBe("1500,5");
  });

  it("l'elenco delle colonne che distinguono lo zero e' quello dello schema", () => {
    // Letto dallo schema di produzione il 19/09/2026: `purchase_price` e
    // `sale_price` sono le due sole colonne di importo che ammettono `null`.
    // Se domani una `cost_*` diventasse annullabile, va aggiunta qui.
    expect([...LO_ZERO_VUOL_DIRE_QUALCOSA].sort()).toEqual(["purchase_price", "sale_price"]);
  });
});

/**
 * **Il valore del parco e il prezzo medio.**
 *
 * La pagina Statistiche aveva un `parsePrice` tutto suo, che il guardiano
 * sui sorgenti non vedeva perche' non conteneva la parola "price" accanto a
 * un `?? 0`. Faceva tutti e due i difetti in otto righe:
 *
 * - **il vuoto valeva zero**: un'auto senza prezzo entrava nella somma come
 *   se valesse zero, e il "Valore del parco" usciva piu' basso del vero,
 *   scritto come se fosse esatto. Il prezzo medio era peggio, perche'
 *   divideva per **tutte** le auto: una sola senza prezzo su dieci abbassava
 *   la media del dieci per cento;
 * - **lo zero diventava vuoto**: nell'elenco, `parsePrice(...) || null`
 *   trasformava un'auto messa a zero in un'auto senza prezzo.
 */
describe("il valore del parco non conta a zero le auto senza prezzo", () => {
  const valore = (prezzi: Array<number | null>) => {
    const noti = prezzi.map((p) => parsePrice(p)).filter((p): p is number => p !== null);
    return {
      totale: noti.reduce((s, p) => s + p, 0),
      media: noti.length > 0 ? Math.round(noti.reduce((s, p) => s + p, 0) / noti.length) : null,
      fuori: prezzi.length - noti.length,
    };
  };

  it("somma e media si fanno sui prezzi che ci sono, e si dice quante restano fuori", () => {
    expect(valore([10000, 20000, 30000])).toEqual({ totale: 60000, media: 20000, fuori: 0 });
    // Il caso del difetto: con il vecchio conto la media era 15.000 su
    // quattro auto, cioe' un quarto piu' bassa del vero.
    expect(valore([10000, 20000, 30000, null])).toEqual({ totale: 60000, media: 20000, fuori: 1 });
  });

  it("un'auto messa a zero conta come zero, non come 'senza prezzo'", () => {
    // `|| null` la faceva sparire dal conto e dall'elenco.
    expect(valore([10000, 0])).toEqual({ totale: 10000, media: 5000, fuori: 0 });
  });

  it("senza nessun prezzo non si scrive un totale: non e' zero euro", () => {
    expect(valore([null, null])).toEqual({ totale: 0, media: null, fuori: 2 });
  });
});
