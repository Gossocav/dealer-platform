import { describe, expect, it } from "vitest";
import { buildDemoAccessContext, DEMO_OPERATION_POLICIES, DemoAccessError, isDemoModuleKey, requireDemoEmail, requireDemoModule, requireDemoOperational } from "@/lib/demo-access";
import { getDemoProfileByCode } from "@/lib/demo-profiles";

function context(overrides: Record<string, unknown> = {}) {
  const profile = getDemoProfileByCode("base")!;
  return buildDemoAccessContext({
    accountType: "demo", demoStatus: "active", profileCode: "base", dealerId: "dealer-1",
    profileId: "user-1", userId: "user-1", membershipRole: "dealer_member", membershipActive: true,
    startedAt: "2026-07-15T00:00:00.000Z", expiresAt: "2026-07-22T00:00:00.000Z",
    modules: profile.modules, limits: profile.limits, marketingServices: profile.marketing_services,
    provisioningComplete: true, tenantMatches: true, ...overrides,
  });
}

describe("centralized Demo access", () => {
  it("does not alter a normal account", () => expect(() => requireDemoModule(context({ accountType: "paid" }), "billing", new Date("2026-07-16"))).not.toThrow());
  it("allows a valid active Demo", () => expect(() => requireDemoOperational(context(), new Date("2026-07-16"))).not.toThrow());
  it("blocks an inactive Demo", () => expectCode(() => requireDemoOperational(context({ demoStatus: "configured" }), new Date("2026-07-16")), "DEMO_INACTIVE"));
  it("computes expiration at runtime", () => expectCode(() => requireDemoOperational(context(), new Date("2026-07-22T00:00:00.000Z")), "DEMO_EXPIRED"));
  it("blocks a suspended Demo", () => expectCode(() => requireDemoOperational(context({ demoStatus: "suspended" }), new Date("2026-07-16")), "DEMO_SUSPENDED"));
  it("blocks a revoked Demo with its stable code", () => expectCode(() => requireDemoOperational(context({ demoStatus: "revoked" }), new Date("2026-07-16")), "DEMO_REVOKED"));
  it("blocks a stale converted Demo context", () => expectCode(() => requireDemoOperational(context({ demoStatus: "converted" }), new Date("2026-07-16")), "DEMO_CONVERTED"));
  it("blocks a missing membership", () => expectCode(() => requireDemoOperational(context({ membershipActive: false }), new Date("2026-07-16")), "DEMO_MEMBERSHIP_INVALID"));
  it("blocks a mismatched dealer", () => expectCode(() => requireDemoOperational(context({ tenantMatches: false }), new Date("2026-07-16")), "DEMO_MEMBERSHIP_INVALID"));
  it("blocks a missing snapshot", () => expectCode(() => requireDemoOperational(context({ modules: {} }), new Date("2026-07-16")), "DEMO_CONTEXT_INVALID"));
  it("allows an enabled module", () => expect(() => requireDemoModule(context(), "vehicles", new Date("2026-07-16"))).not.toThrow());
  it("blocks a disabled module", () => expectCode(() => requireDemoModule(context(), "analytics", new Date("2026-07-16")), "DEMO_MODULE_DISABLED"));
  it("rejects an unknown module key", () => { expect(isDemoModuleKey("root_access")).toBe(false); expectCode(() => requireDemoModule(context(), "root_access" as never, new Date("2026-07-16")), "DEMO_MODULE_DISABLED"); });
  it("blocks all Demo email sends", () => expectCode(() => requireDemoEmail(context(), new Date("2026-07-16")), "DEMO_EMAIL_DISABLED"));
  it("uses stable non-sensitive errors", () => { const error = capture(() => requireDemoEmail(context(), new Date("2026-07-16"))); expect(error.toResponseBody()).toEqual({ code: "DEMO_EMAIL_DISABLED", error: "L’invio email non è disponibile per il profilo Demo." }); expect(JSON.stringify(error.toResponseBody())).not.toMatch(/token|password|service.role/i); });
  it.each([
    ["vehicles", "vehicles"], ["leads", "leads"], ["clients", "clients"],
    ["appointments", "calendar"], ["users", "user_management"], ["email", "email_sending"], ["upload", "vehicles"],
  ] as const)("protects the %s route/flow", (operation, module) => expect(DEMO_OPERATION_POLICIES[operation].module).toBe(module));
});

function capture(operation: () => void) { try { operation(); } catch (error) { if (error instanceof DemoAccessError) return error; } throw new Error("Expected DemoAccessError"); }
function expectCode(operation: () => void, code: string) { expect(capture(operation).code).toBe(code); }
