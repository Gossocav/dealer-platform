import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Lo schema e' la somma delle migration: la prima chiude il conto economico
// ai piani inferiori, la seconda chiude la porta che quella aveva lasciato
// aperta. Leggerne una sola direbbe una verita' vecchia.
const MIGRATIONS = [
  "supabase/migrations/20260901020000_conto_economico_solo_dai_piani_superiori.sql",
  "supabase/migrations/20260901040000_piano_non_leggibile_dagli_altri.sql",
];
const sql = MIGRATIONS.map((percorso) => readFileSync(resolve(process.cwd(), percorso), "utf8")).join("\n");
const correzione = readFileSync(resolve(process.cwd(), MIGRATIONS[1]), "utf8");

/**
 * La seconda serratura del conto economico.
 *
 * Le schermate lo nascondono gia' a chi ha il Base, e per il concessionario e'
 * abbastanza. Ma il marketplace parla al database con la chiave pubblica del
 * sito, visibile a chiunque apra la pagina: chi sapesse come si fa potrebbe
 * leggere e scrivere i propri conti con la sola sessione del suo account,
 * senza passare da nessuna schermata. Nascondere un bottone non e' impedire.
 *
 * **Questi test leggono il testo del file, quindi dicono che la regola e'
 * scritta -- non che il database la applichi.** La prova vera si e' fatta su
 * un Postgres vero prima di spedire, ricostruendo lo schema dalle migration:
 *
 *   piano base   -> legge 0 conti, insert rifiutato, update 0 righe
 *   piano elite  -> legge il suo, update 1 riga
 *   il conto scritto dal base resta nella tabella, intatto (9000,00)
 *   la colonna vecchia diceva "base" a una concessionaria convertita a elite,
 *     e la funzione ha risposto "elite": e' il caso che manda fuori strada
 */
describe("il conto economico e' chiuso anche nel database", () => {
  it("il piano si ricava con la stessa precedenza dell'applicazione", () => {
    // Prima il piano a cui la demo e' stata convertita, poi il profilo demo,
    // e solo per ultima la colonna vecchia -- che dice "base" anche a chi ha
    // attivato l'Elite.
    expect(sql).toContain("converted_plan_code");
    expect(sql).toContain("demo_profile_code");
    expect(sql).toContain("subscription_plan");
    const funzione = sql.slice(sql.indexOf("function public.dealer_plan_in_force"), sql.indexOf("dealer_has_conto_economico"));
    expect(funzione.indexOf("converted_plan_code")).toBeLessThan(funzione.indexOf("subscription_plan") + funzione.length);
  });

  it("apre solo dal Pro in su", () => {
    expect(sql).toContain("in ('pro', 'elite')");
  });

  // Un piano che non si riconosce -- o che non c'e' affatto -- non apre la
  // porta. Stessa regola dell'applicazione, stessa ragione: negarla a chi ne
  // ha diritto si scopre subito, regalarla non lo dice nessuno.
  it("senza piano non apre niente", () => {
    expect(sql).toContain("coalesce(public.dealer_plan_in_force(p_dealer_id) in ('pro', 'elite'), false)");
  });

  it("il piano si aggiunge all'isolamento fra concessionarie, non lo sostituisce", () => {
    // Si guardano le politiche in vigore, cioe' quelle dell'ultima migration
    // che le rifa': le precedenti sono state sostituite.
    const politiche = correzione.slice(correzione.indexOf("create policy vehicle_economics_select_own"));
    const condizioni = politiche.match(/dealer_id = public\.current_dealer_id\(\)/g) ?? [];
    const piani = politiche.match(/public\.current_dealer_has_conto_economico\(\)/g) ?? [];
    // Quattro politiche, e l'update ne ha due (using e with check): sei
    // condizioni per parte, e sempre in coppia.
    expect(condizioni.length).toBeGreaterThanOrEqual(4);
    expect(piani.length).toBe(condizioni.length);
  });

  it("vale su tutte e quattro le operazioni, non solo sulla lettura", () => {
    for (const politica of ["select", "insert", "update", "delete"]) {
      expect(sql, `manca la politica di ${politica}`).toContain(`vehicle_economics_${politica}_own`);
    }
  });

  // Un dato del cliente non si butta perche' e' cambiato il piano: diventa
  // illeggibile per lui, e torna visibile il giorno che risale di piano.
  it("non cancella nessun conto gia' scritto", () => {
    expect(sql).not.toMatch(/delete\s+from\s+public\.vehicle_economics/i);
    expect(sql).not.toMatch(/truncate/i);
    expect(sql).not.toMatch(/drop\s+table/i);
  });

  it("le funzioni non si espongono al pubblico", () => {
    expect(sql).toContain("revoke all on function public.dealer_plan_in_force(uuid) from public");
    expect(sql).toContain("revoke all on function public.dealer_has_conto_economico(uuid) from public");
    // `anon` non compare fra chi puo' eseguirle: il marketplace non ha
    // nessuna ragione di sapere che piano ha una concessionaria.
    const grant = sql.slice(sql.indexOf("grant execute on function public.dealer_plan_in_force"));
    expect(grant.slice(0, 200)).not.toContain("anon");
  });

  it("sta tutta dentro una transazione: o entra intera, o non entra", () => {
    // Il file si apre con la spiegazione del perche', poi la transazione: si
    // guarda che nessuna istruzione stia fuori, non che la prima riga sia
    // "begin".
    const apertura = sql.indexOf("\nbegin;");
    expect(apertura, "manca begin;").toBeGreaterThan(-1);
    expect(apertura, "c'e' un'istruzione prima di begin;").toBeLessThan(sql.indexOf("create or replace function"));
    expect(sql.trimEnd().endsWith("commit;"), "non si chiude con commit;").toBe(true);
  });
});

