import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Il controllo settimanale dello schema **legge e basta**.
 *
 * E' la condizione posta dal titolare quando l'ha approvato, e non e' una
 * formalita': quel lavoro ha in mano la chiave di servizio, cioe' i permessi
 * piu' alti che esistano sul database. Un comando di scrittura infilato li'
 * dentro -- anche in buona fede, per "sistemare la deriva invece di
 * segnalarla" -- agirebbe sulla produzione senza che nessuno lo abbia
 * chiesto, di lunedi' mattina alle sette.
 */

const workflowIntero = readFileSync(resolve(process.cwd(), ".github/workflows/db-migrations.yml"), "utf8");

/**
 * Senza i commenti: il commento in cima **nomina** `db push` proprio per dire
 * che non c'e', e un test che leggesse anche quelli fallirebbe sulla frase
 * che spiega la regola invece che su una sua violazione.
 */
const workflow = workflowIntero.replace(/^\s*#.*$/gm, "");
const script = readFileSync(resolve(process.cwd(), "scripts/confronta-schema.mjs"), "utf8");

describe("il controllo dello schema non scrive niente", () => {
  it("il lavoro non esegue nessun comando che modifica il database", () => {
    for (const vietato of ["db push", "migration repair", "db reset", "migration up"]) {
      expect(workflow, `il controllo esegue "${vietato}"`).not.toContain(vietato);
    }
  });

  it("chiede a GitHub solo il permesso di leggere", () => {
    expect(workflow).toContain("permissions:\n  contents: read");
  });

  /**
   * Lo strumento parla con la produzione da un punto solo, e quello e' una
   * chiamata alla funzione che legge il catalogo. Se un domani comparisse una
   * scrittura, sarebbe qui.
   */
  it("verso la produzione fa una sola chiamata, e legge l'inventario", () => {
    const chiamate = script.match(/fetch\(/g) ?? [];
    expect(chiamate).toHaveLength(1);
    expect(script).toContain("/rest/v1/rpc/inventario_schema");
  });

  it("la funzione dell'inventario e' riservata al server", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260910160000_inventario_dello_schema.sql"),
      "utf8"
    );

    expect(migration).toContain("revoke all on function public.inventario_schema() from anon");
    expect(migration).toContain("revoke all on function public.inventario_schema() from authenticated");
    expect(migration).toContain("grant execute on function public.inventario_schema() to service_role");
  });

  /**
   * Confronta tutte e otto le famiglie. Toglierne una farebbe passare
   * inosservata proprio la categoria di differenze che quella famiglia
   * copre -- ed e' cosi' che le regole di accesso sono rimaste diverse per
   * settimane senza che nessuno se ne accorgesse.
   */
  it("confronta tutte le famiglie, comprese regole, permessi, vincoli e trigger", () => {
    for (const famiglia of [
      "tabelle", "colonne", "politiche", "permessi", "vincoli", "funzioni", "trigger",
      // Queste due sono nate da difetti veri: funzioni riservate rimaste
      // eseguibili con la chiave pubblica (05/09) e magazzini di fotografie
      // nati aperti in una ricostruzione.
      "permessi_funzioni", "politiche_storage",
      "indici",
    ]) {
      expect(script, `manca la famiglia "${famiglia}"`).toContain(`"${famiglia}"`);
    }
  });
});
