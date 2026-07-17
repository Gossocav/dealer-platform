import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationFileName = "20260717000003_dealer_users_membership_foundation.sql";
const migrationPath = join(process.cwd(), "supabase", "migrations", migrationFileName);
const migrationSql = readFileSync(migrationPath, "utf8");

describe("dealer_users membership foundation migration", () => {
  it("creates dealer_users idempotently with tenant constraints", () => {
    expect(migrationSql).toMatch(/create table if not exists public\.dealer_users/i);
    expect(migrationSql).toMatch(/constraint dealer_users_membership_unique\s+unique\s*\(dealer_id,\s*profile_id\)/i);
  });

  it("blocks invalid status values and enforces supported statuses", () => {
    expect(migrationSql).toMatch(/status in \('invited', 'active', 'suspended', 'disabled'\)/i);
    expect(migrationSql).toMatch(/if new\.status not in \('invited', 'active', 'suspended', 'disabled'\)/i);
  });

  it("enforces secure default role without introducing unsupported roles", () => {
    expect(migrationSql).toMatch(/role text not null default 'dealer_member'/i);
    expect(migrationSql).toMatch(/check \(role = 'dealer_member'\)/i);
    expect(migrationSql).not.toMatch(/dealer_owner/i);
  });

  it("forces RLS and own-membership read policy", () => {
    expect(migrationSql).toMatch(/alter table public\.dealer_users enable row level security;/i);
    expect(migrationSql).toMatch(/alter table public\.dealer_users force row level security;/i);
    expect(migrationSql).toMatch(/create policy dealer_users_select_own/i);
    expect(migrationSql).toMatch(/profile_id = auth\.uid\(\)/i);
    expect(migrationSql).not.toMatch(/create policy dealer_users_insert_tenant/i);
    expect(migrationSql).not.toMatch(/create policy dealer_users_update_tenant/i);
    expect(migrationSql).not.toMatch(/create policy dealer_users_delete_tenant/i);
  });

  it("denies direct client-side writes by default", () => {
    expect(migrationSql).toMatch(/revoke insert, update, delete on public\.dealer_users from authenticated;/i);
    expect(migrationSql).toMatch(/grant select on public\.dealer_users to authenticated;/i);
  });

  it("uses active membership only for tenant resolution and treats ambiguity as unresolved", () => {
    expect(migrationSql).toMatch(/create or replace function public\.current_dealer_id\(\)/i);
    expect(migrationSql).toMatch(/where du\.profile_id = auth\.uid\(\)\s*\n\s*and du\.status = 'active'/i);
    expect(migrationSql).toMatch(/when \(select count\(\*\) from active_memberships\) = 1/i);
    expect(migrationSql).toMatch(/else null::uuid/i);
  });

  it("guards tenant isolation in trigger logic", () => {
    expect(migrationSql).toMatch(/profile_id non associato ad alcun dealer/i);
    expect(migrationSql).toMatch(/dealer_id non coerente con profile_id/i);
    expect(migrationSql).toMatch(/dealer_id non puo essere modificato/i);
    expect(migrationSql).toMatch(/profile_id non puo essere modificato/i);
  });

  it("keeps security definer functions hardened with explicit search_path", () => {
    expect(migrationSql).toMatch(/create or replace function public\.current_dealer_id\(\)\s*[\s\S]*?security definer\s*[\s\S]*?set search_path = public/i);
    expect(migrationSql).toMatch(/create or replace function public\.enforce_dealer_user_membership\(\)\s*[\s\S]*?security definer\s*[\s\S]*?set search_path = public/i);
  });
});
