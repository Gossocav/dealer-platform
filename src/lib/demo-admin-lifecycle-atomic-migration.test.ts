import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMigration(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("demo admin lifecycle atomic migration", () => {
  it("declares the atomic reject rpc with the required security and transactional semantics", () => {
    const migration = readMigration("supabase/migrations/20260717000006_demo_admin_lifecycle_atomic.sql");

    expect(migration).toContain("create or replace function public.reject_demo_request_atomic(");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public");
    expect(migration).toContain("perform public.assert_demo_service_role();");
    expect(migration).toContain("perform public.assert_demo_actor_membership(p_dealer_id, p_actor_id);");
    expect(migration).toContain("for update");
    expect(migration).toContain("public.transition_demo_lifecycle(");
    expect(migration).toContain("'revoke_demo'");
    expect(migration).toContain("revoke all on function public.reject_demo_request_atomic(uuid, uuid, uuid, text, bigint) from public, anon, authenticated;");
    expect(migration).toContain("grant execute on function public.reject_demo_request_atomic(uuid, uuid, uuid, text, bigint) to service_role;");
    expect(migration).not.toContain("create policy");
    expect(migration).not.toContain("create trigger");
    expect(migration).not.toContain("create table");
  });

  it("only treats a genuine lifecycle transition as success, never a terminal-state no-op", () => {
    const migration = readMigration("supabase/migrations/20260717000006_demo_admin_lifecycle_atomic.sql");

    expect(migration).toContain("if v_transition_outcome <> 'DEMO_LIFECYCLE_UPDATED' then");
    expect(migration).not.toContain("v_transition_outcome not in ('DEMO_LIFECYCLE_UPDATED', 'DEMO_TERMINAL_STATE')");
  });

  it("writes an audit log entry for the demo_request/dealer mutation", () => {
    const migration = readMigration("supabase/migrations/20260717000006_demo_admin_lifecycle_atomic.sql");

    expect(migration).toContain("'demo.revoked'");
    expect(migration).toContain("'demo_request'");
  });

  it("lets platform admins act as the RPC actor without dealer_users membership", () => {
    const migration = readMigration("supabase/migrations/20260717000006_demo_admin_lifecycle_atomic.sql");

    expect(migration).toContain("create or replace function public.assert_demo_actor_membership(");
    expect(migration).toContain("lower(coalesce(pr.role, '')) in ('admin', 'platform_owner')");
  });

  it("widens demo_requests_status_check to allow the converted/revoked terminal statuses", () => {
    const migration = readMigration("supabase/migrations/20260717000006_demo_admin_lifecycle_atomic.sql");

    expect(migration).toContain("alter table public.demo_requests drop constraint demo_requests_status_check;");
    expect(migration).toContain("check (status in ('pending', 'contacted', 'activated', 'rejected', 'converted', 'revoked'));");
  });

  it("records the revoked demo_requests status distinctly from a plain rejection", () => {
    const migration = readMigration("supabase/migrations/20260717000006_demo_admin_lifecycle_atomic.sql");

    expect(migration).toContain("status = 'revoked',");
    expect(migration).not.toContain("status = 'rejected',");
  });
});
