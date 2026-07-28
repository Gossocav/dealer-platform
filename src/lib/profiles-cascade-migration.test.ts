import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = read("supabase/migrations/20260728000000_profiles_restore_auth_cascade.sql");
const overview = read("src/app/api/admin/overview/route.ts");

describe("profiles cascade migration", () => {
  it("clears orphaned profiles before adding the constraint", () => {
    // Postgres validates existing rows when a foreign key is added, so any
    // profile without an account would abort the whole migration.
    const deleteAt = migration.indexOf("delete from public.profiles");
    const constraintAt = migration.indexOf("add constraint profiles_id_fkey");

    expect(deleteAt).toBeGreaterThan(-1);
    expect(constraintAt).toBeGreaterThan(-1);
    expect(deleteAt).toBeLessThan(constraintAt);
  });

  it("cascades so an account takes its profile with it", () => {
    expect(migration).toMatch(
      /foreign key \(id\) references auth\.users\(id\) on delete cascade/,
    );
  });

  it("detects an existing constraint by shape, not by name", () => {
    // A constraint created earlier under another name must not be duplicated.
    expect(migration).toMatch(/c\.contype = 'f'/);
    expect(migration).toMatch(/c\.confrelid = 'auth\.users'::regclass/);
    expect(migration).not.toMatch(/where conname = 'profiles_id_fkey'\s*$/m);
  });

  it("runs in a single transaction", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
  });
});

describe("admin user count", () => {
  it("counts accounts, never the maximum of two different things", () => {
    expect(overview).toMatch(/usersRegistered: authUsersCount,/);
    expect(overview).not.toMatch(/Math\.max\([^)]*profilesCount/);
  });

  it("stops querying the profiles table for that tile", () => {
    expect(overview).not.toContain('from("profiles").select("id", { count: "exact", head: true })');
    expect(overview).not.toContain("profilesCount");
  });
});
