import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VEHICLE_BODY_TYPES } from "@/lib/vehicle-body-types";

/**
 * Il difetto che questo test impedisce, ed e' costato caro.
 *
 * Il 22/08/2026 "SUV/Pick-up" e' diventata "SUV/Pick-up/Fuoristrada"
 * nell'elenco del codice. Il vincolo sul database e' rimasto al nome vecchio,
 * e da quel giorno il database ha rifiutato ogni veicolo con quella
 * carrozzeria: l'inserimento a mano falliva, e l'importazione dai siti
 * scartava in silenzio i SUV -- cioe' la maggior parte di quello che una
 * concessionaria vende. Il 27/08/2026, in produzione, nessuna delle 149
 * automobili aveva carrozzeria SUV.
 *
 * L'elenco vive in due posti che non possono parlarsi -- un file TypeScript e
 * un file SQL applicato a mano -- e questo test e' l'unico ponte fra i due.
 *
 * Guarda la migration **piu' recente** che ridefinisce il vincolo, non una
 * scritta qui a mano: quella dovremmo ricordarci di cambiarla a ogni
 * rinomina, ed e' esattamente il tipo di cosa che non ci si ricorda.
 */

const CARTELLA = resolve(process.cwd(), "supabase/migrations");

function migrazioneDelVincolo() {
  const candidate = readdirSync(CARTELLA)
    .filter((nome) => nome.endsWith(".sql"))
    .sort()
    .filter((nome) =>
      readFileSync(resolve(CARTELLA, nome), "utf8").includes("add constraint vehicles_body_type_check"),
    );

  const ultima = candidate.at(-1);
  if (!ultima) throw new Error("nessuna migration definisce vehicles_body_type_check");

  return { nome: ultima, sql: readFileSync(resolve(CARTELLA, ultima), "utf8") };
}

function valoriDelVincolo(sql: string): string[] {
  const dentro = sql.slice(sql.lastIndexOf("body_type in ("));
  const elenco = dentro.slice(dentro.indexOf("(") + 1, dentro.indexOf(")"));
  return [...elenco.matchAll(/'([^']+)'/g)].map((trovato) => trovato[1]);
}

describe("il vincolo del database e l'elenco del codice dicono la stessa cosa", () => {
  it("ogni carrozzeria che il codice puo' salvare, il database la accetta", () => {
    const { sql } = migrazioneDelVincolo();
    expect(valoriDelVincolo(sql).sort()).toEqual([...VEHICLE_BODY_TYPES].sort());
  });

  // I nomi vecchi non devono restare ammessi: se restassero, una riga scritta
  // con quelli passerebbe il vincolo e poi non comparirebbe in nessun filtro.
  it("i nomi gia' abbandonati non sono piu' ammessi", () => {
    const valori = valoriDelVincolo(migrazioneDelVincolo().sql);
    expect(valori).not.toContain("SUV/Pick-up");
    expect(valori).not.toContain("SUV/Pick-up/Fuoristrada");
  });

  /**
   * L'ordine dei tre passi, che sbagliato fa fallire la migration a meta'.
   *
   * Visto succedere il 27/08/2026 provandola su un Postgres in Docker: scritta
   * con i dati prima del "drop", l'aggiornamento delle righe avviene mentre e'
   * ancora in vigore il vincolo vecchio -- che il nome nuovo non lo conosce --
   * e Postgres rifiuta.
   */
  it("prima si toglie il vincolo vecchio, poi si aggiornano i dati, poi si mette quello nuovo", () => {
    const { sql } = migrazioneDelVincolo();
    const drop = sql.indexOf("drop constraint if exists vehicles_body_type_check");
    const update = sql.indexOf("set body_type =");
    const add = sql.indexOf("add constraint vehicles_body_type_check");

    expect(drop).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(drop);
    expect(add).toBeGreaterThan(update);
  });
});
