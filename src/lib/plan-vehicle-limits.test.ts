import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260727010000_plan_vehicle_limits.sql"),
  "utf8",
);

const planCodes = ["base", "pro", "elite"] as const;

const expectedCap: Record<(typeof planCodes)[number], number> = {
  base: 50,
  pro: 150,
  elite: 300,
};

function limitsFor(code: (typeof planCodes)[number]) {
  const match = migrationSql.match(
    new RegExp(`when '${code}' then '(\\{"max_users".*?\\})'::jsonb`),
  );
  expect(match, `limits snapshot for ${code} not found`).not.toBeNull();
  return JSON.parse(match![1]) as Record<string, unknown>;
}

// Every file that states the cap to a customer. If a new plan page appears,
// add it here so the copy cannot drift away from the database.
const copyFiles = [
  "src/lib/demo-plan-catalog.ts",
  "src/app/abbonamento/page.tsx",
  "src/app/abbonamento/base/page.tsx",
  "src/app/abbonamento/pro/page.tsx",
  "src/app/registrazione/base/page.tsx",
  "src/app/registrazione/pro/page.tsx",
  "src/app/registrazione/elite/page.tsx",
];

function readCopy(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("per-plan vehicle listing limits", () => {
  it("caps listings at 50 / 150 / 300", () => {
    for (const code of planCodes) {
      expect(limitsFor(code).max_vehicles, `${code} listing cap`).toBe(expectedCap[code]);
    }
  });

  it("leaves the single-user rule from the previous migration in place", () => {
    for (const code of planCodes) {
      expect(limitsFor(code).max_users, `${code} must still allow one user`).toBe(1);
      expect(limitsFor(code).can_create_users).toBe(false);
    }
  });

  it("keeps the other per-plan limits untouched", () => {
    expect(limitsFor("base").max_leads).toBe(500);
    expect(limitsFor("pro").max_leads).toBe(2500);
    expect(limitsFor("elite").max_leads).toBe(9999);
    expect(limitsFor("elite").can_send_email).toBe(true);
    expect(limitsFor("base").can_send_email).toBe(false);
  });

  it("never rewrites snapshots already issued to dealers", () => {
    expect(migrationSql).not.toMatch(/update\s+public\.dealer_demo_subscriptions/i);
    expect(migrationSql).not.toMatch(/set\s+limits_snapshot\s*=/i);
  });

  it("no longer promises unlimited listings anywhere", () => {
    for (const path of copyFiles) {
      expect(readCopy(path), `${path} still promises unlimited listings`).not.toMatch(
        /illimitat|senza limiti operativi/i,
      );
    }
  });

  it("states the matching cap on every plan page", () => {
    expect(readCopy("src/app/registrazione/base/page.tsx")).toContain("Fino a 50 annunci");
    expect(readCopy("src/app/registrazione/pro/page.tsx")).toContain("Fino a 150 annunci");
    expect(readCopy("src/app/registrazione/elite/page.tsx")).toContain("Fino a 300 annunci");
    expect(readCopy("src/app/abbonamento/base/page.tsx")).toContain("Fino a 50 annunci");
    expect(readCopy("src/app/abbonamento/pro/page.tsx")).toContain("Fino a 150 annunci");
    expect(readCopy("src/lib/demo-plan-catalog.ts")).toContain("Fino a 300 annunci");

    const listing = readCopy("src/app/abbonamento/page.tsx");
    for (const cap of Object.values(expectedCap)) {
      expect(listing, `plan listing page missing the ${cap} cap`).toContain(
        `Fino a ${cap} annunci`,
      );
    }
  });
});
