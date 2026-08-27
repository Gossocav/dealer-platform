import { readFileSync } from "node:fs";
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
 */

const migrazione = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260827020000_vehicles_carrozzeria_fuoristrada.sql"),
  "utf8",
);

function valoriDelVincolo(sql: string): string[] {
  const dentro = sql.slice(sql.lastIndexOf("body_type in ("));
  const elenco = dentro.slice(dentro.indexOf("(") + 1, dentro.indexOf(")"));
  return [...elenco.matchAll(/'([^']+)'/g)].map((trovato) => trovato[1]);
}

describe("il vincolo del database e l'elenco del codice dicono la stessa cosa", () => {
  it("ogni carrozzeria che il codice puo' salvare, il database la accetta", () => {
    expect(valoriDelVincolo(migrazione).sort()).toEqual([...VEHICLE_BODY_TYPES].sort());
  });

  // Il nome vecchio non deve restare ammesso: se restasse, una riga scritta
  // con quello passerebbe il vincolo e poi non comparirebbe in nessun filtro.
  it("il nome vecchio non e' piu' ammesso", () => {
    expect(valoriDelVincolo(migrazione)).not.toContain("SUV/Pick-up");
  });

  // Prima il vincolo, i dati: se una riga avesse ancora il nome vecchio,
  // aggiungere il vincolo nuovo farebbe fallire tutta la migration.
  it("le righe col nome vecchio vengono aggiornate prima del vincolo", () => {
    const posizioneUpdate = migrazione.indexOf("set body_type = 'SUV/Pick-up/Fuoristrada'");
    const posizioneVincolo = migrazione.indexOf("add constraint vehicles_body_type_check");
    expect(posizioneUpdate).toBeGreaterThan(-1);
    expect(posizioneUpdate).toBeLessThan(posizioneVincolo);
  });
});
