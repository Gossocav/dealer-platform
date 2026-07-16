import { describe, expect, it } from "vitest";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "./account-approval";

describe("resolveUserRoleFromMetadata", () => {
  it("authorizes admin from app_metadata.role", () => {
    const role = resolveUserRoleFromMetadata({ app_metadata: { role: "admin" } });

    expect(role).toBe("admin");
    expect(isPlatformAdminRole(role)).toBe(true);
  });

  it("authorizes platform_owner from app_metadata.role", () => {
    const role = resolveUserRoleFromMetadata({ app_metadata: { role: "platform_owner" } });

    expect(role).toBe("platform_owner");
    expect(isPlatformAdminRole(role)).toBe(true);
  });

  it("does not authorize admin from user_metadata when app_metadata is empty", () => {
    const role = resolveUserRoleFromMetadata({
      app_metadata: {},
      user_metadata: { role: "admin" },
    });

    expect(role).toBeNull();
    expect(isPlatformAdminRole(role)).toBe(false);
  });

  it("does not authorize when role is missing", () => {
    const role = resolveUserRoleFromMetadata({ app_metadata: {} });

    expect(role).toBeNull();
    expect(isPlatformAdminRole(role)).toBe(false);
  });

  it("does not authorize a non-admin role", () => {
    const role = resolveUserRoleFromMetadata({ app_metadata: { role: "dealer_member" } });

    expect(role).toBe("dealer_member");
    expect(isPlatformAdminRole(role)).toBe(false);
  });

  it("prefers app_metadata over conflicting user_metadata", () => {
    const role = resolveUserRoleFromMetadata({
      app_metadata: { role: "admin" },
      user_metadata: { role: "dealer_member" },
    });

    expect(role).toBe("admin");
    expect(isPlatformAdminRole(role)).toBe(true);
  });
});
