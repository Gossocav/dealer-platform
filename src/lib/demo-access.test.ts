import { describe, expect, it } from "vitest";
import { getDemoFeatureBlockReason, getDemoStatusSummary } from "./demo-access";

describe("demo access helpers", () => {
  it("marks an active demo as writable within limits", () => {
    const context = getDemoStatusSummary({
      accountType: "demo",
      demoStatus: "active",
      demoStartedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      demoExpiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      vehicleCount: 3,
      leadCount: 4,
      userCount: 1,
    });

    expect(context.isDemo).toBe(true);
    expect(context.isDemoActive).toBe(true);
    expect(context.canWrite).toBe(true);
    expect(context.daysRemaining).toBeGreaterThan(0);
    expect(context.usage.vehicle).toBe(3);
    expect(getDemoFeatureBlockReason(context, "vehicle")).toBeNull();
  });

  it("blocks write access when the demo is expired", () => {
    const context = getDemoStatusSummary({
      accountType: "demo",
      demoStatus: "expired",
      demoStartedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      demoExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      vehicleCount: 2,
      leadCount: 3,
      userCount: 1,
    });

    expect(context.isDemoExpired).toBe(true);
    expect(context.canWrite).toBe(false);
    expect(getDemoFeatureBlockReason(context, "vehicle")).toEqual({ code: "DEMO_EXPIRED", message: "La demo e scaduta. Non e possibile eseguire operazioni di scrittura." });
  });

  it("allows standard paid accounts to write without demo limits", () => {
    const context = getDemoStatusSummary({
      accountType: "paid",
      demoStatus: "converted",
      demoStartedAt: null,
      demoExpiresAt: null,
      vehicleCount: 12,
      leadCount: 25,
      userCount: 2,
    });

    expect(context.isDemo).toBe(false);
    expect(context.canWrite).toBe(true);
    expect(getDemoFeatureBlockReason(context, "vehicle")).toBeNull();
  });

  it("blocks vehicle writes once the demo limit is reached", () => {
    const context = getDemoStatusSummary({
      accountType: "demo",
      demoStatus: "active",
      demoStartedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      demoExpiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      vehicleCount: 10,
      leadCount: 2,
      userCount: 1,
    });

    expect(getDemoFeatureBlockReason(context, "vehicle")).toEqual({ code: "DEMO_VEHICLE_LIMIT_REACHED", message: "Hai raggiunto il limite massimo di 10 veicoli per la demo." });
  });

  it("blocks write access for demo features that are explicitly disabled", () => {
    const context = getDemoStatusSummary({
      accountType: "demo",
      demoStatus: "active",
      demoStartedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      demoExpiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      vehicleCount: 2,
      leadCount: 2,
      userCount: 1,
    });

    expect(getDemoFeatureBlockReason(context, "export")).toEqual({ code: "DEMO_EXPORT_NOT_ALLOWED", message: "L'esportazione non e disponibile nella demo." });
  });

  it("blocks sending email for demo accounts", () => {
    const context = getDemoStatusSummary({
      accountType: "demo",
      demoStatus: "active",
      demoStartedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      demoExpiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      vehicleCount: 2,
      leadCount: 2,
      userCount: 1,
    });

    expect(getDemoFeatureBlockReason(context, "email")).toEqual({ code: "DEMO_FEATURE_NOT_AVAILABLE", message: "Questa funzione e disponibile nella versione completa." });
  });

  it("allows email for paid accounts", () => {
    const context = getDemoStatusSummary({
      accountType: "paid",
      demoStatus: "converted",
      demoStartedAt: null,
      demoExpiresAt: null,
      vehicleCount: 12,
      leadCount: 25,
      userCount: 2,
    });

    expect(getDemoFeatureBlockReason(context, "email")).toBeNull();
  });
});
