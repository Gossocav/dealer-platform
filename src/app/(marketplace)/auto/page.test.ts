import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cosa impedisce questo file.
 *
 * **Il difetto, misurato sulla produzione il 05/09/2026.** Le pagine vere del
 * catalogo erano tredici, e `/auto?page=999` rispondeva 200 con una pagina
 * vuota che **dichiarava se stessa come indirizzo ufficiale**, senza nessun
 * "non indicizzare". Un numero qualunque produceva una pagina indicizzabile e
 * priva di contenuto: uno spazio infinito di pagine identiche e vuote.
 *
 * A differenza della scheda di un'auto inesistente -- dove Next inietta da se'
 * il `noindex` e la documentazione garantisce che non porta a indicizzazione --
 * qui non c'era niente a fermarla.
 *
 * **Il test guarda i metadati veri, non il calcolo.** Con le sole prove sulla
 * funzione che conta le pagine, togliere il controllo da `generateMetadata`
 * non avrebbe fatto fallire niente.
 */

const mocks = vi.hoisted(() => ({ conteggio: 0 as number | null, errore: null as { message: string } | null }));

vi.mock("@/lib/public-marketplace", async (importOriginal) => {
  const reale = await importOriginal<typeof import("@/lib/public-marketplace")>();

  const catena: Record<string, unknown> = {};
  for (const metodo of ["from", "eq", "order"]) catena[metodo] = vi.fn(() => catena);
  // `select` con head:true si risolve da solo: e' la chiamata che conta le auto.
  catena.select = vi.fn(() => ({
    ...catena,
    eq: vi.fn(() => ({
      ...catena,
      in: vi.fn(() => ({
        ...catena,
        in: vi.fn(() => Promise.resolve({ count: mocks.conteggio, error: mocks.errore })),
      })),
    })),
  }));
  catena.in = vi.fn(() => catena);

  return { ...reale, publicSupabase: catena };
});

import { generateMetadata, ultimaPaginaDelCatalogo } from "./page";

function metadatiDi(page: string | undefined) {
  return generateMetadata({ searchParams: Promise.resolve(page === undefined ? {} : { page }) });
}

beforeEach(() => {
  mocks.conteggio = 291; // com'era la produzione: 291 auto, 24 per pagina, 13 pagine
  mocks.errore = null;
});

describe("dove finisce il catalogo", () => {
  it("con 291 auto le pagine sono tredici", () => {
    expect(ultimaPaginaDelCatalogo(291)).toBe(13);
  });

  it("un catalogo vuoto ha comunque una pagina, non zero", () => {
    // Con zero pagine, la prima pagina risulterebbe "oltre la fine" e il
    // catalogo vuoto si escluderebbe da solo dai motori.
    expect(ultimaPaginaDelCatalogo(0)).toBe(1);
  });

  it("una pagina esatta non ne inventa una in piu'", () => {
    expect(ultimaPaginaDelCatalogo(24)).toBe(1);
    expect(ultimaPaginaDelCatalogo(25)).toBe(2);
  });
});

describe("le pagine del catalogo dette ai motori di ricerca", () => {
  it("la prima si dichiara con il suo indirizzo ufficiale", async () => {
    const meta = await metadatiDi(undefined);

    expect(meta.alternates?.canonical).toBe("http://localhost:3000/auto");
    expect(meta.robots).toBeUndefined();
  });

  it("l'ultima pagina vera resta indicizzabile", async () => {
    const meta = await metadatiDi("13");

    expect(meta.alternates?.canonical).toBe("http://localhost:3000/auto?page=13");
    expect(meta.robots).toBeUndefined();
  });

  it("una pagina oltre la fine non va nell'indice", async () => {
    const meta = await metadatiDi("14");

    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("e non dichiara se stessa come indirizzo ufficiale", async () => {
    // Era il difetto esatto: una pagina vuota che chiedeva a Google di
    // considerarla la versione buona di qualcosa.
    const meta = await metadatiDi("9999");

    expect(meta.alternates?.canonical).toBeUndefined();
  });

  it("se il conteggio non arriva, non dichiara fuori posto una pagina che forse esiste", async () => {
    // Meglio lasciarla indicizzabile che escludere per errore mezzo catalogo
    // per un guasto momentaneo del database.
    mocks.errore = { message: "database irraggiungibile" };
    mocks.conteggio = null;

    const meta = await metadatiDi("5");

    expect(meta.robots).toBeUndefined();
    expect(meta.alternates?.canonical).toBe("http://localhost:3000/auto?page=5");
  });

  it("a catalogo vuoto la prima pagina resta indicizzabile", async () => {
    mocks.conteggio = 0;

    const meta = await metadatiDi(undefined);

    expect(meta.robots).toBeUndefined();
  });
});
