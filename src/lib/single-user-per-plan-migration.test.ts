import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationFileName = "20260727000000_single_user_per_plan.sql";
const migrationSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationFileName),
  "utf8",
);

const planCodes = ["base", "pro", "elite"] as const;

function limitsFor(code: (typeof planCodes)[number]) {
  const match = migrationSql.match(
    new RegExp(`when '${code}' then '(\\{"max_users".*?\\})'::jsonb`),
  );
  expect(match, `limits snapshot for ${code} not found`).not.toBeNull();
  return JSON.parse(match![1]) as Record<string, unknown>;
}

function modulesFor(code: (typeof planCodes)[number]) {
  const match = migrationSql.match(
    new RegExp(`when '${code}' then '(\\{"dashboard".*?\\})'::jsonb`),
  );
  expect(match, `modules snapshot for ${code} not found`).not.toBeNull();
  return JSON.parse(match![1]) as Record<string, unknown>;
}

describe("single user per plan migration", () => {
  it("caps every plan at one user", () => {
    for (const code of planCodes) {
      expect(limitsFor(code).max_users, `${code} must allow a single user`).toBe(1);
    }
  });

  it("disables user creation on every plan", () => {
    for (const code of planCodes) {
      expect(limitsFor(code).can_create_users, `${code} must not create users`).toBe(false);
    }
  });

  it("keeps the other per-plan limits untouched", () => {
    expect(limitsFor("base").max_vehicles).toBe(250);
    expect(limitsFor("pro").max_vehicles).toBe(2500);
    expect(limitsFor("elite").max_vehicles).toBe(9999);
    expect(limitsFor("elite").can_send_email).toBe(true);
    expect(limitsFor("base").can_send_email).toBe(false);
  });

  it("turns off user management and roles on every plan", () => {
    for (const code of planCodes) {
      const modules = modulesFor(code);
      expect(modules.user_management, `${code} must not manage users`).toBe(false);
      expect(modules.roles_permissions, `${code} must not manage roles`).toBe(false);
    }
  });

  it("keeps the other per-plan modules untouched", () => {
    expect(modulesFor("base").analytics).toBe(false);
    expect(modulesFor("pro").analytics).toBe(true);
    expect(modulesFor("pro").bulk_import).toBe(true);
    expect(modulesFor("elite").google_ads).toBe(true);
    expect(modulesFor("elite").advanced_settings).toBe(true);
  });

  // trg_protect_dealer_demo_subscription_snapshot raises 55000 on any snapshot
  // change once demo_status is set, and every permitted status is protected
  // ('configured' being the column default). Touching issued rows can only
  // ever abort the migration, so it must not be attempted.
  it("never rewrites snapshots already issued to dealers", () => {
    expect(migrationSql).not.toMatch(/update\s+public\.dealer_demo_subscriptions/i);
    expect(migrationSql).not.toMatch(/set\s+limits_snapshot\s*=/i);
    expect(migrationSql).not.toMatch(/set\s+modules_snapshot\s*=/i);
  });

  it("explains why issued snapshots are left alone", () => {
    expect(migrationSql).toMatch(/trg_protect_dealer_demo_subscription_snapshot/);
  });

  it("enforces the cap with a trigger on dealer_users", () => {
    expect(migrationSql).toContain("create or replace function public.enforce_single_dealer_user()");
    expect(migrationSql).toMatch(
      /create trigger trg_enforce_single_dealer_user\s+before insert or update on public\.dealer_users/i,
    );
    expect(migrationSql).toMatch(/drop trigger if exists trg_enforce_single_dealer_user/i);
  });

  it("counts only active memberships against the cap", () => {
    expect(migrationSql).toMatch(/if coalesce\(new\.status, ''\) <> 'active' then\s+return new;/);
    expect(migrationSql).toMatch(/and du\.status = 'active'/);
    expect(migrationSql).toMatch(/and du\.id is distinct from new\.id/);
  });

  it("runs in a single transaction", () => {
    expect(migrationSql.trimStart().startsWith("begin;")).toBe(true);
    expect(migrationSql.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("does not edit the original demo rpc core migration", () => {
    const core = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260717000005_demo_rpc_core.sql"),
      "utf8",
    );
    expect(core).toContain('"max_users":2');
    expect(core).toContain('"max_users":5');
    expect(core).toContain('"max_users":10');
  });
});
