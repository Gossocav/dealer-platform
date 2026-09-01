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

  // Dal 31/08/2026 una bozza si puo' vendere: capita di vendere una vettura
  // prima di averla pubblicata -- un cliente che passa in concessionaria e la
  // compra dal piazzale. Senza quel passaggio, l'unico modo di registrare
  // quella vendita sarebbe stato pubblicare prima l'annuncio di un'auto gia'
  // venduta.
  it("allows selling a draft, but not delivering one", () => {
    expect(isTransitionAllowed("draft", "sold")).toBe(true);
    // "consegnata" resta il passo dopo "venduta": ci si arriva da li'.
    expect(isTransitionAllowed("draft", "delivered")).toBe(false);
  });

  it("still forbids transitions that skip the pipeline", () => {
    // Archiviato e' terminale: da li' non si vende piu' niente.
    expect(isTransitionAllowed("archived", "sold")).toBe(false);
    expect(isTransitionAllowed("in_acquisition", "sold")).toBe(false);
  });

  it("never allows a state to transition to itself", () => {
    for (const state of VEHICLE_LIFECYCLE_STATES) {
      expect(isTransitionAllowed(state, state)).toBe(false);
    }
  });
});
