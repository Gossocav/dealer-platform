import { describe, expect, it } from "vitest";
import { findDuplicateVehicleId } from "./route";

function createSupabaseMock(options: { vinMatch?: string | null; fallbackRows?: Array<{ id: string }> }) {
  const state: {
    eqCalls: Array<[string, unknown]>;
    ilikeCalls: Array<[string, unknown]>;
    limitValue: number | null;
  } = {
    eqCalls: [],
    ilikeCalls: [],
    limitValue: null,
  };

  const chain: Record<string, unknown> = {
    select() {
      return chain;
    },
    eq(key: string, value: unknown) {
      state.eqCalls.push([key, value]);
      return chain;
    },
    ilike(key: string, value: unknown) {
      state.ilikeCalls.push([key, value]);
      return chain;
    },
    limit(value: number) {
      state.limitValue = value;
      return chain;
    },
    maybeSingle() {
      const hasVinFilter = state.eqCalls.some(([key]) => key === "vin");
      if (hasVinFilter) {
        return Promise.resolve({ data: options.vinMatch ? { id: options.vinMatch } : null });
      }

      const rows = options.fallbackRows ?? [];
      return Promise.resolve({ data: rows.length === 0 ? null : rows[0] });
    },
    then(resolve: (value: { data: Array<{ id: string }> }) => void) {
      const hasVinFilter = state.eqCalls.some(([key]) => key === "vin");
      if (hasVinFilter) {
        resolve({ data: [] });
        return;
      }

      resolve({ data: options.fallbackRows ?? [] });
    },
  };

  return {
    from() {
      return chain;
    },
  };
}

describe("findDuplicateVehicleId", () => {
  it("keeps VIN as the top priority", async () => {
    const supabase = createSupabaseMock({ vinMatch: "vehicle-vin-1" });

    const result = await findDuplicateVehicleId(supabase as never, "dealer-1", {
      vin: "ZFA12345678900001",
      brand: "Fiat",
      model: "Panda",
      version: "1.0",
      year: "2024",
      price: "",
      mileage: "",
      fuel: "",
      traction: "",
      transmission: "",
      color: "",
      description: "",
      status: "",
      images: "",
    });

    expect(result).toBe("vehicle-vin-1");
  });

  it("returns the fallback match only when it is unique", async () => {
    const supabase = createSupabaseMock({ fallbackRows: [{ id: "vehicle-fallback-1" }] });

    const result = await findDuplicateVehicleId(supabase as never, "dealer-1", {
      vin: "",
      brand: "Alfa Romeo",
      model: "Giulia",
      version: "Veloce",
      year: "2023",
      price: "",
      mileage: "",
      fuel: "",
      traction: "",
      transmission: "",
      color: "",
      description: "",
      status: "",
      images: "",
    });

    expect(result).toBe("vehicle-fallback-1");
  });

  it("returns null when the fallback match is ambiguous", async () => {
    const supabase = createSupabaseMock({ fallbackRows: [{ id: "vehicle-a" }, { id: "vehicle-b" }] });

    const result = await findDuplicateVehicleId(supabase as never, "dealer-1", {
      vin: "",
      brand: "BMW",
      model: "X1",
      version: "xDrive20d",
      year: "2023",
      price: "",
      mileage: "",
      fuel: "",
      traction: "",
      transmission: "",
      color: "",
      description: "",
      status: "",
      images: "",
    });

    expect(result).toBeNull();
  });
});
