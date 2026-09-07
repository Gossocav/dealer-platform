import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cosa impedisce questo file.
 *
 * **Il difetto vero, misurato il 6 settembre 2026.** La sitemap leggeva le auto
 * con `.limit(45000)`. Ma il database consegna mille righe per richiesta e non
 * lo dice: chiederne quarantacinquemila non ne fa arrivare quarantacinquemila,
 * ne fa arrivare mille. Con 296 auto in catalogo non si vedeva niente; alla
 * millesima pubblicata la sitemap si sarebbe fermata li' **in silenzio**, e
 * ogni auto successiva sarebbe sparita da Google senza nessun errore a
 * segnalarlo. Un test che leggesse il sorgente non lo avrebbe mai visto: la
 * riga `.limit(45000)` sembra giusta. Serve far arrivare piu' di mille righe e
 * contarle.
 *
 * **La data falsa.** Le pagine fisse dichiaravano come data di modifica l'ora
 * della compilazione. A ogni rilascio -- cinque, il 5 settembre -- la home e la
 * privacy dicevano a Google di essere cambiate. Non era vero, e una data
 * inventata insegna a Google a non fidarsi della data su *tutta* la sitemap,
 * comprese le schede auto dove invece era corretta.
 */

const mocks = vi.hoisted(() => ({
  righe: [] as unknown[],
  rangeChiamate: [] as Array<[number, number]>,
}));

vi.mock("@/lib/public-marketplace", async (importOriginal) => {
  const reale = await importOriginal<typeof import("@/lib/public-marketplace")>();

  // Solo il client viene sostituito: lo slug, il nome della concessionaria e
  // i filtri restano quelli veri, altrimenti il test proverebbe se stesso.
  const catena: Record<string, unknown> = {};
  for (const metodo of ["from", "select", "eq", "in", "order"]) {
    catena[metodo] = vi.fn(() => catena);
  }
  // `limit` c'e' apposta anche se il codice buono non lo usa piu': serve a far
  // fallire questo test in modo leggibile -- "1000 invece di 1500" -- se un
  // giorno qualcuno rimettesse la lettura in un colpo solo, invece di farlo
  // esplodere con "limit non e' una funzione", che non spiega niente.
  catena.limit = vi.fn((n: number) => Promise.resolve({ data: mocks.righe.slice(0, Math.min(n, 1000)), error: null }));
  catena.range = vi.fn((da: number, a: number) => {
    mocks.rangeChiamate.push([da, a]);
    // Il tetto vero del database, quello che non viene dichiarato: comunque si
    // chieda, non tornano mai piu' di mille righe. Senza questo taglio il
    // finto sarebbe piu' generoso del vero e il test passerebbe anche con il
    // difetto dentro -- cioe' non proverebbe niente.
    const bloccoMassimo = 1000;
    return Promise.resolve({ data: mocks.righe.slice(da, a + 1).slice(0, bloccoMassimo), error: null });
  });

  return { ...reale, publicSupabase: catena };
});

import sitemap, * as moduloSitemap from "./sitemap";

const BASE = "http://localhost:3000";

function autoFinta(indice: number, dealer: string, aggiornata: string) {
  return {
    id: `veicolo-${String(indice).padStart(5, "0")}`,
    updated_at: aggiornata,
    created_at: "2026-01-01T00:00:00.000Z",
    dealers: { id: dealer, name: dealer, legal_name: dealer, status: "approved" },
  };
}

beforeEach(() => {
  mocks.righe = [];
  mocks.rangeChiamate = [];
});

describe("sitemap, come viene servita", () => {
  /**
   * Non legge il sorgente: legge i valori che Next legge davvero dal modulo.
   * Non prova che Vercel si comporti bene -- quello si vede solo in produzione,
   * e la prova e' che le date cambino senza un rilascio -- ma impedisce che
   * qualcuno rimetta `revalidate` credendo che basti.
   *
   * Il difetto che blocca: `revalidate = 3600` era dichiarato e non veniva
   * onorato. La sitemap si rigenerava solo al rilascio, e il 5 settembre
   * dichiarava 248 auto su 298 pubblicate.
   */
  it("si ricostruisce a ogni richiesta, non a intervalli", () => {
    expect(moduloSitemap.dynamic).toBe("force-dynamic");
  });

  it("non dichiara piu' un intervallo di rigenerazione, che non veniva rispettato", () => {
    expect("revalidate" in moduloSitemap).toBe(false);
  });
});

