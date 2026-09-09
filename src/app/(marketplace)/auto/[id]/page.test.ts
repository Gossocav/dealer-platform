import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cosa impedisce questo file.
 *
 * **Il difetto, misurato il 6 e 7 settembre 2026.** Nessuna scheda veniva
 * costruita in anticipo: `generateStaticParams` restituiva un elenco vuoto, e
 * ogni scheda nasceva alla prima visita. Misurato su dodici schede mai chieste
 * prima: 0,65 s di mediana contro 0,07 s quando la pagina e' pronta. Con quasi
 * trecento schede e poco traffico, **quasi ogni visita di Googlebot cadeva su
 * una pagina fredda** -- ed e' la condizione che Google descrive per lo stato
 * "Rilevata, ma attualmente non indicizzata", dove il 6 settembre c'erano 124
 * schede: conosciute e mai aperte.
 *
 * **Il difetto secondario, piu' insidioso.** Se la lettura dell'elenco fallisce
 * durante la pubblicazione del sito, la pubblicazione non deve fallire: si
 * torna al comportamento di prima, che funzionava. Un elenco di schede non vale
 * un sito che non si aggiorna piu'.
 */

const mocks = vi.hoisted(() => ({
  righe: [] as unknown[],
  errore: null as { message: string } | null,
  rangeChiamate: [] as Array<[number, number]>,
}));

vi.mock("@/lib/public-marketplace", async (importOriginal) => {
  const reale = await importOriginal<typeof import("@/lib/public-marketplace")>();

  const catena: Record<string, unknown> = {};
  for (const metodo of ["from", "select", "eq", "in", "order"]) {
    catena[metodo] = vi.fn(() => catena);
  }
  catena.range = vi.fn((da: number, a: number) => {
    mocks.rangeChiamate.push([da, a]);
    if (mocks.errore) {
      return Promise.resolve({ data: null, error: mocks.errore });
    }
    // Il tetto vero del database, quello che non viene dichiarato: comunque si
    // chieda, non tornano mai piu' di mille righe.
    return Promise.resolve({ data: mocks.righe.slice(da, a + 1).slice(0, 1000), error: null });
  });
  catena.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));

  return { ...reale, publicSupabase: catena };
});

import { generateStaticParams } from "./page";

beforeEach(() => {
  mocks.righe = [];
  mocks.errore = null;
  mocks.rangeChiamate = [];
});

describe("le schede costruite prima che qualcuno le chieda", () => {
  it("ne dichiara una per ogni auto pubblicata", async () => {
    mocks.righe = Array.from({ length: 291 }, (_, i) => ({ id: `veicolo-${i}` }));

    const params = await generateStaticParams();

    expect(params).toHaveLength(291);
    expect(params[0]).toEqual({ id: "veicolo-0" });
  });

  it("se la lettura fallisce non blocca la pubblicazione del sito", async () => {
    mocks.errore = { message: "database irraggiungibile" };

    const params = await generateStaticParams();

    // Elenco vuoto: si torna al comportamento di prima, ogni scheda si
    // costruisce alla prima visita. Meglio piano che fermo.
    expect(params).toEqual([]);
  });

  it("a catalogo vuoto non dichiara niente, senza rompersi", async () => {
    const params = await generateStaticParams();

    expect(params).toEqual([]);
  });

  it("si ferma al budget dichiarato invece di costruire tutto all'infinito", async () => {
    mocks.righe = Array.from({ length: 2500 }, (_, i) => ({ id: `veicolo-${i}` }));

    const params = await generateStaticParams();

    expect(params).toHaveLength(1000);
  });

  it("legge oltre il blocco da mille del database quando serve", async () => {
    // Il tetto e' mille, quindi con millecinquecento disponibili ne prende
    // mille: la prova che conta e' che li abbia chiesti a blocchi e non in un
    // colpo solo, perche' in un colpo solo il database ne avrebbe dati mille
    // comunque -- e nessuno se ne sarebbe accorto.
    mocks.righe = Array.from({ length: 1500 }, (_, i) => ({ id: `veicolo-${i}` }));

    await generateStaticParams();

    expect(mocks.rangeChiamate[0]).toEqual([0, 999]);
  });
});
