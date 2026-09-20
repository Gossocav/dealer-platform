import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  applicaFiltriConcessionaria,
  filtriConcessionariaDaIndirizzo,
  ordinaConcessionaria,
  valoriDeiFiltri,
  type CostruttoreDiRichiesta,
} from "@/lib/filtri-concessionaria-db";

/**
 * **I filtri della pagina di una concessionaria li applica il database.**
 *
 * Prima la pagina caricava fino a trecento automobili e le sceglieva nel
 * browser. Con 133 funzionava, e finche' l'elenco e' intero il conto torna.
 * Il giorno che questa pagina sara' divisa in pagine da ventiquattro -- ed
 * e' il lavoro subito dopo -- il browser ne avrebbe in mano ventiquattro e
 * scriverebbe "12 auto su 133" avendone guardate ventiquattro: **lo stesso
 * difetto del prezzo minimo calcolato sulle prime trecento, chiuso il
 * 19/09/2026 su questa stessa pagina.**
 *
 * Per questo l'ordine e' filtri prima, pagine dopo: al contrario ci sarebbe
 * un momento in cui la pagina mente.
 *
 * Misurato il 20/09/2026 sulla produzione: `?brand=Jeep` su Autogepy
 * restituisce **44 auto su 133**, e l'HTML scende da 1.218 KB a **467**
 * perche' il database ne manda 44 invece di 133. Filtrando nel browser il
 * peso restava quello intero comunque.
 */

/** Un finto costruttore che registra cosa gli e' stato chiesto. */
function fintaRichiesta() {
  const chiamate: string[] = [];
  const q: CostruttoreDiRichiesta = {
    ilike: (c, v) => { chiamate.push(`ilike ${c} ${v}`); return q; },
    eq: (c, v) => { chiamate.push(`eq ${c} ${String(v)}`); return q; },
    gte: (c, v) => { chiamate.push(`gte ${c} ${String(v)}`); return q; },
    lte: (c, v) => { chiamate.push(`lte ${c} ${String(v)}`); return q; },
    order: (c, o) => { chiamate.push(`order ${c} ${o.ascending ? "asc" : "desc"} nullsFirst=${o.nullsFirst}`); return q; },
  };
  return { q, chiamate };
}

describe("dall'indirizzo ai filtri", () => {
  it("legge i campi e ignora quello che non conosce", () => {
    const filtri = filtriConcessionariaDaIndirizzo({ brand: "Jeep", fuel: "Diesel", inventato: "x" });
    expect(filtri.brand).toBe("Jeep");
    expect(filtri.fuel).toBe("Diesel");
    expect(filtri.model).toBe("");
  });

  it("un ordinamento scritto a mano nell'indirizzo non passa", () => {
    // Altrimenti chiunque potrebbe cambiare la colonna su cui si ordina
    // scrivendola nell'indirizzo.
    expect(filtriConcessionariaDaIndirizzo({ sort: "price_asc" }).sort).toBe("price_asc");
    expect(filtriConcessionariaDaIndirizzo({ sort: "; drop table" }).sort).toBe("created_desc");
    expect(filtriConcessionariaDaIndirizzo({}).sort).toBe("created_desc");
  });

  it("l'ordinamento non e' un filtro", () => {
    // Ha sempre un valore: contarlo farebbe aprire il riquadro dei filtri a
    // chi non ha scelto niente.
    const filtri = filtriConcessionariaDaIndirizzo({ sort: "price_asc" });
    expect(valoriDeiFiltri(filtri).filter((v) => v !== "")).toEqual([]);
  });
});

