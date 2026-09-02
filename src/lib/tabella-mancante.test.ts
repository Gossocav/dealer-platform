import { describe, expect, it } from "vitest";
import { nomeDellaColonnaMancante, tabellaNonAncoraCreata } from "@/lib/tabella-mancante";

/**
 * Lo schema di produzione e' andato alla deriva rispetto alle migration piu'
 * di una volta, e le modifiche al database le applica a mano il titolare:
 * esiste sempre una finestra in cui il codice e' in linea e la colonna no.
 * Dentro quella finestra una scrittura non deve cadere per una colonna
 * accessoria.
 */
describe("riconoscere una colonna che questo database non ha", () => {
  /**
   * Il difetto che questo test impedisce, trovato in revisione il 02/09/2026:
   * l'attivazione diretta cercava solo il messaggio di Postgres, mentre sul
   * database vero risponde quasi sempre PostgREST, con un messaggio che non
   * gli somiglia per niente. Il ripiego c'era, il commento lo spiegava, e non
   * e' mai entrato in funzione: su uno schema alla deriva l'attivazione
   * falliva con un errore generico.
   */
  it("nella forma che manda PostgREST quando la colonna non e' nella sua cache", () => {
    expect(
      nomeDellaColonnaMancante("Could not find the 'province' column of 'demo_requests' in the schema cache")
    ).toBe("province");
  });

  it("e nella forma che manda Postgres quando decide lui", () => {
    expect(
      nomeDellaColonnaMancante('column "dealership_name" of relation "demo_requests" does not exist')
    ).toBe("dealership_name");
  });

  // Un errore qualunque non deve far togliere una colonna a caso e riprovare:
  // si riproverebbe all'infinito su un guasto che non c'entra niente.
  it("un errore che parla d'altro non nomina nessuna colonna", () => {
    expect(nomeDellaColonnaMancante("duplicate key value violates unique constraint")).toBeNull();
    expect(nomeDellaColonnaMancante("new row violates row-level security policy")).toBeNull();
    expect(nomeDellaColonnaMancante(null)).toBeNull();
    expect(nomeDellaColonnaMancante(undefined)).toBeNull();
  });
});

describe("riconoscere una tabella che non c'e' ancora", () => {
  it("in tutte e due le forme", () => {
    expect(tabellaNonAncoraCreata('relation "public.dealer_costs" does not exist', "dealer_costs")).toBe(true);
    expect(
      tabellaNonAncoraCreata("Could not find the table 'public.dealer_costs' in the schema cache", "dealer_costs")
    ).toBe(true);
  });

  it("ma non confonde una tabella con un'altra", () => {
    expect(tabellaNonAncoraCreata('relation "public.leads" does not exist', "dealer_costs")).toBe(false);
  });
});
