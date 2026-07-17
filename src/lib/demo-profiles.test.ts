import { describe, expect, it } from "vitest";
import {
  createDemoProfileSnapshot,
  getDemoProfileByCode,
  listEnabledDemoProfiles,
  normalizeDemoLimits,
  normalizeDemoMarketingServices,
  normalizeDemoModules,
  validateDemoProfileConfiguration,
} from "@/lib/demo-profiles";

describe("demo profiles engine", () => {
  it("rejects an unknown profile", () => {
    expect(validateDemoProfileConfiguration({ profileCode: "unknown" }).valid).toBe(false);
  });

  it("lists safe copies of base, pro and elite in order", () => {
    const first = listEnabledDemoProfiles();
    expect(first.map((profile) => profile.code)).toEqual(["base", "pro", "elite"]);
    first[0].modules.dashboard = false;
    first[0].mainFeatures.push("mutated");
    const second = listEnabledDemoProfiles();
    expect(second[0].modules.dashboard).toBe(true);
    expect(second[0].mainFeatures).not.toContain("mutated");
  });

  it("ignores unknown overrides", () => {
    expect(normalizeDemoModules("base", { unknown: true })?.dashboard).toBe(true);
    expect(normalizeDemoLimits("base", { unknown: 10 })?.max_users).toBe(2);
    expect(normalizeDemoMarketingServices("elite", { unknown: true })?.social_visibility).toBe(true);
  });

  it("rejects known module overrides with non boolean values", () => {
    const result = validateDemoProfileConfiguration({ profileCode: "base", moduleOverrides: { dashboard: "yes" } });
    expect(result.valid).toBe(false);
  });

  it("rejects negative numeric limits and invalid duration", () => {
    expect(validateDemoProfileConfiguration({ profileCode: "pro", limitOverrides: { max_users: -1 } }).valid).toBe(false);
    expect(validateDemoProfileConfiguration({ profileCode: "pro", durationDays: 31 }).valid).toBe(false);
  });

  it("keeps Base and Pro marketing services disabled", () => {
    for (const code of ["base", "pro"] as const) {
      const services = normalizeDemoMarketingServices(code, { social_visibility: true });
      expect(services && Object.values(services).some(Boolean)).toBe(false);
      expect(validateDemoProfileConfiguration({ profileCode: code, marketingServiceOverrides: { social_visibility: true } }).valid).toBe(false);
    }
  });

  it("rejects a client price different from the Elite catalog price", () => {
    expect(validateDemoProfileConfiguration({ profileCode: "elite", priceMonthly: 700 }).valid).toBe(false);
  });

  it("creates independent snapshots", () => {
    const snapshot = createDemoProfileSnapshot({ profileCode: "elite", createdAt: "2026-07-15T00:00:00.000Z" });
    const profile = getDemoProfileByCode("elite");
    expect(profile).not.toBeNull();
    if (!profile) return;
    profile.modules.dashboard = false;
    profile.limits.max_users = 0;
    profile.marketing_services.social_visibility = false;
    expect(snapshot.modules.dashboard).toBe(true);
    expect(snapshot.limits.max_users).toBe(10);
    expect(snapshot.marketingServices.social_visibility).toBe(true);
  });

  it("keeps email disabled for Elite", () => {
    const snapshot = createDemoProfileSnapshot({ profileCode: "elite" });
    expect(snapshot.modules.email_sending).toBe(false);
    expect(snapshot.limits.can_send_email).toBe(false);
  });
});
