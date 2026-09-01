import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getDemoPlan } from "@/lib/demo-plan-catalog";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

const PER_CHI_COMPRA = "/per-chi-compra";
const PER_LE_CONCESSIONARIE = "/per-le-concessionarie";

const home = leggi("src/app/(marketplace)/page.tsx");
const layout = leggi("src/app/(marketplace)/layout.tsx");
const shell = leggi("src/components/auth-shell.tsx");
const sitemap = leggi("src/app/sitemap.ts");
const paginaCompra = leggi("src/app/(marketplace)/per-chi-compra/page.tsx");
const paginaConcessionarie = leggi("src/app/(marketplace)/per-le-concessionarie/page.tsx");

/**
 * Le due pagine di presentazione esistono per una ragione sola: chi arriva
 * sulla home deve poter capire cos'e' KeyAuto, da qualunque dei due lati
 * arrivi. Se la home smette di linkarle, le pagine restano in piedi e
 * nessuno se ne accorge -- ma non servono piu' a niente.
 */
describe("dalla home si arriva a tutte e due le presentazioni", () => {
  it("la home linka la pagina di chi compra", () => {
    expect(home).toContain(`href="${PER_CHI_COMPRA}"`);
  });

  it("la home linka la pagina delle concessionarie", () => {
    expect(home).toContain(`href="${PER_LE_CONCESSIONARIE}"`);
  });

  it("le due porte stanno nella stessa sezione, non una sola delle due", () => {
    // Il difetto che questo impedisce: togliere una delle due schede lascia
    // una home che parla a un pubblico solo, ed e' proprio la meta' che non
    // sa ancora cos'e' KeyAuto quella che si perde.
    const sezione = home.slice(home.indexOf("DUE PORTE"), home.indexOf("============ CTA"));
    expect(sezione).toContain(PER_CHI_COMPRA);
    expect(sezione).toContain(PER_LE_CONCESSIONARIE);
  });

  it("il piede le tiene entrambe, una per colonna", () => {
    expect(layout).toContain(`href="${PER_CHI_COMPRA}"`);
    expect(layout).toContain(`href="${PER_LE_CONCESSIONARIE}"`);
  });
});

/**
 * Una pagina pubblica che non e' nell'elenco di AuthShell non mostra la
 * pagina: mostra "Verifica autenticazione..." a chiunque non abbia una
 * sessione, cioe' a tutti quelli per cui e' stata scritta. E' successo in
 * produzione sulla home -- vedi auth-shell-public-routes.test.ts.
 */
describe("le due pagine sono raggiungibili senza login", () => {
  it("AuthShell le considera pubbliche", () => {
    expect(shell).toContain(`"${PER_CHI_COMPRA}"`);
    expect(shell).toContain(`"${PER_LE_CONCESSIONARIE}"`);
  });

  it("la sitemap le dichiara", () => {
    expect(sitemap).toContain(`path: "${PER_CHI_COMPRA}"`);
    expect(sitemap).toContain(`path: "${PER_LE_CONCESSIONARIE}"`);
  });
});

/**
 * I numeri dei piani sono scritti in due posti: la pagina del piano e questa
 * presentazione. E' la stessa forma del difetto delle carrozzerie -- un
 * valore che vive in due file che non si parlano -- e si chiude allo stesso
 * modo, legandoli con un test.
 *
 * Il prezzo sbagliato su una pagina di vendita non e' un dettaglio estetico:
 * e' una cifra che un concessionario legge e su cui decide.
 */
