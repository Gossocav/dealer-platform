import { describe, expect, it } from "vitest";
import { buildDemoAccessContext } from "@/lib/demo-access";
import { checkDemoLimit, checkDemoStorageLimit, countActiveDealerMemberships, reserveDemoCapacity } from "@/lib/demo-limits";
import { getDemoProfileByCode } from "@/lib/demo-profiles";

function context() {
  const profile = getDemoProfileByCode("base")!;
  return buildDemoAccessContext({ accountType: "demo", demoStatus: "active", profileCode: "base", dealerId: "dealer-1", profileId: "user-1", userId: "user-1", membershipRole: "dealer_member", membershipActive: true, startedAt: "2026-07-15T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z", modules: profile.modules, limits: profile.limits, marketingServices: profile.marketing_services, provisioningComplete: true, tenantMatches: true });
}

describe("centralized Demo limits", () => {
  it("allows usage below the limit", () => expect(checkDemoLimit({ context: context(), resource: "vehicles", currentUsage: 1, increment: 1 }).allowed).toBe(true));
  it("blocks when the limit is exactly reached", () => expectCode(checkDemoLimit({ context: context(), resource: "vehicles", currentUsage: 250, increment: 1 }), "DEMO_LIMIT_REACHED"));
  it("blocks a single increment over limit", () => expectCode(checkDemoLimit({ context: context(), resource: "users", currentUsage: 2, increment: 1 }), "DEMO_LIMIT_REACHED"));
  it("blocks a batch crossing the limit", () => expectCode(checkDemoLimit({ context: context(), resource: "leads", currentUsage: 498, increment: 3 }), "DEMO_LIMIT_REACHED"));
  it("allows an operation with zero increment", () => expect(checkDemoLimit({ context: context(), resource: "clients", currentUsage: 500, increment: 0 }).allowed).toBe(true));
  it("rejects a negative increment", () => expectCode(checkDemoLimit({ context: context(), resource: "clients", currentUsage: 0, increment: -1 }), "DEMO_CONTEXT_INVALID"));
  it("rejects an invalid limit", () => { const value = context(); value.limits.max_clients = Number.NaN; expectCode(checkDemoLimit({ context: value, resource: "clients", currentUsage: 0, increment: 1 }), "DEMO_CONTEXT_INVALID"); });
  it("blocks upload beyond quota", () => expectCode(checkDemoStorageLimit({ context: context(), currentBytes: 750 * 1024 * 1024, newBytes: 1 }), "DEMO_STORAGE_LIMIT_REACHED"));
  it("allows normal accounts regardless of Demo limits", () => { const value = context(); value.isDemo = false; expect(checkDemoLimit({ context: value, resource: "vehicles", currentUsage: 99999, increment: 5 }).allowed).toBe(true); });
  it("counts only active memberships of the selected dealer", () => expect(countActiveDealerMemberships([{ dealerId: "dealer-1", status: "active" }, { dealerId: "dealer-1", status: "disabled" }, { dealerId: "dealer-2", status: "active" }], "dealer-1")).toBe(1));
  it("excludes revoked or disabled memberships", () => expect(countActiveDealerMemberships([{ dealerId: "dealer-1", status: "suspended" }, { dealerId: "dealer-1", status: "disabled" }], "dealer-1")).toBe(0));
  it("serializes concurrent reservations when one slot remains", async () => {
    const value = context(); value.limits.max_users = 2; let usage = 1; let queue = Promise.resolve();
    const runExclusive = async <T,>(_key: string, operation: () => Promise<T>) => { const prior = queue; let release!: () => void; queue = new Promise<void>((resolve) => { release = resolve; }); await prior; try { return await operation(); } finally { release(); } };
    const reserve = () => reserveDemoCapacity({ context: value, resource: "users", increment: 1, runExclusive, getCurrentUsage: async () => usage, onReserved: () => { usage += 1; } });
    const results = await Promise.all([reserve(), reserve()]);
    expect(results.filter((result) => result.allowed)).toHaveLength(1);
    expect(results.filter((result) => !result.allowed && result.error.code === "DEMO_LIMIT_REACHED")).toHaveLength(1);
  });
});

function expectCode(result: ReturnType<typeof checkDemoLimit> | ReturnType<typeof checkDemoStorageLimit>, code: string) { expect(result.allowed).toBe(false); if (!result.allowed) expect(result.error.code).toBe(code); }