describe("i filtri arrivano al database", () => {
  it("marca e modello si confrontano senza maiuscole", () => {
    // Nei dati la stessa auto e' scritta "C3" (x11) e "c3" (x2): con un
    // confronto esatto chi sceglieva una delle due voci perdeva le altre.
    // E' la stessa regola di /ricerca, non una seconda scritta qui.
    const { q, chiamate } = fintaRichiesta();
    applicaFiltriConcessionaria(q, filtriConcessionariaDaIndirizzo({ brand: "Citroen", model: "C3" }));
    expect(chiamate.some((c) => c.startsWith("ilike brand"))).toBe(true);
    expect(chiamate.some((c) => c.startsWith("ilike model"))).toBe(true);
    expect(chiamate.some((c) => c.startsWith("eq brand"))).toBe(false);
  });

  it("la ricerca libera chiede ogni parola separatamente", () => {
    // "tucson diesel" trova anche quando le due parole stanno in campi
    // diversi del titolo: e' la regola di paroleRicercaVeicolo.
    const { q, chiamate } = fintaRichiesta();
    applicaFiltriConcessionaria(q, filtriConcessionariaDaIndirizzo({ q: "tucson diesel" }));
    expect(chiamate.filter((c) => c.includes("ricerca_testo")).length).toBe(2);
  });

  it("gli anni si scambiano se arrivano al contrario", () => {
    // "dal 2020 al 2015" e' un errore di battitura, non una richiesta di
    // zero risultati.
    const { q, chiamate } = fintaRichiesta();
    applicaFiltriConcessionaria(q, filtriConcessionariaDaIndirizzo({ yearFrom: "2020", yearTo: "2015" }));
    expect(chiamate).toContain("gte registration_date 2015-01-01");
    expect(chiamate).toContain("lte registration_date 2020-12-31");
  });

  it("prezzi e chilometri diventano confronti sul numero", () => {
    const { q, chiamate } = fintaRichiesta();
    applicaFiltriConcessionaria(q, filtriConcessionariaDaIndirizzo({ minPrice: "10.000", maxPrice: "30000", maxMileage: "120000" }));
    expect(chiamate).toContain("gte price 10000");
    expect(chiamate).toContain("lte price 30000");
    expect(chiamate).toContain("lte mileage 120000");
  });

  it("un filtro vuoto non aggiunge niente alla richiesta", () => {
    const { q, chiamate } = fintaRichiesta();
    applicaFiltriConcessionaria(q, filtriConcessionariaDaIndirizzo({}));
    expect(chiamate).toEqual([]);
  });
});

describe("l'ordinamento mette i valori mancanti in coda", () => {
  it("sempre, in tutte e due le direzioni", () => {
    // Postgres considera un valore assente come il piu' grande: in ordine
    // decrescente le auto senza prezzo aprirebbero l'elenco.
    for (const sort of ["price_asc", "price_desc", "year_asc", "mileage_desc", "created_desc"] as const) {
      const { q, chiamate } = fintaRichiesta();
      ordinaConcessionaria(q, sort);
      expect(chiamate[0], sort).toContain("nullsFirst=false");
    }
  });

  it("ordina sulla data di immatricolazione, non sulla colonna anno", () => {
    // E' il dato che il concessionario compila davvero, come su /ricerca.
    const { q, chiamate } = fintaRichiesta();
    ordinaConcessionaria(q, "year_desc");
    expect(chiamate[0]).toContain("registration_date");
  });
});

/**
 * I due guardiani sul testo del sorgente: dicono che nessuno puo' rifare le
 * cose per conto suo. Il difetto arrivera' da una porta nuova.
 */
const pagina = readFileSync("src/app/(marketplace)/concessionarie/[slug]/page.tsx", "utf8");
const componente = readFileSync("src/components/marketplace/dealer-vehicle-search.tsx", "utf8");

describe("la pagina non filtra piu' nel browser", () => {
  it("il riquadro della ricerca non e' piu' un componente del browser", () => {
    // Se tornasse client, tornerebbero anche i filtri in memoria e il conto
    // su un elenco parziale.
    expect(componente.trimStart().startsWith('"use client"')).toBe(false);
    expect(componente).toContain('method="GET"');
  });

  it("le tendine nascono da tutto lo stock, non dall'elenco filtrato", () => {
    // Altrimenti dopo aver scelto "Jeep" la tendina delle marche
    // conterrebbe solo Jeep e non si potrebbe piu' cambiare idea: la stessa
    // trappola del conteggio su un elenco tagliato, spostata sulle scelte.
    expect(pagina).toContain("caricaTutto");
    const blocco = pagina.slice(pagina.indexOf("const opzioni = opzioniFiltri("));
    expect(blocco.slice(0, 200)).toContain("righeDelloStock");
  });

  it("un filtro che non trova niente non e' una pagina inesistente", () => {
    // Verificato sulla produzione: ?brand=Ferrari su Autogepy risponde 200
    // e scrive "0 auto su 133". Un 404 avrebbe potuto far togliere
    // dall'indice una pagina viva.
    expect(pagina).toContain("dealerVehicles.length === 0 && filtriAttivi === 0");
  });

  it("chi e' la concessionaria non si legge dalla prima auto dell'elenco", () => {
    // Con i filtri attivi l'elenco puo' essere vuoto, e la pagina sarebbe
    // rimasta senza nome proprio mentre spiega che non c'e' niente.
    expect(pagina).not.toContain("dealerVehicles[0].dealers");
  });
});