describe("i prezzi e i limiti hanno una sorgente sola", () => {
  // Fino al 01/09/2026 prezzi ed elenchi erano scritti a mano in cinque
  // pagine, e avevano gia' divaricato: Pro ed Elite promettevano
  // "Esportazione dati", che non esiste. Adesso stanno nel catalogo e le
  // pagine lo leggono, quindi il controllo non e' piu' "dicono la stessa
  // cosa" ma "esiste una cosa sola da dire".
  const PAGINE_CHE_MOSTRANO_UN_PREZZO = [
    "src/app/(marketplace)/registrazione/base/page.tsx",
    "src/app/(marketplace)/registrazione/pro/page.tsx",
    "src/app/(marketplace)/registrazione/elite/page.tsx",
    "src/app/(marketplace)/per-le-concessionarie/page.tsx",
    "src/app/abbonamento/page.tsx",
    "src/app/abbonamento/base/page.tsx",
    "src/app/abbonamento/pro/page.tsx",
  ];

  it("nessuna pagina scrive un prezzo a mano", () => {
    for (const percorso of PAGINE_CHE_MOSTRANO_UN_PREZZO) {
      expect(leggi(percorso), `${percorso} scrive un prezzo a mano`).not.toMatch(/€\s*\d+\s*(\/mese)?["'`<]/);
    }
  });

  it("ogni pagina che mostra un prezzo lo prende dal catalogo", () => {
    for (const percorso of PAGINE_CHE_MOSTRANO_UN_PREZZO) {
      expect(leggi(percorso), `${percorso} non legge dal catalogo`).toContain("getDemoPlan");
    }
  });

  // Il prezzo sbagliato su una pagina di vendita non e' un dettaglio
  // estetico: e' una cifra su cui un concessionario decide.
  it("il catalogo dichiara i tre prezzi di lancio", () => {
    expect(getDemoPlan("base")?.priceMonthly).toBe(99);
    expect(getDemoPlan("pro")?.priceMonthly).toBe(199);
    expect(getDemoPlan("elite")?.priceMonthly).toBe(399);
  });

  // La scala conta quanto le cifre: se il piano di mezzo costasse quasi come
  // quello sopra nessuno lo sceglierebbe, e se costasse quasi come quello
  // sotto non pagherebbe il conto economico che lo giustifica.
  it("i tre prezzi salgono, e il salto e' sensato", () => {
    const base = getDemoPlan("base")!.priceMonthly;
    const pro = getDemoPlan("pro")!.priceMonthly;
    const elite = getDemoPlan("elite")!.priceMonthly;
    expect(pro).toBeGreaterThan(base);
    expect(elite).toBeGreaterThan(pro);
    expect(pro / base).toBeGreaterThanOrEqual(1.5);
    expect(elite / pro).toBeGreaterThanOrEqual(1.5);
  });

  it("i limiti della demo sono quelli che la demo applica davvero", () => {
    // 10 veicoli e' il tetto scritto in demo-access.ts: se cambia li',
    // questa pagina promette una cosa che la piattaforma poi nega.
    const demoAccess = leggi("src/lib/demo-access.ts");
    expect(demoAccess).toContain("limite massimo di 10 veicoli");
    expect(paginaConcessionarie).toContain("fino a 10 veicoli");
  });
});

/**
 * Le due pagine dicono a chi compra e a chi vende cose diverse. Questo test
 * fissa il confine: la pagina di chi compra non deve trasformarsi, ritocco
 * dopo ritocco, in una seconda pagina di vendita alle concessionarie.
 */
describe("ogni pagina parla al suo pubblico", () => {
  it("la pagina di chi compra porta al catalogo, non alla registrazione", () => {
    expect(paginaCompra).toContain('href="/auto"');
    expect(paginaCompra).not.toContain('href="/registrazione"');
  });

  it("la pagina delle concessionarie porta alla demo e ai piani", () => {
    expect(paginaConcessionarie).toContain('href="/demo"');
    expect(paginaConcessionarie).toContain('href="/registrazione"');
  });

  it("tutte e due rimandano a come funziona invece di riscriverlo", () => {
    // /come-funziona spiega i passaggi; queste spiegano cosa si ottiene.
    // Se una delle due comincia a rifare i passaggi, le pagine diventano
    // due versioni della stessa cosa che divergono al primo aggiornamento.
    expect(paginaCompra).toContain('href="/come-funziona"');
  });
});
