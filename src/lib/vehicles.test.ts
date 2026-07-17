import { describe, expect, it } from "vitest";
import { applyPriceBandFilters, extractVehicleImagePath, normalizeVehicleTraction } from "./vehicles";

describe("normalizeVehicleTraction", () => {
  it("normalizes common traction aliases", () => {
    expect(normalizeVehicleTraction("AWD")).toBe("Integrale 4x4");
    expect(normalizeVehicleTraction("trazione anteriore")).toBe("Anteriore");
    expect(normalizeVehicleTraction("rear wheel drive")).toBe("Posteriore");
  });
});

describe("extractVehicleImagePath", () => {
  it("extracts Supabase and relative storage paths", () => {
    expect(
      extractVehicleImagePath(
        "https://demo.supabase.co/storage/v1/object/public/vehicle-images/dealer/car.jpg"
      )
    ).toBe("dealer/car.jpg");

    expect(extractVehicleImagePath("vehicle-images/dealer/car.jpg")).toBe("dealer/car.jpg");
  });
});

describe("applyPriceBandFilters", () => {
  it("returns the expected min/max bounds for configured price bands", () => {
    expect(applyPriceBandFilters({ minPrice: null, maxPrice: null }, "20001-30000")).toEqual({
      minPrice: 20001,
      maxPrice: 30000,
    });
  });
});