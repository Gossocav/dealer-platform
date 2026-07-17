import { describe, expect, it } from "vitest";
import {
  assertDemoStatusTransition, calculateDemoExpiration, canTransitionDemoStatus,
  getDemoLifecycleActions, normalizeDemoLifecycleReason, normalizeDemoReactivationDuration,
  safeEqualSecret,
} from "./demo-lifecycle";

describe("Demo lifecycle state machine", () => {
  const allowed = [
    ["configured", "active"], ["ready_for_activation", "active"],
    ["active", "expired"], ["active", "suspended"], ["active", "revoked"], ["active", "converted"],
    ["suspended", "active"], ["suspended", "revoked"], ["suspended", "converted"],
    ["expired", "active"], ["expired", "revoked"], ["expired", "converted"],
  ] as const;
  it.each(allowed)("allows %s -> %s", (from, to) => expect(canTransitionDemoStatus(from, to)).toBe(true));
  it.each([["revoked", "active"], ["revoked", "converted"], ["converted", "active"], ["converted", "suspended"], ["active", "configured"], ["unknown", "active"]])(
    "rejects %s -> %s", (from, to) => expect(canTransitionDemoStatus(from, to)).toBe(false),
  );
  it("throws a stable transition code", () => expect(() => assertDemoStatusTransition("revoked", "active")).toThrow("DEMO_TRANSITION_NOT_ALLOWED"));
  it("requires a normalized suspension/revocation reason", () => {
    expect(normalizeDemoLifecycleReason("  motivo   valido ")).toBe("motivo valido");
    expect(normalizeDemoLifecycleReason(" ")).toBeNull();
    expect(normalizeDemoLifecycleReason("x")).toBeNull();
  });
  it.each([1, 7, 30])("accepts reactivation duration %i", (value) => expect(normalizeDemoReactivationDuration(value)).toBe(value));
  it.each([0, -1, 31, 1.5, "7"])("rejects reactivation duration %s", (value) => expect(normalizeDemoReactivationDuration(value)).toBeNull());
  it("calculates the new expiration server-side", () => expect(calculateDemoExpiration(new Date("2026-07-15T12:00:00Z"), 7).toISOString()).toBe("2026-07-22T12:00:00.000Z"));
  it("exposes actions only for mutable lifecycle states", () => {
    expect(getDemoLifecycleActions("active")).toEqual(["suspend_demo", "revoke_demo", "convert_demo"]);
    expect(getDemoLifecycleActions("suspended")).toContain("reactivate_demo");
    expect(getDemoLifecycleActions("expired")).toContain("reactivate_demo");
    expect(getDemoLifecycleActions("revoked")).toEqual([]);
    expect(getDemoLifecycleActions("converted")).toEqual([]);
  });
  it("compares cron secrets without accepting missing or partial values", () => {
    expect(safeEqualSecret("secret", "secret")).toBe(true);
    expect(safeEqualSecret("secret", "other")).toBe(false);
    expect(safeEqualSecret(null, "secret")).toBe(false);
    expect(safeEqualSecret("", undefined)).toBe(false);
  });
});
