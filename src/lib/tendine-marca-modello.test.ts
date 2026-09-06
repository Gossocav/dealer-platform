import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Le tendine Marca e Modello della ricerca.
 *
 * **Quale difetto impedisce.** Segnalato dal titolare il 06/09/2026: nella
 * "Ricerca avanzata", scegliendo Audi, la tendina dei modelli continuava a
 * mostrarli **tutti**. Chi cerca doveva sapere gia' quale modello Audi
 * cercare, e se ne sceglieva uno di un'altra marca otteneva zero risultati
 * senza capire perche'.
 *
 * Il legame marca -> modello esisteva **solo** nella ricerca della home
 * (`hero-brand-model-fields.tsx`), e non era mai stato portato sulla ricerca
 * avanzata: due tendine indipendenti, e la marca non filtrava niente finche'
 * non si premeva Cerca.
 *
 * **E un secondo difetto, trovato verificando.** La home il legame ce l'aveva,
 * ma costruiva le tendine sui **24 veicoli piu' recenti** invece che su tutto
 * il pubblicato. Misurato in produzione: 296 veicoli pubblicati, e la tendina
 * ne mostrava 12 marche e 18 modelli. Un'Audi A3 in vetrina non compariva fra
 * i modelli Audi -- l'auto c'era, e chi la cercava non poteva sceglierla.
 */

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");

const componente = leggi("src/components/marketplace/tendine-marca-modello.tsx");
const home = leggi("src/app/(marketplace)/page.tsx");
const ricerca = leggi("src/app/(marketplace)/ricerca/page.tsx");

describe("il legame marca -> modello vale su tutte e due le ricerche", () => {
  it("la ricerca avanzata usa le tendine legate, non due tendine indipendenti", () => {
    expect(ricerca, "la ricerca avanzata non usa le tendine legate").toContain("TendineMarcaModello");
    expect(ricerca).toContain('variante="ricerca"');
  });

  it("la home le usa allo stesso modo", () => {
    expect(home).toContain("TendineMarcaModello");
    expect(home).toContain('variante="home"');
  });

  it("la regola sta scritta in un posto solo", () => {
    // Il difetto da evitare: due copie del legame, una per pagina. E' gia'
    // successo in questo progetto con il filtro di ricerca, e le due copie
    // erano diverse.
    expect(
      existsSync(resolve(process.cwd(), "src/components/marketplace/hero-brand-model-fields.tsx")),
      "il vecchio componente e' ancora li': due copie della stessa regola"
    ).toBe(false);

    for (const pagina of [home, ricerca]) {
      expect(pagina, "una pagina si ricostruisce le tendine a mano").not.toMatch(/name="model"\s*\n/);
    }
  });

  it("scegliendo una marca si mostrano i suoi modelli, non tutti", () => {
    // La riga che fa il lavoro. Se sparisse, la tendina tornerebbe a
    // mostrare sempre l'elenco intero -- esattamente il difetto segnalato.
    expect(componente).toContain("marca ? brandModelMap[marca] ?? [] : allModels");
  });

  it("cambiando marca il modello scelto prima non resta appiccicato", () => {
    // Senza, si manderebbe una ricerca "Audi + Tucson" che non puo' dare
    // risultati, e chi cerca non capirebbe perche'.
    expect(componente).toContain("modelli.includes(modelloIniziale) ? modelloIniziale");
    expect(componente, "il campo non si ridisegna al cambio di marca").toContain("key={marca}");
  });
});

describe("le tendine mostrano tutto l'inventario, non una finestra", () => {
  it("la home costruisce marca e modello su tutto il pubblicato", () => {
    // Nascevano da `vehicles`, che e' limitato a 24 righe ed e' li' per le
    // "ultime arrivate". publishedRows copre tutto il pubblicato, e viene
    // gia' letto nella stessa pagina con caricaTutto.
    const blocco = home.slice(home.indexOf("const brands ="), home.indexOf("const latestVehicleCards"));

    expect(blocco, "le marche nascono ancora dai 24 veicoli piu' recenti").toContain("publishedRows.map((row) => row.brand)");
    expect(blocco).toContain("publishedRows.map((row) => row.model)");
    expect(blocco, "la mappa marca->modelli nasce ancora dalla finestra dei 24").toContain(
      "publishedRows.filter((row) => formatText(row.brand) === brand)"
    );
    expect(blocco, "le tendine leggono ancora la finestra dei 24").not.toContain("vehicles.map((vehicle) => vehicle.brand)");
  });

  it("e per farlo la lettura completa porta anche il modello", () => {
    // Senza `model` fra le colonne lette, la mappa nascerebbe vuota e la
    // tendina non mostrerebbe niente scegliendo una marca: peggio di prima.
    expect(home).toContain('"dealer_id, body_type, brand, model, dealers!inner(status, name, legal_name, city)"');
    // Senza il flag `s`, che il progetto non puo' usare (target ES2017):
    // si ritaglia il blocco e ci si guarda dentro.
    const tipo = home.slice(home.indexOf("type PublishedRow = {"), home.indexOf("};", home.indexOf("type PublishedRow = {")));
    expect(tipo, "PublishedRow non porta il modello").toContain("model: string | null;");
  });
});
