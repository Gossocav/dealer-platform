import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260727020000_enforce_listing_limits.sql"),
  "utf8",
);

describe("listing limit enforcement migration", () => {
  it("declares the cap resolver and the guard", () => {
    expect(migrationSql).toContain(
      "create or replace function public.resolve_dealer_listing_cap(p_dealer_id uuid)",
    );
    expect(migrationSql).toContain(
      "create or replace function public.enforce_dealer_listing_limit()",
    );
  });

  it("reads the cap from the plan matrix rather than a frozen snapshot", () => {
    // Snapshots issued before 2026-07-27 still carry 250/2500/9999, so reading
    // them would silently grandfather old dealers onto the old caps.
    expect(migrationSql).toMatch(/from public\.demo_profile_snapshots\(v_plan\) m/);
    expect(migrationSql).toMatch(/m\.limits_snapshot->>'max_vehicles'/);
    // s is the dealer_demo_subscriptions alias: it must only ever yield the
    // plan code, never the frozen limits.
    expect(migrationSql).not.toMatch(/s\.limits_snapshot/);
  });

  it("prefers the subscription plan over the legacy dealers column", () => {
    expect(migrationSql).toMatch(/converted_plan_code[\s\S]{0,120}demo_profile_code/);
    expect(migrationSql).toMatch(/v_plan := coalesce\(nullif\(v_plan, ''\), nullif\(v_legacy_plan, ''\)\)/);
  });

  it("gives demo accounts the trial allowance", () => {
    expect(migrationSql).toMatch(/if v_account_type = 'demo' then\s+return 10;/);
  });

  it("fails open when the cap cannot be resolved", () => {
    expect(migrationSql).toMatch(/if v_cap is null then\s+return new;/);
  });

  it("counts only live listings, matching the marketplace definition", () => {
    expect(migrationSql).toMatch(
      /coalesce\(new\.published, false\) and lower\(coalesce\(new\.status, ''\)\) = 'published'/,
    );
    expect(migrationSql).toMatch(/and v\.id is distinct from new\.id/);
  });

  it("lets an already published vehicle keep being edited", () => {
    expect(migrationSql).toMatch(
      /if tg_op = 'UPDATE'\s+and coalesce\(old\.published, false\)\s+and lower\(coalesce\(old\.status, ''\)\) = 'published' then\s+return new;/,
    );
  });

  it("never takes existing listings offline", () => {
    expect(migrationSql).not.toMatch(/update\s+public\.vehicles/i);
    expect(migrationSql).not.toMatch(/set\s+published\s*=/i);
    expect(migrationSql).not.toMatch(/delete\s+from\s+public\.vehicles/i);
  });

  it("fires after the trigger that assigns dealer_id", () => {
    // Same-timing triggers run in alphabetical order, and
    // trg_enforce_vehicle_dealer_id populates new.dealer_id on insert.
    expect(migrationSql).toContain("create trigger trg_vehicles_listing_limit");
    expect("trg_vehicles_listing_limit" > "trg_enforce_vehicle_dealer_id").toBe(true);
  });

  it("runs in a single transaction", () => {
    expect(migrationSql.trimStart().startsWith("begin;")).toBe(true);
    expect(migrationSql.trimEnd().endsWith("commit;")).toBe(true);
  });
});