// L'applicazione e il database devono dire la stessa cosa: se la soglia
// cambiasse da una parte sola, una schermata mostrerebbe comandi che il
// database poi rifiuta -- e il concessionario vedrebbe un errore invece di
// una spiegazione.
describe("la soglia e' la stessa nell'applicazione e nel database", () => {
  it("il codice apre il conto economico dal Pro, come il database", () => {
    const modulo = readFileSync(resolve(process.cwd(), "src/lib/funzioni-per-piano.ts"), "utf8");
    expect(modulo).toContain('"conto-economico": "pro"');
    expect(sql).toContain("in ('pro', 'elite')");
  });
});

/**
 * Il difetto trovato in revisione il 01/09/2026, provato su un Postgres vero
 * prima e dopo la correzione: `dealer_plan_in_force(uuid)` era eseguibile da
 * chiunque avesse una sessione, per **qualunque** concessionaria. Una Base ha
 * chiesto il piano di un'altra e ha ottenuto "elite".
 *
 * L'identificativo di una concessionaria e' pubblico -- sta fra le colonne che
 * il marketplace legge -- quindi bastava una sessione per sapere il piano di
 * ogni concorrente. Questo progetto tiene `subscription_plan` fuori
 * dall'elenco pubblico proprio perche' e' il listino clienti.
 */
describe("il piano di una concessionaria non e' affare delle altre", () => {
  it("la funzione che le politiche chiamano non accetta un identificativo", () => {
    expect(correzione).toContain("function public.current_dealer_has_conto_economico()");
    expect(correzione).toContain("public.dealer_plan_in_force(public.current_dealer_id())");
  });

  it("quella che accetta un identificativo non e' piu' eseguibile con una sessione", () => {
    expect(correzione).toContain("revoke all on function public.dealer_plan_in_force(uuid) from authenticated");
    expect(correzione).toContain("grant execute on function public.dealer_plan_in_force(uuid) to service_role");
  });

  it("e quella che rispondeva su una concessionaria qualunque non esiste piu'", () => {
    expect(correzione).toContain("drop function if exists public.dealer_has_conto_economico(uuid)");
  });

  // Provato su Postgres vero, con lo schema ricostruito dalle migration:
  //   prima  -> select dealer_plan_in_force('<altra>') restituiva "elite"
  //   dopo   -> ERROR: permission denied for function dealer_plan_in_force
  //   e la serratura continua a funzionare: base legge 0, elite legge il suo,
  //   elite scrive 1 riga, base 0, e il conto della base resta intatto.
  it("la nuova funzione resta eseguibile da chi ha una sessione, altrimenti le politiche non funzionerebbero", () => {
    // Le politiche per riga si valutano con i privilegi di chi interroga:
    // togliere anche questo permesso chiuderebbe il conto economico a tutti.
    expect(correzione).toContain("grant execute on function public.current_dealer_has_conto_economico() to authenticated");
  });
});