describe("sitemap", () => {
  it("elenca tutte le auto anche quando sono piu' delle mille righe per richiesta", async () => {
    // Millecinquecento: oltre il blocco da mille, che e' il punto in cui il
    // vecchio codice si fermava senza dirlo.
    mocks.righe = Array.from({ length: 1500 }, (_, i) => autoFinta(i, "Concessionaria Alfa", "2026-05-01T10:00:00.000Z"));

    const voci = await sitemap();
    const schede = voci.filter((v) => v.url.includes("/auto/veicolo-"));

    expect(schede).toHaveLength(1500);
    expect(schede.at(-1)?.url).toBe(`${BASE}/auto/veicolo-01499`);
    // Due blocchi pieni e un terzo parziale: la prova che ha davvero paginato.
    expect(mocks.rangeChiamate.length).toBeGreaterThan(1);
  });

  it("si ferma quando il database non ha piu' righe, senza chiedere all'infinito", async () => {
    mocks.righe = Array.from({ length: 30 }, (_, i) => autoFinta(i, "Concessionaria Alfa", "2026-05-01T10:00:00.000Z"));

    const voci = await sitemap();

    expect(voci.filter((v) => v.url.includes("/auto/"))).toHaveLength(30);
    expect(mocks.rangeChiamate).toHaveLength(1);
  });

  it("non dichiara nessuna data di modifica sulle pagine fisse", async () => {
    mocks.righe = [autoFinta(1, "Concessionaria Alfa", "2026-05-01T10:00:00.000Z")];

    const voci = await sitemap();
    const home = voci.find((v) => v.url === BASE);
    const privacy = voci.find((v) => v.url === `${BASE}/privacy`);

    expect(home).toBeDefined();
    expect(privacy).toBeDefined();
    expect(home?.lastModified).toBeUndefined();
    expect(privacy?.lastModified).toBeUndefined();
  });

  it("la data di una concessionaria e' quella della sua auto piu' recente", async () => {
    mocks.righe = [
      autoFinta(1, "Concessionaria Alfa", "2026-03-01T10:00:00.000Z"),
      autoFinta(2, "Concessionaria Alfa", "2026-07-15T10:00:00.000Z"),
      autoFinta(3, "Concessionaria Alfa", "2026-05-01T10:00:00.000Z"),
    ];

    const voci = await sitemap();
    const concessionaria = voci.find((v) => v.url.includes("/concessionarie/"));

    expect(concessionaria?.url).toBe(`${BASE}/concessionarie/concessionaria-alfa`);
    expect((concessionaria?.lastModified as Date).toISOString()).toBe("2026-07-15T10:00:00.000Z");
  });

  it("una data storta nel database non finisce nella sitemap", async () => {
    mocks.righe = [
      { id: "veicolo-rotto", updated_at: "non-una-data", created_at: null, dealers: { id: "d", name: "Beta", legal_name: "Beta", status: "approved" } },
    ];

    const voci = await sitemap();
    const scheda = voci.find((v) => v.url.includes("/auto/veicolo-rotto"));

    expect(Number.isNaN((scheda?.lastModified as Date).getTime())).toBe(false);
  });

  it("una concessionaria compare una volta sola anche con molte auto", async () => {
    mocks.righe = [
      autoFinta(1, "Concessionaria Alfa", "2026-05-01T10:00:00.000Z"),
      autoFinta(2, "Concessionaria Alfa", "2026-05-02T10:00:00.000Z"),
      autoFinta(3, "Concessionaria Beta", "2026-05-03T10:00:00.000Z"),
    ];

    const voci = await sitemap();
    const concessionarie = voci.filter((v) => v.url.includes("/concessionarie/"));

    expect(concessionarie).toHaveLength(2);
  });
});
