import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { riepilogaSincronizzazioni, type RigaVeicoloImportato } from "@/lib/sincronizzazioni-veicoli";

/**
 * Il riquadro "Siti collegati" della pagina Importazione.
 *
 * Fino al 10/09/2026 mostrava due sincronizzazioni **inventate** -- "27
 * veicoli importati un'ora fa da concessionaria.it/feed.xml" -- ogni volta
 * che non trovava lo storico. Non lo trovava mai: le tre tabelle che
 * interrogava (`vehicle_import_history`, `stock_sync_history`,
 * `import_history`) non sono mai esistite. La risposta portava anche un
 * `mock: true` che la pagina ignorava.
 *
 * E' la terza volta per lo stesso difetto: la barra del pannello (PR #146) e
 * le "Visualizzazioni" sulle schede (PR #172). Questi test sono qui perche'
 * non ci sia una quarta.
 */
describe("riepilogo delle sincronizzazioni", () => {
  const riga = (
    fonte: string | null,
    sincronizzato: string | null,
    mancanteDa: string | null = null
  ): RigaVeicoloImportato => ({
    import_source: fonte,
    import_synced_at: sincronizzato,
    import_missing_since: mancanteDa,
  });

  it("senza annunci importati non inventa niente", () => {
    expect(riepilogaSincronizzazioni([])).toEqual([]);
  });

  it("gli annunci inseriti a mano non diventano una sincronizzazione", () => {
    expect(riepilogaSincronizzazioni([riga(null, null), riga("", "2026-09-01T10:00:00Z")])).toEqual([]);
  });

  it("per ogni sito conta gli annunci e tiene la data piu' recente", () => {
    const esito = riepilogaSincronizzazioni([
      riga("www.uno.it", "2026-09-01T10:00:00Z"),
      riga("www.uno.it", "2026-09-03T22:00:00Z"),
      riga("www.uno.it", "2026-08-30T08:00:00Z", "2026-09-02T00:00:00Z"),
    ]);

    expect(esito).toEqual([
      {
        fonte: "www.uno.it",
        ultimaSincronizzazione: "2026-09-03T22:00:00Z",
        annunci: 3,
        nonPiuSulSito: 1,
      },
    ]);
  });

  it("mette per primo il sito controllato piu' di recente", () => {
    const esito = riepilogaSincronizzazioni([
      riga("www.vecchio.it", "2026-08-01T10:00:00Z"),
      riga("www.nuovo.it", "2026-09-09T10:00:00Z"),
    ]);

    expect(esito.map((o) => o.fonte)).toEqual(["www.nuovo.it", "www.vecchio.it"]);
  });

  it("un sito senza data non passa davanti a uno con data, e non ne prende una finta", () => {
    const esito = riepilogaSincronizzazioni([
      riga("www.senzadata.it", null),
      riga("www.condata.it", "2026-01-01T00:00:00Z"),
    ]);

    expect(esito.map((o) => o.fonte)).toEqual(["www.condata.it", "www.senzadata.it"]);
    expect(esito[1].ultimaSincronizzazione).toBeNull();
  });

  it("una data illeggibile non diventa 'adesso'", () => {
    const esito = riepilogaSincronizzazioni([riga("www.uno.it", "non-una-data")]);
    expect(esito[0].ultimaSincronizzazione).toBeNull();
  });
});

/**
 * Questi leggono il *testo* dei sorgenti: non provano che il codice funzioni,
 * fissano una decisione. La decisione e': sul percorso vero non entrano dati
 * inventati. I dati di esempio stanno in questo file, e solo qui.
 */
describe("niente dati inventati sul percorso vero", () => {
  const senzaCommenti = (percorso: string) =>
    readFileSync(resolve(process.cwd(), percorso), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  const rotta = senzaCommenti("src/app/api/vehicles/import-feed/route.ts");
  const pagina = senzaCommenti("src/components/vehicles/vehicles-import-page.tsx");

  it("l'API non fabbrica uno storico ne' dichiara di averlo fatto", () => {
    for (const spia of ["buildMockHistory", "mock:", "mock =", "Mock"]) {
      expect(rotta, `l'API nomina "${spia}"`).not.toContain(spia);
    }
  });

  it("l'API non interroga tabelle che non esistono", () => {
    for (const tabella of ["vehicle_import_history", "stock_sync_history", "import_history"]) {
      expect(rotta, `l'API interroga ancora "${tabella}"`).not.toContain(tabella);
    }
  });

  it("l'API risponde con un errore vero, non con un elenco vuoto", () => {
    // Un 200 con la lista vuota direbbe "nessuna sincronizzazione" anche
    // quando il database non ha risposto: e' la bugia da cui nasce tutto.
    expect(rotta).toContain('{ status: 500 }');
    expect(rotta).toContain('{ status: 401 }');
    expect(rotta).toContain("Non e' stato possibile leggere le sincronizzazioni.");
  });

  it("la pagina distingue 'nessuna sincronizzazione' da 'non sono riuscito a leggerle'", () => {
    expect(pagina).toContain("Nessuna sincronizzazione registrata finora.");
    expect(pagina).toContain("originiErrore");
    // L'errore si vede: un ramo che lo mostra deve esistere.
    expect(pagina).toMatch(/originiErrore\s*\?/);
  });

  it("la pagina non tiene piu' un elenco di esempi", () => {
    for (const spia of ["mock", "Mock"]) {
      expect(pagina, `la pagina nomina "${spia}"`).not.toContain(spia);
    }
  });

  it("l'API non contiene indirizzi e veicoli di esempio", () => {
    // Un suggerimento dentro una casella vuota ("scrivi qui un indirizzo come
    // questo") e' un'altra cosa e resta: non e' un dato mostrato come vero.
    for (const spia of ["concessionaria.it", "example.com"]) {
      expect(rotta, `l'API nomina "${spia}"`).not.toContain(spia);
    }
  });
});
