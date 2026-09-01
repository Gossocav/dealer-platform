import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/20260901020000_conto_economico_solo_dai_piani_superiori.sql";
const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");

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
    const politiche = sql.slice(sql.indexOf("create policy vehicle_economics_select_own"));
    const condizioni = politiche.match(/dealer_id = public\.current_dealer_id\(\)/g) ?? [];
    const piani = politiche.match(/public\.dealer_has_conto_economico\(dealer_id\)/g) ?? [];
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
