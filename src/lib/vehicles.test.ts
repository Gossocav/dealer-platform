import { describe, expect, it } from "vitest";
import { validateVehicleStatusTransitionForCrud } from "./vehicles";

describe("CRUD transition (the path the vehicle form uses)", () => {
  it("allows Venduto -> Pubblicato (the Alfa Romeo Stelvio case)", () => {
    const result = validateVehicleStatusTransitionForCrud({
      fromStatus: "sold",
      fromPublished: false,
      toStatus: "published",
      toPublished: true,
    });

    expect(result.allowed).toBe(true);
    expect(result.message).toBeNull();
    expect(result.nextStatus).toBe("published");
    expect(result.nextPublished).toBe(true);
  });

  it("allows Venduto -> Bozza and keeps it unpublished", () => {
    const result = validateVehicleStatusTransitionForCrud({
      fromStatus: "sold",
      toStatus: "draft",
    });

    expect(result.allowed).toBe(true);
    expect(result.nextPublished).toBe(false);
  });

  it("allows In revisione and Archiviato back to Pubblicato", () => {
    expect(validateVehicleStatusTransitionForCrud({ fromStatus: "review", toStatus: "published" }).allowed).toBe(true);
    expect(validateVehicleStatusTransitionForCrud({ fromStatus: "archived", toStatus: "published" }).allowed).toBe(true);
  });
});
