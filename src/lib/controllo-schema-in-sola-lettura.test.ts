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
   * Confronta tutte le famiglie. Toglierne una farebbe passare
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
      // I permessi colonna per colonna sono l'unica cosa che oggi impedisce
      // a una concessionaria di riscriversi il piano: la regola di accesso le
      // lascia aggiornare la propria riga, e solo l'elenco delle colonne
      // tiene fuori subscription_plan e subscription_status.
      "permessi_colonne",
      "indici",
    ]) {
      expect(script, `manca la famiglia "${famiglia}"`).toContain(`"${famiglia}"`);
    }
  });
});

/**
 * **Il guardiano deve vedere tutte e quattro le serrature di colonna.**
 *
 * Il difetto, trovato il 14/09/2026: l'inventario leggeva i permessi colonna
 * per colonna **solo** per INSERT e UPDATE. Ma su `vehicles` e `dealers` la
 * serratura che conta e' in **lettura**: sessantuno permessi di colonna
 * decidono cosa si vede con la sola chiave pubblica del sito, e tengono chiusi
 * la targa, il numero di telaio, il codice fiscale della concessionaria e il
 * piano del suo abbonamento. Nessuno dei sessantuno compariva nell'inventario,
 * e un `grant select (plate) on public.vehicles to anon` avrebbe aperto la
 * targa di ogni vettura lasciando **verde** il controllo settimanale.
 *
 * Misurato sulla produzione lo stesso giorno, interrogandola come farebbe un
 * estraneo: su `vehicles` 39 colonne leggibili su 46, su `dealers` 22 su 39.
 *
 * Questo test non guarda il database: guarda che la regola resti **scritta**
 * per intero. Serve al giorno in cui qualcuno, per far tornare un conteggio,
 * restringera' di nuovo l'elenco dei comandi sorvegliati.
 */
describe("l'inventario sorveglia i permessi di colonna in tutti i comandi", () => {
  const migrations = readFileSync(resolve(process.cwd(), "supabase/migrations/20260914020000_il_guardiano_vede_anche_la_lettura.sql"), "utf8");

  it("guarda SELECT, INSERT, UPDATE e REFERENCES, non solo la scrittura", () => {
    // Sono i quattro comandi che in PostgreSQL si possono concedere colonna
    // per colonna. DELETE no: quello vale sempre sull'intera riga.
    expect(migrations).toContain("acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')");
    expect(migrations, "l'elenco dei comandi sorvegliati e' stato ristretto").not.toContain(
      "acl.privilege_type in ('INSERT', 'UPDATE')",
    );
  });

  it("vede anche i permessi dati a chiunque, che non portano il nome di un ruolo", () => {
    // In `aclexplode` un permesso concesso a `public` ha beneficiario zero:
    // non corrisponde a nessun nome, e sfuggiva a tutte e due le famiglie dei
    // permessi. In questo progetto la risposta giusta e' sempre "nessuna riga".
    expect(migrations).toContain("'permessi_a_chiunque'");
    expect(migrations).toContain("acl.grantee = 0");
  });

  it("vede le viste, che nessuna famiglia guardava", () => {
    // Tutte le altre famiglie filtrano relkind = 'r', cioe' le sole tabelle
    // vere. Una vista non dichiarata `security_invoker` legge con i permessi
    // di chi l'ha creata, scavalcando le regole di chi la interroga.
    expect(migrations).toContain("'viste'");
    expect(migrations).toContain("c.relkind in ('v', 'm')");
  });

  it("il confronto guarda tutte le famiglie che l'inventario produce", () => {
    // Il difetto gemello, trovato lo stesso giorno: l'inventario ha imparato a
    // vedere due cose nuove e l'elenco delle famiglie confrontate era rimasto
    // a undici voci. Una famiglia fuori da quell'elenco non viene confrontata
    // da nessuno, e il riepilogo direbbe "nessuna differenza" su una serratura
    // che non ha nemmeno guardato.
    for (const famiglia of ["permessi_a_chiunque", "viste"]) {
      expect(script, `il confronto non guarda la famiglia ${famiglia}`).toContain(`"${famiglia}"`);
    }
    // E si ferma da solo se un domani ne comparisse una terza.
    expect(script).toContain("famiglieNonConfrontate");
  });

  it("il confronto si ferma se i due lati usano inventari diversi", () => {
    // Applicando la migration da un lato solo, la produzione risponde con
    // undici famiglie e i file con tredici: confrontarle produrrebbe
    // sessantuno differenze finte. Meglio fermarsi e dire cosa fare.
    expect(script).toContain("non usano la stessa versione di public.inventario_schema()");
  });

  it("l'inventario resta riservato al ruolo di servizio", () => {
    // A un estraneo direbbe com'e' fatta ogni serratura.
    expect(migrations).toContain("revoke all on function public.inventario_schema() from anon");
    expect(migrations).toContain("revoke all on function public.inventario_schema() from authenticated");
    expect(migrations).toContain("grant execute on function public.inventario_schema() to service_role");
  });
});
