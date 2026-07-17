import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMigration(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("demo lifecycle missing dependencies migration", () => {
  it("creates audit_logs with the columns every demo lifecycle RPC writes", () => {
    const migration = readMigration("supabase/migrations/20260717000007_demo_lifecycle_missing_dependencies.sql");

    expect(migration).toContain("create table if not exists public.audit_logs (");
    for (const column of [
      "dealer_id uuid references public.dealers(id)",
      "actor_profile_id uuid references public.profiles(id)",
      "actor_type text not null",
      "action text not null",
      "entity_type text not null",
      "entity_id uuid",
      "before_json jsonb",
      "after_json jsonb",
      "metadata_json jsonb",
      "created_by uuid references public.profiles(id)",
    ]) {
      expect(migration).toContain(column);
    }
  });

  it("locks audit_logs down to service_role only", () => {
    const migration = readMigration("supabase/migrations/20260717000007_demo_lifecycle_missing_dependencies.sql");

    expect(migration).toContain("alter table public.audit_logs enable row level security;");
    expect(migration).toContain("alter table public.audit_logs force row level security;");
    expect(migration).toContain("revoke all on table public.audit_logs from anon;");
    expect(migration).toContain("revoke all on table public.audit_logs from authenticated;");
    expect(migration).toContain("grant select, insert, update, delete on table public.audit_logs to service_role;");
  });

  it("adds the demo_requests columns the admin route and atomic RPC already read and write", () => {
    const migration = readMigration("supabase/migrations/20260717000007_demo_lifecycle_missing_dependencies.sql");

    expect(migration).toContain("add column if not exists demo_status text,");
    expect(migration).toContain("add column if not exists linked_dealer_id uuid references public.dealers(id) on delete set null,");
    expect(migration).toContain("add column if not exists demo_expires_at timestamptz;");
  });

  it("does not touch unrelated tables or introduce destructive statements", () => {
    const migration = readMigration("supabase/migrations/20260717000007_demo_lifecycle_missing_dependencies.sql");

    expect(migration).not.toContain("drop table");
    expect(migration).not.toContain("drop column");
    expect(migration).not.toContain("truncate");
  });
});
