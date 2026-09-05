import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Ogni funzione del database deve dire che cosa fa con la chiave pubblica.
 *
 * **Quale difetto impedisce.** Il 05/09/2026, provando la produzione con la
 * sola chiave pubblica del sito, sette funzioni rispondevano. Fra queste
 * `notify_dealer_users`, che scrive avvisi nel pannello di *qualunque*
 * concessionaria con titolo e testo scelti da chi chiama, e
 * `dealer_plan_in_force`, che restituiva "elite" per una concessionaria vera:
 * l'elenco di chi paga quale piano, a disposizione di chiunque apra gli
 * strumenti del browser.
 *
 * **Perche' era successo.** Le migration scrivevano
 *
 *     revoke all on function public.dealer_plan_in_force(uuid) from public;
 *
 * che sembra "togli a tutti" e non lo e': Postgres concede `execute` a
 * `public` su ogni funzione nuova, Supabase concede in piu' ad `anon`, e
 * `anon` resta dentro per tutte e due le strade. La stessa riga sbagliata e'
 * comparsa in sei migration diverse nell'arco di due mesi, senza che nulla si
 * lamentasse: una revoca che non revoca restituisce "REVOKE" e va avanti.
 *
 * **Perche' il presidio sta qui e non nel database.** La strada naturale --
 * `alter default privileges ... revoke execute on functions from public` --
 * su Postgres 15 viene accettata e non viene registrata: misurato in Docker,
 * `pg_default_acl` resta senza traccia della revoca e la funzione creata
 * subito dopo nasce eseguibile da chiunque. Il database non sa proteggersi da
 * solo su questo punto, quindi il controllo va fatto prima, sul testo, dove
 * fallisce davanti a chi sta ancora scrivendo la migration.
 *
 * Questo test **non prova che il database sia chiuso**: prova che nessuno ha
 * dimenticato di deciderlo. La chiusura vera l'ha applicata
 * 20260905160000_chiave_pubblica_solo_la_vetrina.sql, verificata su un
 * Postgres 15 con i ruoli e i privilegi predefiniti di Supabase ricostruiti.
 */

const CARTELLA = resolve(process.cwd(), "supabase/migrations");

const migrazioni = readdirSync(CARTELLA)
  .filter((nome) => nome.endsWith(".sql"))
  .sort()
  .map((nome) => ({ nome, sql: readFileSync(resolve(CARTELLA, nome), "utf8") }));

const tutto = migrazioni.map((m) => m.sql).join("\n");

/** Le funzioni create, con il file in cui compaiono e se restituiscono trigger. */
function funzioniCreate() {
  const creazioni = new Map<string, { file: string; trigger: boolean }>();
  const espressione = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(/gi;

  for (const { nome, sql } of migrazioni) {
    for (const trovato of sql.matchAll(espressione)) {
      const nomeFunzione = trovato[1].toLowerCase();
      // La clausola "returns" segue gli argomenti: guardarla nei seicento
      // caratteri successivi basta e avanza, e non richiede di sapere contare
      // le parentesi dentro i tipi.
      const finestra = sql.slice(trovato.index, trovato.index + 600);
      const trigger = /returns\s+trigger/i.test(finestra);

      // L'ultima definizione vince, come nel database.
      creazioni.set(nomeFunzione, { file: nome, trigger });
    }
  }

  return creazioni;
}

/** Le funzioni eliminate: una funzione che non esiste non ha permessi. */
function funzioniEliminate() {
  const eliminate = new Set<string>();

  for (const trovato of tutto.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?public\.([a-z0-9_]+)/gi)) {
    eliminate.add(trovato[1].toLowerCase());
  }

  return eliminate;
}

/**
 * Esiste una riga di permessi che nomina insieme questa funzione e `anon`?
 *
 * Vale sia un `revoke` sia un `grant`: il punto non e' quale delle due, e'
 * che qualcuno abbia deciso. `elite_showcase_dealer_ids` e' concessa ad
 * `anon` di proposito -- la vetrina Elite in home la legge senza sessione --
 * ed e' giusto che passi.
 */
function dichiaraCosaFaConAnon(nomeFunzione: string) {
  const espressione = new RegExp(
    `(?:revoke|grant)[^;]*\\bon\\s+function\\s+public\\.${nomeFunzione}\\s*\\([^;]*\\banon\\b`,
    "is",
  );

  return espressione.test(tutto);
}

describe("le funzioni del database dichiarano cosa fanno con la chiave pubblica", () => {
  it("trova le migration da controllare", () => {
    // Se il percorso cambiasse, un test che non legge niente passerebbe
    // sempre, ed e' il modo piu' silenzioso di perdere un presidio.
    expect(migrazioni.length).toBeGreaterThan(50);
  });

  it("ogni funzione richiamabile nomina anon in un revoke o in un grant", () => {
    const create = funzioniCreate();
    const eliminate = funzioniEliminate();

    const scoperte = [...create.entries()]
      .filter(([nome, { trigger }]) => {
        // Le funzioni trigger non sono richiamabili da fuori: PostgREST non le
        // pubblica, e non si eseguono con una richiesta.
        if (trigger) return false;
        // Una funzione eliminata non e' una porta aperta.
        if (eliminate.has(nome)) return false;
        return true;
      })
      .filter(([nome]) => !dichiaraCosaFaConAnon(nome))
      .map(([nome, { file }]) => `${nome}  (creata in ${file})`);

    expect(
      scoperte,
      [
        "Queste funzioni non dicono cosa fanno con la chiave pubblica del sito.",
        "",
        "Nella migration che le crea aggiungere, secondo il caso:",
        "",
        "  revoke all on function public.<nome>(<argomenti>) from public;",
        "  revoke all on function public.<nome>(<argomenti>) from anon;",
        "  grant execute on function public.<nome>(<argomenti>) to service_role;",
        "",
        "oppure, se deve davvero essere pubblica:",
        "",
        "  grant execute on function public.<nome>(<argomenti>) to anon;",
        "",
        "Nominare `anon` non e' pignoleria: `from public` da solo NON chiude,",
        "perche' Supabase concede ad anon per una strada separata.",
        "",
      ].join("\n"),
    ).toEqual([]);
  });

  it("le funzioni trovate aperte il 05/09/2026 sono ora chiuse ad anon", () => {
    // Le sette misurate in produzione quel giorno. Elencate per nome perche'
    // una regola generale che smettesse di funzionare passerebbe inosservata,
    // mentre queste sette sono il caso reale da cui e' nato tutto.
    const chiusura = readFileSync(
      resolve(CARTELLA, "20260905160000_chiave_pubblica_solo_la_vetrina.sql"),
      "utf8",
    );

    for (const nome of [
      "notify_dealer_users",
      "resolve_dealer_listing_cap",
      "dealer_plan_in_force",
      "current_dealer_id",
      "current_dealer_has_conto_economico",
      "current_dealer_has_perizie",
      "sync_stale_notifications",
    ]) {
      expect(chiusura, `manca la revoca ad anon per ${nome}`).toMatch(
        new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${nome}\\s*\\([^)]*\\)\\s+from\\s+anon`, "i"),
      );
    }
  });

  it("la vetrina Elite resta leggibile senza sessione", () => {
    // Il marketplace la chiama senza login: se qualcuno la chiudesse per
    // simmetria con le altre, la home perderebbe la vetrina e il video
    // sparirebbe dagli annunci, senza nessun errore visibile.
    expect(tutto).toMatch(/grant\s+execute\s+on\s+function\s+public\.elite_showcase_dealer_ids\(\)\s+to[^;]*anon/i);
  });
});
