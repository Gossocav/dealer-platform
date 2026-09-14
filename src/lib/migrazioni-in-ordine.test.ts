import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **Ogni migration ha la data nel nome, e c'e' una ragione seria.**
 *
 * In una ricostruzione da zero le migration si applicano in ordine
 * **alfabetico** (`scripts/ricostruisci-schema.sh`), e nell'alfabeto del
 * computer **le cifre vengono prima delle lettere**. Un file che comincia per
 * lettera finisce quindi **dopo tutti** quelli datati, comprese le migration
 * scritte mesi dopo: qualunque cosa ridefinisca, vince.
 *
 * Il difetto, misurato il 14/09/2026: `rls_vehicles_policies.sql` ridefinisce
 * `enforce_vehicle_dealer_id()` ed `enforce_vehicle_image_dealer_id()` -- due
 * protezioni dell'isolamento fra concessionarie -- con una versione piu'
 * vecchia di quella in produzione. Girando per ultimo era **quella a
 * sopravvivere alla ricostruzione**, e nessuna correzione scritta dopo avrebbe
 * potuto avere la meglio. Le due versioni si comportavano allo stesso modo,
 * questa volta; la prossima potrebbe non essere cosi'.
 *
 * I due file esistenti **non si rinominano**: cambiare il nome cambierebbe
 * l'ordine in modi che nessuno ha verificato, e sono gia' stati allineati a
 * mano al contenuto della produzione. Questo test impedisce che ne nascano
 * altri.
 */

const CARTELLA = "supabase/migrations";

/**
 * I due che c'erano gia' il 14/09/2026, con il perche' accanto. Chi ne
 * aggiunge un terzo deve spiegarlo qui, e a quel punto si accorge di cosa sta
 * facendo -- che e' lo scopo di questo elenco.
 */
const SENZA_DATA_CONOSCIUTI = new Set([
  // Ridefinisce current_dealer_id() e i due trigger dell'isolamento. Allineato
  // al contenuto della produzione il 14/09/2026, con la spiegazione in cima.
  "rls_vehicles_policies.sql",
  // Aggiunge dealer_id alle fotografie e lo rende obbligatorio.
  "add_dealer_id_to_vehicle_images.sql",
]);

const nomiSql = () =>
  readdirSync(resolve(process.cwd(), CARTELLA)).filter((nome) => nome.endsWith(".sql"));

describe("le migration si applicano nell'ordine che ci si aspetta", () => {
  it("ogni migration nuova comincia con la sua data", () => {
    // Otto cifre: 20260914. Chi scrive un file che comincia per lettera lo
    // vedra' girare per ultimo, dopo tutto quello che verra' scritto in
    // futuro, e quasi mai e' quello che voleva.
    const senzaData = nomiSql().filter((nome) => !/^\d{8}/.test(nome));
    const nuovi = senzaData.filter((nome) => !SENZA_DATA_CONOSCIUTI.has(nome));

    expect(
      nuovi,
      `Queste migration non hanno la data nel nome e girerebbero PER ULTIME, dopo ogni migration futura: ${nuovi.join(", ")}`,
    ).toEqual([]);
  });

  it("i due file senza data sono ancora due, e sono quelli", () => {
    // Se uno dei due sparisce o cambia nome, l'elenco qui sopra va aggiornato
    // insieme -- altrimenti questo test difende una cosa che non esiste piu'.
    const senzaData = nomiSql().filter((nome) => !/^\d{8}/.test(nome));
    expect(new Set(senzaData)).toEqual(SENZA_DATA_CONOSCIUTI);
  });

  it("il file che gira per ultimo dice in cima che gira per ultimo", () => {
    // Chi lo apre fra sei mesi deve saperlo prima di toccarlo, non dopo.
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const sorgente = readFileSync(resolve(process.cwd(), CARTELLA, "rls_vehicles_policies.sql"), "utf8");
    expect(sorgente.slice(0, 400)).toContain("gira per ULTIMO");
  });

  it("due migration non possono avere lo stesso identificativo, tranne quelle di giugno", () => {
    // I file di giugno hanno identificativi ripetuti (20260627 compare piu'
    // volte) ed e' il motivo per cui non si usa la CLI di Supabase, che tiene
    // un quaderno e si ferma con "chiave duplicata". Per i file nuovi la data
    // e' al secondo: due che coincidono vuol dire che qualcuno ha copiato un
    // nome senza cambiarlo, e l'ordine fra i due sarebbe deciso dal titolo.
    const recenti = nomiSql()
      .filter((nome) => /^\d{14}_/.test(nome))
      .map((nome) => nome.slice(0, 14));
    const ripetuti = recenti.filter((id, i) => recenti.indexOf(id) !== i);
    expect(ripetuti, `identificativi ripetuti: ${[...new Set(ripetuti)].join(", ")}`).toEqual([]);
  });
});
