import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260822000000_isolamento_tenant_rls.sql"),
  "utf8"
);

// 22/08/2026, prima prova con due concessionarie: la seconda vedeva i dati
// della prima. La causa non era il codice ma il database -- la protezione per
// riga non era accesa, e con la sola chiave pubblica del sito si leggevano
// lead, clienti, veicoli non pubblicati, fotografie, profili.
//
// Questi controlli leggono il testo della migration: dicono che la regola e'
// scritta, non che il database la applichi. La prova vera e' stata fatta su un
// Postgres in Docker, con due concessionarie e tre ruoli -- e va rifatta cosi'
// ogni volta che queste regole cambiano.
describe("isolamento fra concessionarie", () => {
  const TABELLE_DA_PROTEGGERE = [
    "vehicles",
    "vehicle_images",
    "dealers",
    "leads",
    "profiles",
    "customers",
    "appointments",
    "notifications",
    "email_messages",
    "email_threads",
    "lead_activities",
    "import_runs",
  ];

  it.each(TABELLE_DA_PROTEGGERE)("accende la protezione per riga su %s", (tabella) => {
    const acceseEsplicitamente = migration.includes(`alter table public.${tabella} enable row level security`);
    const nelCiclo = new RegExp(`'${tabella}'`).test(migration);

    expect(acceseEsplicitamente || nelCiclo, `${tabella} resterebbe senza protezione`).toBe(true);
  });

  // Il punto che ha causato il guaio: senza questa riga la politica esiste ma
  // non viene nemmeno consultata.
  it("accende la protezione, non si limita a scrivere le politiche", () => {
    expect(migration).toContain("enable row level security");
  });

  it("cancella le politiche esistenti prima di installare le proprie", () => {
    // Senza questo, una politica permissiva rimasta in giro terrebbe la porta
    // aperta accanto a quelle nuove.
    expect(migration).toContain("drop policy if exists %I on public.%I");
  });

  it("lega ogni lettura alla concessionaria dell'utente", () => {
    expect(migration).toContain("dealer_id = public.current_dealer_id()");
  });

  // Il marketplace legge sempre senza sessione (publicSupabase): il permesso
  // pubblico vale per "anon". Darlo anche a "authenticated" rimetterebbe in
  // circolo i veicoli altrui dentro il gestionale.
  it("il permesso pubblico non vale per chi ha fatto login", () => {
    const letturePubbliche = migration.match(/create policy \w+_lettura_pubblica[\s\S]*?using \(/g) ?? [];

    expect(letturePubbliche.length).toBeGreaterThanOrEqual(3);
    for (const politica of letturePubbliche) {
      expect(politica, politica.slice(0, 60)).toMatch(/to anon\s*\n/);
      expect(politica).not.toMatch(/to anon, authenticated/);
    }
  });

  it("al pubblico mostra solo i veicoli pubblicati di concessionarie attive", () => {
    expect(migration).toContain("coalesce(published, false)");
    expect(migration).toContain("lower(coalesce(status, '')) = 'published'");
    expect(migration).toContain("in ('approved', 'active')");
  });

  // Il modulo "richiedi informazioni" scrive senza login: e' voluto. Leggere
  // no -- li' ci sono nome, email e telefono di una persona.
  it("lascia scrivere una richiesta dal marketplace, ma non leggerne nessuna", () => {
    expect(migration).toContain("create policy leads_inserimento_marketplace");
    expect(migration).toMatch(/leads_inserimento_marketplace[\s\S]*?to anon, authenticated/);
    expect(migration).toMatch(/create policy leads_lettura_propria[\s\S]*?to authenticated/);
    expect(migration).not.toMatch(/create policy leads_lettura_pubblica/);
  });

  it("i profili si leggono solo per se stessi", () => {
    expect(migration).toMatch(/create policy profiles_lettura_propria[\s\S]*?using \(id = auth\.uid\(\)\)/);
  });

  it("non tocca le tabelle gia' protette", () => {
    for (const intoccabile of ["dealer_users", "dealer_demo_subscriptions", "audit_logs"]) {
      expect(migration).not.toContain(`alter table public.${intoccabile} enable row level security`);
    }
  });
});
