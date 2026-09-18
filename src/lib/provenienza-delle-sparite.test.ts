import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260918010000_la_provenienza_delle_auto_sparite_dal_sito.sql"),
  "utf8",
);
const ritorno = readFileSync(resolve(process.cwd(), "supabase/ritorni/20260918010000_ritorno.sql"), "utf8");
const sync = readFileSync(resolve(process.cwd(), "src/lib/dealer-site-sync.ts"), "utf8");

/**
 * **Cosa impedisce.** La migration del 18/09/2026 scrive la provenienza sulle
 * 58 schede sparite dal sito, che il ripasso non tocchera' mai piu' e che
 * altrimenti direbbero "provenienza non registrata" per sempre -- proprio
 * quelle che il concessionario apre per chiedersi che fine ha fatto un'auto.
 *
 * Una migration e' **storia**: una volta applicata non si cambia piu'. Quindi
 * questi test fissano le sue decisioni come erano quel giorno, con il perche'
 * di ognuna, e non si legano a cio' che il codice fara' domani. Se un campo
 * entrera' in `payloadDatiVeicolo` fra sei mesi, questa migration restera'
 * com'e' ed e' giusto cosi': non ha scritto quel campo perche' quel giorno
 * non esisteva.
 */
describe("la provenienza delle auto sparite dal sito", () => {
  /**
   * I ventuno campi scritti, fotografati il 18/09/2026: sono quelli di
   * `payloadDatiVeicolo` **meno** `vehicle_category`.
   */
  const CAMPI_SCRITTI = [
    "brand", "model", "version", "price", "mileage", "fuel", "transmission",
    "doors", "seats", "color", "body_type", "year", "registration_month",
    "vehicle_condition", "power_kw", "power_cv", "engine_size",
    "emission_class", "traction", "co2_emissions", "description",
  ];

  it("scrive tutti e soli i campi che l'importazione dal sito scriveva", () => {
    for (const campo of CAMPI_SCRITTI) {
      expect(migration, `manca ${campo}`).toContain(`('${campo}',`);
    }
    // Il conto totale: ne' uno in piu' ne' uno in meno.
    const scritti = [...migration.matchAll(/^\s+\('([a-z0-9_]+)',\s+v\./gm)].map((m) => m[1]);
    expect(scritti.sort()).toEqual([...CAMPI_SCRITTI].sort());
  });

  it("quel giorno erano esattamente quelli di payloadDatiVeicolo, tolto il tipo veicolo", () => {
    // Non e' un vincolo per il futuro, e' la prova che la fotografia era
    // giusta: se questo test cade perche' payloadDatiVeicolo e' cambiato, la
    // migration non si tocca -- si aggiorna il commento qui sotto con la data.
    const payload = sync.slice(sync.indexOf("export function payloadDatiVeicolo"));
    const nelPayload = [...payload.slice(0, payload.indexOf("\n}")).matchAll(/^\s{4}([a-z0-9_]+):/gm)].map((m) => m[1]);
    expect(nelPayload.filter((c) => c !== "vehicle_category").sort()).toEqual([...CAMPI_SCRITTI].sort());
  });

  it("non inventa la provenienza del tipo veicolo, che dal sito non arriva", () => {
    // `payloadDatiVeicolo` lo scrive come la costante "Auto": segnarlo "dal
    // tuo sito" sarebbe la provenienza sbagliata, peggio di nessuna.
    expect(migration).not.toContain("('vehicle_category',");
    expect(sync, "se il tipo veicolo smettesse di essere una costante, questa scelta andrebbe rifatta").toContain(
      'vehicle_category: "Auto"',
    );
  });

  it("non inventa i campi del blocco ricco, che quell'importazione non conosceva", () => {
    // Immatricolazione piena e regime IVA arrivano dal blocco ricco, che
    // esiste dal 15/09/2026: le righe sparite prima non li hanno mai avuti.
    expect(migration).not.toContain("('registration_date',");
    expect(migration).not.toContain("('vat_regime',");
  });

  it("un campo vuoto non prende nessun segno", () => {
    // "Il sito non lo dice" non e' "il sito dice che non c'e'": e' la stessa
    // regola di `scriviDalSito`, che salta i valori vuoti.
    expect(migration).toContain("where c.valore is not null");
    expect(migration).toContain("btrim(c.valore) <> ''");
  });

  it("il segno e' quello di una scheda viva appena letta: nessuna conferma, nessun disaccordo", () => {
    expect(migration).toContain("jsonb_build_object('fonte', 'sito', 'confermato_il', null)");
    expect(migration, "una conferma inventata direbbe che il concessionario ha detto di si'").not.toContain(
      "il_sito_dice",
    );
  });

  it("tocca solo le schede sparite dal sito e ancora senza segno", () => {
    expect(migration).toContain("v.import_source is not null");
    expect(migration).toContain("v.import_missing_since is not null");
    // Senza questa riga, una rilettura futura riscriverebbe sopra segni veri.
    expect(migration).toContain("v.origine_dati = '{}'::jsonb");
  });

  it("dice quante righe ha toccato, invece di lasciarlo indovinare", () => {
    expect(migration).toContain("schede_aggiornate");
    expect(migration).toContain("campi_segnati");
  });

  it("il ritorno cancella solo cio' che questa migration ha scritto", () => {
    // Un ritorno che cancella anche i segni di una rilettura futura sarebbe
    // peggio del difetto che voleva annullare.
    expect(ritorno).toContain("jsonb_build_object('fonte', 'sito', 'confermato_il', null)");
    expect(ritorno).toContain("v.import_missing_since is not null");
    expect(ritorno).toContain("not exists");
  });
});
