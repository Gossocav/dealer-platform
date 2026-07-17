import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMigration(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("demo rpc core migration", () => {
  it("declares helpers and all required rpc functions", () => {
    const migration = readMigration("supabase/migrations/20260717000005_demo_rpc_core.sql");

    expect(migration).toContain("create or replace function public.assert_demo_service_role()");
    expect(migration).toContain("create or replace function public.assert_demo_actor_membership(");
    expect(migration).toContain("create or replace function public.demo_profile_snapshots(");

    expect(migration).toContain("create or replace function public.configure_demo_profile(");
    expect(migration).toContain("create or replace function public.reserve_demo_activation(");
    expect(migration).toContain("create or replace function public.record_demo_activation_progress(");
    expect(migration).toContain("create or replace function public.finalize_demo_activation(");
    expect(migration).toContain("create or replace function public.fail_demo_activation(");
    expect(migration).toContain("create or replace function public.transition_demo_lifecycle(");
    expect(migration).toContain("create or replace function public.extend_demo(");
    expect(migration).toContain("create or replace function public.expire_due_demos()");
  });

  it("enforces actor-tenant checks, activation sequencing, lifecycle rules, extension limits and audit semantics", () => {
    const migration = readMigration("supabase/migrations/20260717000005_demo_rpc_core.sql");

    expect(migration).toContain("add column if not exists activation_attempt_id uuid");
    expect(migration).toContain("add column if not exists activation_reserved_at timestamptz");
    expect(migration).toContain("add column if not exists activation_last_error text");

    expect(migration).toContain("perform public.assert_demo_service_role();");
    expect(migration).toContain("perform public.assert_demo_actor_membership(p_dealer_id, p_actor_id);");
    expect(migration).toContain("du.status = 'active'");

    expect(migration).toContain("from public.demo_profile_snapshots(p_profile_code)");
    expect(migration).toContain("if v_profile is null then");
    expect(migration).toContain("v_now + interval '7 days'");
    expect(migration).toContain("DEMO_PROFILE_IMMUTABLE");
    expect(migration).toContain("DEMO_CONFIG_NOOP");

    expect(migration).toContain("activation_attempt_id = p_attempt_id");
    expect(migration).toContain("activation_attempt_id is distinct from p_attempt_id");
    expect(migration).toContain("when 'reserved' then 'auth_ready'");
    expect(migration).toContain("when 'auth_ready' then 'dealer_ready'");
    expect(migration).toContain("when 'dealer_ready' then 'profile_ready'");
    expect(migration).toContain("when 'profile_ready' then 'membership_ready'");
    expect(migration).toContain("DEMO_ACTIVATION_SEQUENCE_INVALID");
    expect(migration).toContain("if v_row.activation_state <> 'membership_ready' then");

    expect(migration).toContain("(v_row.demo_status = 'active' and v_to in ('suspended', 'revoked', 'converted'))");
    expect(migration).toContain("(v_row.demo_status = 'suspended' and v_to in ('active', 'revoked', 'converted'))");
    expect(migration).toContain("(v_row.demo_status = 'expired' and v_to in ('revoked', 'converted'))");
    expect(migration).toContain("if v_row.demo_status in ('revoked', 'converted') then");
    expect(migration).toContain("if v_row.demo_status <> 'expired' then");
    expect(migration).toContain("if v_days < 1 or v_days > 7 then");
    expect(migration).toContain("if v_row.extension_used then");
    expect(migration).toContain("DEMO_INVALID_REASON");

    expect(migration).toContain("v_row.lifecycle_version <> p_lifecycle_version");
    expect(migration).toContain("lifecycle_version = lifecycle_version + 1");
    expect(migration).toContain("pending_payment");

    expect(migration).toContain("for update");
    expect(migration).toContain("for update skip locked");

    expect(migration).toContain("v_before := to_jsonb(v_row);");
    expect(migration).toContain("returning * into v_row;");
    expect(migration).toContain("returning * into v_after;");

    expect(migration).toContain("demo.configured");
    expect(migration).toContain("demo.activation_reserved");
    expect(migration).toContain("demo.activation_progressed");
    expect(migration).toContain("demo.activated");
    expect(migration).toContain("demo.activation_failed");
    expect(migration).toContain("demo.suspended");
    expect(migration).toContain("demo.reactivated");
    expect(migration).toContain("demo.revoked");
    expect(migration).toContain("demo.converted");
    expect(migration).toContain("demo.extended");
    expect(migration).toContain("demo.expired");
    expect(migration).toContain("'system'");

    expect(migration).toContain("set search_path = public, auth");
    expect(migration).toContain("security definer");
    expect(migration).toContain("revoke all on function public.assert_demo_service_role()");
    expect(migration).toContain("revoke all on function public.assert_demo_actor_membership(uuid, uuid)");
    expect(migration).toContain("revoke all on function public.demo_profile_snapshots(text)");
    expect(migration).toContain("revoke all on function public.configure_demo_profile");
    expect(migration).toContain("grant execute on function public.configure_demo_profile");
    expect(migration).toContain("grant execute on function public.expire_due_demos() to service_role");

    expect(migration).not.toContain("update public.dealers");
    expect(migration).not.toContain("set subscription_status = 'paid'");
  });

  it("does not modify existing migrations", () => {
    const files = [
      "supabase/migrations/20260717000003_dealer_users_membership_foundation.sql",
      "supabase/migrations/20260717000004_dealer_demo_subscriptions.sql",
    ];

    for (const file of files) {
      const workingTreeVersion = readMigration(file);
      const headVersion = execSync(`git show HEAD:${file}`, { cwd: process.cwd(), encoding: "utf8" });
      expect(workingTreeVersion).toBe(headVersion);
    }
  });
});
