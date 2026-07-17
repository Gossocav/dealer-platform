import { describe, expect, it } from "vitest";
import {
  VEHICLE_LIFECYCLE_STATES,
  evaluateVehicleStateTransition,
  getAllowedTransitions,
  getForbiddenTransitions,
  getTransitionRule,
  getVehicleStateLabel,
  normalizeVehicleLifecycleState,
  resolveVehicleLifecycleState,
} from "./vehicle-state-machine";

describe("vehicle-state-machine", () => {
  it("defines all enterprise lifecycle states", () => {
    expect(VEHICLE_LIFECYCLE_STATES).toEqual([
      "draft",
      "in_acquisition",
      "in_preparation",
      "in_photography",
      "in_review",
      "ready_to_publish",
      "published",
      "reserved",
      "in_negotiation",
      "sold",
      "delivered",
      "archived",
    ]);
  });

  it("allows expected transitions and blocks forbidden ones", () => {
    expect(getAllowedTransitions("draft")).toContain("in_acquisition");
    expect(getAllowedTransitions("draft")).toContain("ready_to_publish");
    expect(getAllowedTransitions("ready_to_publish")).toContain("published");
    expect(getAllowedTransitions("published")).toContain("archived");
    expect(getAllowedTransitions("sold")).toContain("delivered");

    expect(getForbiddenTransitions("draft")).toContain("sold");
    expect(getForbiddenTransitions("sold")).toContain("draft");
    expect(getForbiddenTransitions("archived")).toContain("published");
    expect(getForbiddenTransitions("published")).toContain("delivered");
  });

  it("supports required CRUD transition scenarios", () => {
    expect(getAllowedTransitions("draft")).toContain("ready_to_publish");
    expect(getAllowedTransitions("ready_to_publish")).toContain("published");
    expect(getAllowedTransitions("published")).toContain("archived");

    expect(getForbiddenTransitions("sold")).toContain("draft");
    expect(getForbiddenTransitions("archived")).toContain("published");
  });

  it("returns transition metadata with permissions, events and side effects", () => {
    const rule = getTransitionRule("ready_to_publish", "published");

    expect(rule).not.toBeNull();
    expect(rule?.requiredPermissions).toContain("vehicle.publish");
    expect(rule?.events).toContain("vehicle.published");
    expect(rule?.sideEffects).toContain("inventory.marketplace.visibility.enable");
  });

  it("denies transitions when permissions are missing", () => {
    const evaluation = evaluateVehicleStateTransition("ready_to_publish", "published", ["vehicle.state.update"]);

    expect(evaluation.allowed).toBe(false);
    expect(evaluation.reasonCode).toBe("missing_permissions");
    expect(evaluation.missingPermissions).toContain("vehicle.publish");
  });

  it("allows transitions when required permissions are granted", () => {
    const evaluation = evaluateVehicleStateTransition("ready_to_publish", "published", [
      "vehicle.state.update",
      "vehicle.publish",
    ]);

    expect(evaluation.allowed).toBe(true);
    expect(evaluation.reasonCode).toBeNull();
    expect(evaluation.events).toContain("vehicle.state.changed.published");
  });

  it("keeps backward compatibility for legacy statuses", () => {
    expect(normalizeVehicleLifecycleState("review")).toBe("in_review");
    expect(normalizeVehicleLifecycleState("published")).toBe("published");
    expect(resolveVehicleLifecycleState(null, true)).toBe("published");
    expect(resolveVehicleLifecycleState("", false)).toBe("draft");
  });

  it("exposes italian labels for all states", () => {
    expect(getVehicleStateLabel("in_preparation")).toBe("In preparazione");
    expect(getVehicleStateLabel("delivered")).toBe("Consegnato");
    expect(getVehicleStateLabel("archived")).toBe("Archiviato");
  });
});
