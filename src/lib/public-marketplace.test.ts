import { describe, expect, it } from "vitest";
import { isMarketplaceVehiclePublishable, resolveVehicleLabel } from "./public-marketplace";

describe("isMarketplaceVehiclePublishable", () => {
  it("allows published vehicles from approved or active dealers", () => {
    expect(isMarketplaceVehiclePublishable({ published: true, status: "published", dealerStatus: "approved" })).toBe(true);
    expect(isMarketplaceVehiclePublishable({ published: true, status: "published", dealerStatus: "active" })).toBe(true);
  });

  it("blocks unpublished vehicles and non-publishable dealer states", () => {
    expect(isMarketplaceVehiclePublishable({ published: false, status: "published", dealerStatus: "approved" })).toBe(false);
    expect(isMarketplaceVehiclePublishable({ published: true, status: "draft", dealerStatus: "approved" })).toBe(false);
    expect(isMarketplaceVehiclePublishable({ published: true, status: "published", dealerStatus: "rejected" })).toBe(false);
    expect(isMarketplaceVehiclePublishable({ published: true, status: "published", dealerStatus: "suspended" })).toBe(false);
  });
});

describe("resolveVehicleLabel", () => {
  it("fixes a real-world lowercase trim (Alfa Romeo Stelvio 'sprint')", () => {
    expect(resolveVehicleLabel({ brand: "Alfa Romeo", model: "Stelvio", version: "sprint" })).toBe(
      "Alfa Romeo Stelvio Sprint"
    );
  });

  it("fixes a real-world all-caps brand + trim, keeping the short model acronym (Porsche 'PORSCHE GT3 TURBO')", () => {
    expect(resolveVehicleLabel({ brand: "PORSCHE", model: "GT3", version: "TURBO" })).toBe("Porsche GT3 Turbo");
  });

  it("leaves already-mixed-case words untouched", () => {
    expect(resolveVehicleLabel({ brand: "Volkswagen", model: "Golf", version: "GTI" })).toBe("Volkswagen Golf GTI");
  });

  it("keeps short all-caps brand acronyms as-is (BMW, KIA)", () => {
    expect(resolveVehicleLabel({ brand: "BMW", model: "X5", version: null })).toBe("BMW X5");
    expect(resolveVehicleLabel({ brand: "KIA", model: "Sportage", version: null })).toBe("KIA Sportage");
  });

  it("falls back to 'Veicolo' when every field is empty", () => {
    expect(resolveVehicleLabel({ brand: null, model: null, version: null })).toBe("Veicolo");
  });

  // Un'importazione aveva scritto "Hyundai Tucson" anche nella versione:
  // l'intestazione mostrava "Hyundai Tucson Hyundai Tucson".
  it("drops the version when it duplicates brand + model entirely", () => {
    expect(resolveVehicleLabel({ brand: "Hyundai", model: "Tucson", version: "Hyundai Tucson" })).toBe(
      "Hyundai Tucson"
    );
    expect(resolveVehicleLabel({ brand: "Hyundai", model: "Tucson", version: "hyundai tucson" })).toBe(
      "Hyundai Tucson"
    );
  });

  it("keeps only the real trim when the version repeats brand + model as a prefix", () => {
    expect(resolveVehicleLabel({ brand: "Hyundai", model: "Tucson", version: "Hyundai Tucson N Line" })).toBe(
      "Hyundai Tucson N Line"
    );
  });

  it("does not touch a version that legitimately reuses the model name", () => {
    expect(resolveVehicleLabel({ brand: "Hyundai", model: "Tucson", version: "Tucson N Line" })).toBe(
      "Hyundai Tucson Tucson N Line"
    );
  });
});
