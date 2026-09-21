import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEMO_ACTIVATION_STATES,
  DEMO_ERROR_CODES,
  DEMO_PROFILE_CODES,
  DEMO_REQUEST_STATUSES,
  DEMO_STATUSES,
  DEMO_SUBSCRIPTION_STATUSES,
} from "./demo-contracts";

function readMigration(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

/**
 * **Attenzione a cosa dice questo file: legge il testo delle migration di
 * luglio, non lo stato del database di oggi.**
 *
 * Quelle migration hanno creato la macchina della demo e non si toccano piu'.
 * Fissarne il testo e' utile -- dice che nessuno le ha modificate a posteriori
 * -- ma **non dice niente su come si comporta la produzione adesso**, perche'
 * una migration successiva puo' aver cambiato tutto.
 *
 * **Ed e' successo il 21/09/2026**: la prova gratuita e' passata da sette
 * giorni a trenta. Le righe qui sotto che nominano `interval '7 days'`
 * continuano a passare, ed e' corretto -- quel testo nel file di luglio c'e'
 * ancora -- ma **il contratto dei sette giorni non e' piu' in vigore**:
 * `20260921120000_la_prova_dura_trenta_giorni.sql` lo ha sostituito.
 *
 * Il controllo su quanto dura davvero una prova sta in
 * `src/lib/durata-della-prova.test.ts`, e legge la migration che comanda.
 */
describe("dealer demo data model migration", () => {
  it("defines the dealer_demo_subscriptions table and immutability rules", () => {
    const migration = readMigration("supabase/migrations/20260717000004_dealer_demo_subscriptions.sql");

    expect(migration).toContain("create table if not exists public.dealer_demo_subscriptions");
    expect(migration).toContain("demo_profile_code text not null");
    expect(migration).toContain("modules_snapshot jsonb not null");
    expect(migration).toContain("limits_snapshot jsonb not null");
    expect(migration).toContain("marketing_snapshot jsonb not null");
    expect(migration).toContain("email_policy jsonb not null");
    expect(migration).toContain("starts_at timestamptz not null default now()");
    expect(migration).toContain("expires_at timestamptz not null");
    expect(migration).toContain("extension_used boolean not null default false");
    expect(migration).toContain("lifecycle_version bigint not null default 1");
    expect(migration).toContain("converted_plan_code text");
    expect(migration).toContain("converted_at timestamptz");
    expect(migration).toContain("converted_by uuid references auth.users(id) on delete set null");
    expect(migration).toContain("subscription_status text not null default 'demo'");
    expect(migration).toContain("check (demo_profile_code in ('base', 'pro', 'elite'))");
    expect(migration).toContain("check (request_status in ('pending', 'contacted', 'qualified', 'approved_for_activation', 'rejected'))");
    expect(migration).toContain("check (activation_state in ('idle', 'reserved', 'auth_ready', 'dealer_ready', 'profile_ready', 'membership_ready', 'completed', 'failed'))");
    expect(migration).toContain("check (demo_status in ('configured', 'ready_for_activation', 'active', 'suspended', 'expired', 'revoked', 'converted'))");
    expect(migration).toContain("check (lifecycle_version >= 1)");
    expect(migration).toContain("jsonb_typeof(modules_snapshot) = 'object'");
    expect(migration).toContain("expires_at = starts_at + interval '7 days'");
    expect(migration).toContain("expires_at between starts_at + interval '7 days' and starts_at + interval '14 days'");
    expect(migration).toContain("foreign key (dealer_id) references public.dealers(id) on delete cascade");
    expect(migration).toContain("foreign key (demo_request_id) references public.demo_requests(id) on delete restrict");
    expect(migration).toContain("create unique index if not exists dealer_demo_subscriptions_dealer_active_uidx");
    expect(migration).toContain("where demo_status in ('configured', 'ready_for_activation', 'active', 'suspended', 'expired')");
    expect(migration).toContain("create unique index if not exists dealer_demo_subscriptions_request_uidx");
    expect(migration).toContain("create trigger trg_protect_dealer_demo_subscription_snapshot");
    expect(migration).toContain("if old.demo_status in ('configured', 'ready_for_activation', 'active', 'suspended', 'expired', 'revoked', 'converted') and (");
    expect(migration).toContain("Dealer demo subscription snapshot is immutable after configuration.");
  });

  // Il nome diceva "the fixed seven day duration contract" e il caso non
  // guardava nessuna durata: elenca i codici e gli stati. Il 21/09/2026 la
  // durata e' cambiata e questo caso **non e' caduto** -- giustamente, non
  // era affar suo -- ma il suo nome avrebbe fatto credere il contrario a chi
  // lo legge. Si fissa la proprieta' che guarda davvero.
  it("keeps the three demo profiles and the lifecycle vocabulary", () => {
    expect(DEMO_PROFILE_CODES).toEqual(["base", "pro", "elite"]);
    expect(DEMO_REQUEST_STATUSES).toEqual(["pending", "contacted", "qualified", "approved_for_activation", "rejected"]);
    expect(DEMO_ACTIVATION_STATES).toEqual(["idle", "reserved", "auth_ready", "dealer_ready", "profile_ready", "membership_ready", "completed", "failed"]);
    expect(DEMO_STATUSES).toEqual(["configured", "ready_for_activation", "active", "suspended", "expired", "revoked", "converted"]);
    expect(DEMO_SUBSCRIPTION_STATUSES).toContain("paid");
    expect(DEMO_ERROR_CODES).toContain("DEMO_EMAIL_RATE_LIMITED");
  });

  it("does not modify the dealer_users foundation migration", () => {
    const workingTreeFile = readMigration("supabase/migrations/20260717000003_dealer_users_membership_foundation.sql");
    const gitVersion = execSync(
      "git show HEAD:supabase/migrations/20260717000003_dealer_users_membership_foundation.sql",
      { encoding: "utf8", cwd: process.cwd() }
    );

    expect(workingTreeFile).toBe(gitVersion);
    expect(workingTreeFile).toContain("create table if not exists public.dealer_users");
    expect(workingTreeFile).toContain("create policy dealer_users_select_own");
    expect(workingTreeFile).toContain("grant select on public.dealer_users to authenticated");
  });
});