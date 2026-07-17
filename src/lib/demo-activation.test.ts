import { describe, expect, it } from "vitest";
import { isPlatformAdminRole } from "@/lib/account-approval";
import { activateConfiguredDemo, DemoActivationError, type DemoActivationDependencies, type DemoActivationRequest, type DemoActivationRow } from "@/lib/demo-activation";
import { getDemoProfileByCode } from "@/lib/demo-profiles";

function configuredRequest(overrides: Partial<DemoActivationRequest> = {}): DemoActivationRequest {
  const profile = getDemoProfileByCode("base")!;
  return {
    id: "request-1", dealershipName: "Dealer Test", contactName: "Mario Rossi",
    email: "demo@example.com", phone: null, city: null, demoStatus: "configured",
    profileId: "profile-base", profileCode: profile.code, priceMonthly: profile.price_monthly,
    durationDays: profile.duration_days, modules: { ...profile.modules }, limits: { ...profile.limits },
    marketingServices: { ...profile.marketing_services }, linkedDealerId: null, authUserId: null,
    ...overrides,
  };
}

function activeRow(durationDays = 7): DemoActivationRow {
  const started = new Date("2026-07-15T10:00:00.000Z");
  return {
    id: "request-1", status: "activated", demo_status: "active",
    demo_started_at: started.toISOString(),
    demo_expires_at: new Date(started.getTime() + durationDays * 86_400_000).toISOString(),
    activated_at: started.toISOString(), linked_dealer_id: "dealer-1",
    demo_auth_user_id: "user-1", demo_profile_code: "base",
  };
}

function dependencies(options: { outcome?: "reserved" | "not_found" | "invalid_state" | "invalid_profile" | "busy" | "already_active"; request?: DemoActivationRequest; failAt?: "auth" | "dealer" | "membership" | "finalize" } = {}) {
  const counts = { auth: 0, dealer: 0, membership: 0, finalize: 0, failed: 0 };
  let active = false;
  const request = options.request ?? configuredRequest();
  const deps: DemoActivationDependencies = {
    async reserve() {
      const outcome = options.outcome ?? (active ? "already_active" : "reserved");
      if (outcome === "already_active") return { outcome, request, activation: activeRow(request.durationDays ?? 7) };
      if (outcome !== "reserved") return { outcome };
      return { outcome, request };
    },
    async ensureAuthUser() { counts.auth += 1; if (options.failAt === "auth") throw new DemoActivationError("auth_create_failed"); return { userId: "user-1" }; },
    async ensureDealer() { counts.dealer += 1; if (options.failAt === "dealer") throw new DemoActivationError("dealer_upsert_failed"); return { dealerId: "dealer-1" }; },
    async ensureMembership() { counts.membership += 1; if (options.failAt === "membership") throw new DemoActivationError("membership_upsert_failed"); },
    async recordProgress() {},
    async finalize() { counts.finalize += 1; if (options.failAt === "finalize") throw new DemoActivationError("finalization_failed"); active = true; return activeRow(request.durationDays ?? 7); },
    async markFailed() { counts.failed += 1; },
  };
  return { deps, counts, isActive: () => active };
}

const run = (deps: DemoActivationDependencies, suffix = "1") => activateConfiguredDemo({ requestId: "request-1", actorId: "admin-1", attemptId: `attempt-${suffix}`, dependencies: deps });

describe("demo activation engine", () => {
  it("rejects a missing request", async () => expect(await run(dependencies({ outcome: "not_found" }).deps)).toMatchObject({ ok: false, code: "not_found", status: 404 }));
  it("rejects a request that is not configured", async () => expect(await run(dependencies({ outcome: "invalid_state" }).deps)).toMatchObject({ ok: false, code: "invalid_state" }));
  it("rejects an unknown or disabled profile", async () => expect(await run(dependencies({ outcome: "invalid_profile" }).deps)).toMatchObject({ ok: false, code: "invalid_profile" }));
  it("rejects an incomplete snapshot", async () => expect(await run(dependencies({ request: configuredRequest({ modules: { dashboard: true } }) }).deps)).toMatchObject({ ok: false, code: "invalid_snapshot" }));
  it("activates a valid configured request", async () => expect(await run(dependencies().deps)).toMatchObject({ ok: true, code: "activated", activation: { demo_status: "active" } }));
  it("calculates expiry from start plus snapshot duration", async () => {
    const result = await run(dependencies({ request: configuredRequest({ durationDays: 12 }) }).deps);
    expect(result.ok && Date.parse(result.activation.demo_expires_at) - Date.parse(result.activation.demo_started_at)).toBe(12 * 86_400_000);
  });
  it("returns an idempotent result on a second attempt", async () => {
    const state = dependencies();
    expect((await run(state.deps, "a")).ok).toBe(true);
    expect(await run(state.deps, "b")).toMatchObject({ ok: true, code: "already_active" });
  });
  it("allows only one of two concurrent activation attempts", async () => {
    const base = dependencies();
    let locked = false;
    const reserve = base.deps.reserve;
    base.deps.reserve = async (input) => {
      if (locked) return { outcome: "busy" };
      locked = true;
      return reserve(input);
    };
    const results = await Promise.all([run(base.deps, "concurrent-a"), run(base.deps, "concurrent-b")]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok && result.code === "busy")).toHaveLength(1);
  });
  it("does not duplicate a dealer on idempotent retry", async () => { const s = dependencies(); await run(s.deps, "a"); await run(s.deps, "b"); expect(s.counts.dealer).toBe(1); });
  it("does not duplicate an Auth user on idempotent retry", async () => { const s = dependencies(); await run(s.deps, "a"); await run(s.deps, "b"); expect(s.counts.auth).toBe(1); });
  it("does not duplicate a membership on idempotent retry", async () => { const s = dependencies(); await run(s.deps, "a"); await run(s.deps, "b"); expect(s.counts.membership).toBe(1); });
  it("handles an Auth failure without activation", async () => { const s = dependencies({ failAt: "auth" }); expect(await run(s.deps)).toMatchObject({ ok: false, code: "activation_failed" }); expect(s.isActive()).toBe(false); });
  it("handles a database finalization failure", async () => { const s = dependencies({ failAt: "finalize" }); expect(await run(s.deps)).toMatchObject({ ok: false, code: "activation_failed" }); expect(s.counts.failed).toBe(1); });
  it("never leaves active status after incomplete activation", async () => { const s = dependencies({ failAt: "membership" }); await run(s.deps); expect(s.isActive()).toBe(false); expect(s.counts.finalize).toBe(0); });
  it("does not expose password or token in the response", async () => { const response = JSON.stringify(await run(dependencies().deps)); expect(response).not.toMatch(/password|token|secret/i); });
  it("blocks a non Admin role", () => expect(isPlatformAdminRole("dealer_member")).toBe(false));
});
