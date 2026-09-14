import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { leadStages } from "@/lib/leads";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914130000_le_notifiche_dicono_la_verita_e_non_allagano.sql"),
  "utf8",
);
const campanella = readFileSync(resolve(process.cwd(), "src/components/notification-bell.tsx"), "utf8");

/**
 * Senza i commenti: la migration **cita** la vecchia condizione per spiegare
 * cosa c'era che non andava, e un test che leggesse anche quelli fallirebbe
 * sulla frase che racconta il difetto invece che su una sua ricomparsa.
 */
const migrationSenzaCommenti = migration
  .split("\n")
  .filter((riga) => !riga.trimStart().startsWith("--"))
  .join("\n");

/**
 * Tre difetti trovati il 14/09/2026 leggendo il testo delle funzioni in
 * produzione, e corretti. Questi test non provano che il database faccia la
 * cosa giusta -- quello e' stato verificato su Postgres 17 in Docker, caso per
 * caso -- ma che le decisioni restino scritte.
 */
describe("le notifiche dicono la verita'", () => {
  it("cerca i contatti con lo stato che il gestionale usa davvero", () => {
    // Il difetto: cercava `status = 'created'`, che e' il vecchio nome
    // inglese. Gli stati di questo progetto sono italiani, e
    // `leads_status_check` -- in produzione -- ammette SOLO quei sei: scrivere
    // 'created' viene rifiutato dal database. Meta' della funzione non trovava
    // quindi mai niente, e l'avviso "Lead non contattato da 24 ore" non e' mai
    // arrivato a nessuno.
    expect(leadStages).toContain("nuovo");
    expect(leadStages).not.toContain("created");
    expect(migration).toContain("coalesce(lower(l.status), 'nuovo') = 'nuovo'");
    expect(migrationSenzaCommenti, "e' tornato a cercare lo stato inglese").not.toContain("'created'");
  });

  it("non chiama piu' bozze le auto che il tetto del piano tiene fuori", () => {
    // Il difetto: annunciava "Veicolo in bozza da oltre 7 giorni" per ogni
    // vettura non pubblicata, comprese le 76 in `in_review` che il tetto del
    // piano aveva messo da parte. Il concessionario leggeva di avere 76 bozze
    // dimenticate quando aveva 76 auto che il piano non gli permetteva di
    // pubblicare.
    expect(migration).toContain("coalesce(lower(v.status), 'draft') = 'draft'");
    expect(migration).toContain("'in_review'");
    // E il numero del piano si chiede al database, mai scritto nel codice.
    expect(migration).toContain("public.resolve_dealer_listing_cap(v_dealer_id)");
    expect(migration).toContain("'Il tuo piano include '");
  });

  it("una sincronizzazione produce una notifica, non una per auto", () => {
    // 140 auto importate producevano 140 notifiche: delle 411 in produzione,
    // 373 erano "vehicle_new". Ora si raggruppano per sito e per giorno, e il
    // contatore sta in una colonna invece che dentro il messaggio.
    expect(migration).toContain("'vehicle_import'");
    expect(migration).toContain("add column if not exists conteggio");
    expect(migration).toContain("conteggio = public.notifications.conteggio + 1");
  });

  it("un'auto inserita a mano non produce nessuna notifica", () => {
    // Annunciare al concessionario una cosa che ha appena fatto lui non e' un
    // avviso, e' rumore.
    expect(migration).toContain("if new.import_source is null or btrim(new.import_source) = '' then");
  });

  it("i tipi nuovi sono ammessi dal vincolo del database", () => {
    // Trovato provando la migration su Postgres vero: `notifications_type_check`
    // elenca i tipi ammessi, e i due nuovi non c'erano -- l'inserimento veniva
    // rifiutato. Sarebbe fallita a meta' nell'editor SQL del titolare.
    expect(migration).toContain("drop constraint if exists notifications_type_check");
    for (const tipo of ["'vehicle_import'::text", "'piano_pieno'::text", "'vehicle_new'::text"]) {
      expect(migration, `il vincolo non ammette ${tipo}`).toContain(tipo);
    }
  });
});

describe("la campanella conta e non mente", () => {
  it("chiede il conteggio al database invece di contare le venti caricate", () => {
    // Il difetto: `items` ne carica venti, e il conteggio si faceva su quelle.
    // Con 373 non lette il pallino non poteva superare 20, e il codice che
    // scriveva "99+" non e' mai stato raggiunto.
    expect(campanella).toContain('count: "exact", head: true');
    expect(campanella).toContain('.eq("read", false)');
    expect(campanella, "il conteggio torna a farsi sulle righe caricate").not.toContain(
      "items.filter((item) => !item.read).length",
    );
  });

  it("un guasto non diventa 'nessuna notifica'", () => {
    // Regola 2 di AGENTS.md: un elenco vuoto e un errore non sono la stessa
    // cosa. Prima la lettura fallita usciva in silenzio e la tendina mostrava
    // "Nessuna notifica disponibile", che vuol dire "non c'e' niente".
    expect(campanella).toContain("setGuasto(true)");
    expect(campanella).toContain("Non sono riuscito a leggere le notifiche");
    expect(campanella).toContain("!guasto && items.length === 0");
  });

  it("se il conteggio non riesce resta ignoto, non zero", () => {
    // Zero vorrebbe dire "nessuna non letta": un'altra cosa.
    expect(campanella).toContain("erroreConteggio ? null : count ?? 0");
  });

  it("segna come lette tutte, non solo le venti mostrate", () => {
    // Con 373 non lette il pulsante ne segnava venti e il pallino restava
    // acceso, senza che si capisse perche'.
    expect(campanella).not.toContain('.in("id", unreadIds)');
    expect(campanella).toContain('.update({ read: true })');
  });
});
