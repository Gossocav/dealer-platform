import { describe, expect, it } from "vitest";
import {
  VEHICLE_LIFECYCLE_STATES,
  isTransitionAllowed,
  type VehicleLifecycleState,
} from "./vehicle-state-machine";

describe("vehicle state machine", () => {
  // The dealer-facing form only offers draft and published, so every state
  // must be able to reach them -- otherwise a vehicle gets stuck unsaveable.
  for (const from of VEHICLE_LIFECYCLE_STATES) {
    for (const to of ["draft", "published"] as VehicleLifecycleState[]) {
      if (from === to) continue;

      it(`allows ${from} -> ${to}`, () => {
        expect(isTransitionAllowed(from, to)).toBe(true);
      });
    }
  }

  it("keeps the pipeline transitions that are not draft/published", () => {
    expect(isTransitionAllowed("published", "sold")).toBe(true);
    expect(isTransitionAllowed("sold", "delivered")).toBe(true);
    expect(isTransitionAllowed("in_review", "ready_to_publish")).toBe(true);
  });

  it("still forbids transitions that skip the pipeline", () => {
    expect(isTransitionAllowed("draft", "sold")).toBe(false);
    expect(isTransitionAllowed("draft", "delivered")).toBe(false);
    expect(isTransitionAllowed("archived", "sold")).toBe(false);
  });

  it("never allows a state to transition to itself", () => {
    for (const state of VEHICLE_LIFECYCLE_STATES) {
      expect(isTransitionAllowed(state, state)).toBe(false);
    }
  });
});
