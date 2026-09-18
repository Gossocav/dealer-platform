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

  it("un campo vuoto non prende nessun segno, e vuoto vuol dire anche una tabulazione", () => {
    // "Il sito non lo dice" non e' "il sito dice che non c'e'": e' la stessa
    // regola di `scriviDalSito`, che salta i valori vuoti.
    //
    // E `btrim` da solo non bastava: toglie lo spazio normale e lasciava
    // passare un campo fatto di una tabulazione o di un a capo, che dalle
    // pagine HTML arrivano piu' spesso di quanto sembri. Provato su Postgres:
    // una scheda con il colore uguale a una tabulazione riceveva il segno.
    expect(migration).toContain("where c.valore is not null");
    expect(migration).toContain("c.valore ~ ('[^[:space:]' || U&'\\00a0' || ']')");
  });

  it("salta le schede che il concessionario ha aperto e salvato", () => {
    // Prima del 15/09/2026 una modifica a mano non lasciava nessun segno:
    // su una scheda salvata in quella finestra il valore che c'e' oggi puo'
    // essere suo, e dichiararlo "dal tuo sito" sarebbe la provenienza
    // sbagliata. Chi ha salvato lascia traccia in audit_logs.
    expect(migration).toContain("a.action = 'vehicle.updated'");
    expect(migration).toContain("a.entity_type = 'vehicle'");
  });

  it("non tocca una riga a cui non avrebbe niente da scrivere", () => {
    // Scriverle un oggetto vuoto sarebbe un aggiornamento che non aggiorna
    // niente, e la farebbe ricomparire nel conto a ogni riesecuzione.
    expect(migration).toContain("d.segni is not null");
  });

  it("si ferma prima con una frase che si capisce, invece di inciampare in un trigger", () => {
    // `trg_enforce_plate_on_sold` scatta su qualunque aggiornamento di una
    // riga, anche su uno che non tocca targa ne' stato: una sola scheda
    // "venduta" senza targa fra quelle da segnare fermerebbe tutto con un
    // messaggio che parla di targhe mentre si scrive la provenienza.
    // Provato su Postgres 17: senza questo controllo l'errore e' quello del
    // trigger, con questo e' una frase che dice cosa fare.
    expect(migration).toContain("raise exception 'Fermato prima di cominciare");
    expect(migration).toContain("in ('sold', 'delivered')");
  });

  it("il riepilogo misura anche le due ipotesi, invece di lasciarle nel commento", () => {
    // "Immatricolazione piena e regime IVA sono vuoti su quelle righe" era
    // una misura fatta prima; adesso il titolare la rilegge da solo mentre
    // esegue, e se non torna se ne accorge.
    expect(migration).toContain("con_immatricolazione_piena");
    expect(migration).toContain("con_regime_iva");
  });

  it("un sito fatto di spazi non e' un sito", () => {
    // Ovunque altrove nel progetto "viene da un sito" si decide con btrim.
    expect(migration).toContain("btrim(v.import_source) <> ''");
  });

  it("il segno dice che e' stato ricostruito, non osservato", () => {
    // Un segno normale nasce mentre si legge il sito: si e' visto quel valore
    // arrivare. Qui il sito non si puo' piu' leggere e il segno e' dedotto da
    // quello che l'importazione aveva scritto. Tacerlo sarebbe buttare
    // un'informazione vera -- ed e' anche l'unico modo che il ritorno ha di
    // riconoscere le sue schede senza appoggiarsi a niente di esterno.
    expect(migration).toContain(
      "jsonb_build_object('fonte', 'sito', 'confermato_il', null, 'ricostruito_il', '2026-09-18')",
    );
    expect(migration, "una conferma inventata direbbe che il concessionario ha detto di si'").not.toContain(
      "il_sito_dice",
    );
  });

  it("e la libreria sa cosa vuol dire quel segno, invece di trovarselo addosso", () => {
    // La forma del segno e' di `provenienza-dati.ts` sola: una chiave che il
    // database scrive e il codice non conosce e' un contratto rotto di
    // nascosto.
    const libreria = readFileSync(resolve(process.cwd(), "src/lib/provenienza-dati.ts"), "utf8");
    expect(libreria).toContain("ricostruito_il?: string | null;");
    // E sparisce da solo quando la scheda viene riletta davvero: `scriviDalSito`
    // sostituisce il segno intero invece di aggiungerci qualcosa.
    expect(libreria).toContain("fonte: letto.fonte,");
  });

  it("tocca solo le schede sparite dal sito e ancora senza segno", () => {
    expect(migration).toContain("v.import_source is not null");
    expect(migration).toContain("v.import_missing_since is not null");
    // Senza questa riga, una rilettura futura riscriverebbe sopra segni veri.
    expect(migration).toContain("v.origine_dati = '{}'::jsonb");
  });

  it("il conteggio si legge davvero nell'editor SQL, perche' e' l'ultima istruzione", () => {
    // Il difetto: con la SELECT **dentro** la transazione, l'ultima istruzione
    // era `commit`, che non restituisce righe. L'editor di Supabase mostra
    // solo il risultato dell'ultima istruzione, quindi il titolare avrebbe
    // letto "Success. No rows returned" e non avrebbe mai visto i numeri che
    // aveva chiesto. Provato con node-postgres, la stessa libreria che sta
    // dietro quell'editor.
    const dopoIlCommit = migration.slice(migration.lastIndexOf("commit;") + "commit;".length);
    expect(dopoIlCommit).toContain("select");
    expect(dopoIlCommit).toContain("schede_segnate_da_questa_migration");
    expect(dopoIlCommit).toContain("campi_segnati");
    expect(dopoIlCommit).toContain("ancora_senza_provenienza");
    expect(ritorno.slice(ritorno.lastIndexOf("commit;") + "commit;".length)).toContain("select");
  });

  it("il ritorno riconosce le sue schede senza appoggiarsi a niente di esterno", () => {
    // **Due difetti, uno dietro l'altro, tutti e due trovati prima di
    // eseguire.**
    //
    // La prima versione riconosceva le schede dalla forma dei segni -- tutti
    // {"fonte":"sito","confermato_il":null} -- ma quella forma e' identica a
    // quella di una scheda segnata dal ripasso mentre era ancora sul sito e
    // sparita il giorno dopo. In produzione ce ne sono due, e una delle due
    // sarebbe stata svuotata.
    //
    // La seconda le distingueva da `vehicle_category`, che il ripasso segna
    // sempre. Funzionava, ma quello e' un difetto che va corretto: il giorno
    // della correzione il ritorno si sarebbe rotto **in silenzio**.
    //
    // Questa cerca `ricostruito_il`, che scrive solo quella migration.
    expect(ritorno).toContain("'ricostruito_il', '2026-09-18'");
    // Il controllo guarda **cio' che si esegue**, non i commenti: la storia
    // delle due versioni sbagliate sta scritta li' apposta, e nominare
    // `vehicle_category` per spiegare perche' non lo si usa piu' e' giusto.
    const eseguibile = ritorno
      .split("\n")
      .filter((riga) => !riga.trimStart().startsWith("--"))
      .join("\n");
    expect(eseguibile, "il ritorno dipende ancora da un difetto che va corretto").not.toContain("vehicle_category");
  });
});
