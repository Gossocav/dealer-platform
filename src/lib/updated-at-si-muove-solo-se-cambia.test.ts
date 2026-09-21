import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { campiDelRipasso } from "@/lib/dealer-site-sync";

/**
 * **Una scrittura inutile non e' mai gratis: costa da qualche altra parte.**
 *
 * Il ripasso dei siti passa ogni tre ore e rilegge le stesse schede.
 * Scriveva `updated_at` a ogni giro, anche quando i valori erano identici.
 * Misurato in produzione il 20/09/2026: **241 schede su 276 -- l'87% --
 * risultavano modificate nelle ultime 24 ore, e nessuna auto era stata
 * creata.**
 *
 * Dove costava, e sono due posti diversi con due vittime diverse:
 *
 * 1. **la sitemap** pubblica quella data come data di ultima modifica di ogni
 *    scheda. Ogni giorno dichiaravamo a chi indicizza che era cambiato quasi
 *    tutto il catalogo, e non era cambiato niente. Il tempo che quel
 *    visitatore ci dedica se ne andava a ricontrollare pagine uguali a ieri
 *    invece di leggere quelle mai lette: al 14/09/2026 Search Console
 *    contava **262 pagine "Rilevata, ma attualmente non indicizzata"**, e
 *    **zero** "Pagina scansionata ma non indicizzata" -- cioe' quelle 262
 *    non erano mai state scaricate;
 * 2. **la cronologia del veicolo** (`src/lib/vehicle-timeline.ts`) fabbrica
 *    da quella data un evento *"Veicolo aggiornato"* quando non ne trova uno
 *    vero. Il concessionario apriva un'auto che nessuno aveva toccato e
 *    leggeva che era stata aggiornata poche ore prima.
 *
 * E' la stessa famiglia della riscrittura dei campi del concessionario
 * (18/09/2026): **scrivere a ogni giro anche quando non cambia niente.** Li'
 * cancellava le correzioni di chi lavora, qui brucia il tempo di chi
 * indicizza. Il rimedio e' lo stesso: confrontare prima di scrivere.
 */
describe("updated_at si muove solo se e' cambiato qualcosa", () => {
  const adesso = "2026-09-20T18:00:00.000Z";
  const archivio = { price: "9500.00", mileage: 42000, color: "Grigio", brand: "Jeep" };

  it("il sito ripete gli stessi valori: la data non si muove", () => {
    const campi = campiDelRipasso({
      adesso,
      archivio,
      suiVeicoli: { price: 9500, mileage: 42000, color: "Grigio", brand: "Jeep" },
      origineDati: { price: { fonte: "sito" } },
    });

    // Si scrive che abbiamo guardato -- quello e' sempre vero e serve alla
    // fila -- ma non che la scheda e' cambiata.
    expect(campi.import_synced_at).toBe(adesso);
    expect(campi).not.toHaveProperty("updated_at");
  });

  it("il prezzo cambia davvero: la data si muove", () => {
    const campi = campiDelRipasso({
      adesso,
      archivio,
      suiVeicoli: { price: 8900, mileage: 42000, color: "Grigio", brand: "Jeep" },
      origineDati: {},
    });

    expect(campi.updated_at).toBe(adesso);
    expect(campi.price).toBe(8900);
  });

  it("9500 e \"9500.00\" sono la stessa cifra e non fanno data", () => {
    // Il confronto per testo direbbe "diverso" e rimetterebbe la data a ogni
    // giro: e' esattamente il difetto, con un altro nome. La regola sta in
    // `uguali`, la stessa usata per il disaccordo con il sito.
    const campi = campiDelRipasso({
      adesso,
      archivio: { price: "9500.00" },
      suiVeicoli: { price: 9500 },
      origineDati: {},
    });

    expect(campi).not.toHaveProperty("updated_at");
  });

  it("le targhe restano diverse: il confronto non diventa numerico per tutto", () => {
    // Il rovescio della regola qui sopra. `GA123BC` e `GA123BD` sono due
    // targhe, non due numeri.
    const campi = campiDelRipasso({
      adesso,
      archivio: { plate: "GA123BC" },
      suiVeicoli: { plate: "GA123BD" },
      origineDati: {},
    });

    expect(campi.updated_at).toBe(adesso);
  });

  it("una scheda che non si e' lasciata leggere si segna soltanto come guardata", () => {
    // Non e' un caso limite: sono le schede a cui il sito ha tolto le
    // fotografie, e in produzione al 20/09/2026 erano 32 -- riconoscibili
    // proprio perche' hanno il ripasso piu' recente di `updated_at`, fino a
    // 57 ore. Sono anche la prova che nessun trigger del database muove
    // quella data per conto suo: se lo facesse, sarebbero allineate.
    const campi = campiDelRipasso({ adesso, archivio, suiVeicoli: null, origineDati: undefined });

    expect(campi).toEqual({ import_synced_at: adesso });
  });

  it("cambia solo la provenienza: si scrive, ma non fa data", () => {
    // `origine_dati` si aggiorna anche quando cambia soltanto il giorno in cui
    // il sito e' stato visto. Quel giorno non cambia niente di cio' che si
    // legge sulla pagina, quindi non deve diventare una data di modifica.
    const campi = campiDelRipasso({
      adesso,
      archivio,
      suiVeicoli: { price: 9500 },
      origineDati: { price: { fonte: "sito", il_sito_dice: { visto_il: "2026-09-20" } } },
    });

    expect(campi.origine_dati).toBeDefined();
    expect(campi).not.toHaveProperty("updated_at");
  });
});

describe("la data che la sitemap pubblica viene da li'", () => {
  it("la sitemap legge updated_at, con created_at come ripiego", () => {
    // Il filo fra le due cose: se un domani la sitemap prendesse la data da
    // un'altra colonna, la correzione qui sopra smetterebbe di servire a
    // quello per cui e' stata fatta, e nessuno collegherebbe le due cose.
    const sitemap = readFileSync(resolve(process.cwd(), "src/app/sitemap.ts"), "utf8");
    expect(sitemap).toContain("row.updated_at ?? row.created_at");
    expect(sitemap).toContain("lastModified: dataDellaRiga(row, now)");
  });

  it("il ripasso passa dalla regola, non se la riscrive", () => {
    // Una regola scritta due volte e' una regola che un giorno dira' due cose
    // diverse: la rotta chiama `campiDelRipasso` e non compone piu' i campi
    // da se'.
    const rotta = readFileSync(
      resolve(process.cwd(), "src/app/api/cron/sincronizza-siti/route.ts"),
      "utf8",
    );
    const senzaCommenti = rotta.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
    expect(senzaCommenti).toContain("campiDelRipasso({");
    expect(senzaCommenti).not.toContain("import_synced_at: adesso, updated_at: adesso");
  });
});
