import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = read("supabase/migrations/20260728010000_demo_requests_interested_plan.sql");
const form = read("src/app/(marketplace)/demo/page.tsx");
const publicApi = read("src/app/api/demo/request/route.ts");
const adminApi = read("src/app/api/admin/demo-requests/route.ts");
const adminPage = read("src/app/admin/demo-requests/page.tsx");

const PLAN_PAGES = [
  ["base", "src/app/(marketplace)/registrazione/base/page.tsx"],
  ["pro", "src/app/(marketplace)/registrazione/pro/page.tsx"],
  ["elite", "src/app/(marketplace)/registrazione/elite/page.tsx"],
] as const;

describe("interested plan migration", () => {
  it("adds the column without demanding a value", () => {
    expect(migration).toMatch(/add column if not exists interested_plan_code text;/);
    expect(migration).not.toMatch(/interested_plan_code text not null/);
  });

  it("accepts only the three plan codes, or nothing", () => {
    expect(migration).toMatch(
      /check \(interested_plan_code is null or interested_plan_code in \('base', 'pro', 'elite'\)\)/,
    );
  });

  it("can be run twice", () => {
    expect(migration).toMatch(/if not exists \(\s*select 1\s*from pg_constraint/);
  });
});

describe("the demo form asks for the plan", () => {
  it("offers the three plans plus an undecided option", () => {
    expect(form).toContain('<option value="">Non ho ancora deciso</option>');
    for (const [plan] of PLAN_PAGES) {
      expect(form).toContain(`<option value="${plan}">`);
    }
  });

  // Obbligarlo farebbe abbandonare il modulo all'ultimo passo, e chi arriva
  // dalla pagina Demo generica non ha nessun piano da indicare.
  it("keeps it optional", () => {
    expect(form).toMatch(/"websiteTrap" \| "interestedPlanCode"/);
    expect(form).not.toMatch(/interestedPlanCode: [123],/);
  });

  it("prefills it from the plan the visitor came from", () => {
    expect(form).toContain('normalizeInterestedPlan(searchParams.get("piano"))');
    expect(form).toMatch(/normalized === "base" \|\| normalized === "pro" \|\| normalized === "elite"/);
  });

  it("wraps the page in Suspense, as useSearchParams requires", () => {
    expect(form).toContain("<Suspense");
    expect(form).toContain("<DemoRequestPage />");
  });

  it("sends it with the rest of the form", () => {
    expect(form).toContain('formData.set("interestedPlanCode", values.interestedPlanCode)');
  });
});

describe("plan pages carry the choice into the form", () => {
  it.each(PLAN_PAGES)("the %s page links to the prefilled form", (plan, path) => {
    expect(read(path)).toContain(`href="/demo?piano=${plan}"`);
  });

  it("leaves the generic entry page without a plan", () => {
    // Chi arriva da li' sta ancora scegliendo: precompilare sarebbe una
    // risposta messa in bocca.
    expect(read("src/app/(marketplace)/registrazione/page.tsx")).toContain('href="/demo"');
  });
});

describe("the request stores the plan safely", () => {
  it("accepts only the known codes", () => {
    expect(publicApi).toMatch(/\["base", "pro", "elite"\]\.includes\(rawPlan\) \? rawPlan : null/);
  });

  it("writes it only when the column exists and a plan was chosen", () => {
    // Stesso schema difensivo degli altri campi: la tabella di produzione
    // puo' non avere ancora la colonna.
    expect(publicApi).toMatch(/hasColumn\("interested_plan_code"\) && interestedPlanCode/);
  });
});

describe("the admin panel shows the plan", () => {
  it("carries it through the API", () => {
    expect(adminApi).toMatch(/interested_plan_code: normalizeText\(raw\.interested_plan_code\)/);
  });

  // L'elenco non e' piu' una tabella da quindici colonne ma una scheda per
  // richiesta: il piano si legge in chiaro sotto il nome dell'azienda.
  it("lo mostra in chiaro, e dice quando manca", () => {
    expect(adminPage).toContain("Piano di interesse: {getPlanLabel(request.interested_plan_code)}");
    expect(adminPage).toContain("Nessun piano indicato");
  });

  // Il piano chiesto nel modulo e quello davvero attivato sono due cose
  // diverse: prima si vedeva solo il primo, quindi dopo la conversione non
  // si sapeva piu' cosa fosse in vigore.
  it("dopo la conversione mostra il piano attivo, non quello chiesto", () => {
    expect(adminPage).toContain("Piano attivo:");
    expect(adminPage).toContain("request.active_plan_code");
    expect(adminApi).toContain("active_plan_code: resolveActivePlanCode({");
  });

  it("dice anche quando non c'e' nessuna richiesta", () => {
    expect(adminPage).toContain("Nessuna richiesta demo al momento.");
  });
});
