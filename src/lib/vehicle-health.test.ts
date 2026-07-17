import { describe, expect, it } from "vitest";
import { evaluateVehicleHealth } from "@/lib/vehicle-health";
import type { VehicleRow } from "@/lib/vehicles";

function createBaseVehicle(overrides: Partial<VehicleRow> = {}): VehicleRow {
  return {
    id: "veh-1",
    dealer_id: "dealer-1",
    brand: "BMW",
    model: "Serie 3",
    version: "320d MSport",
    year: 2024,
    mileage: 18000,
    fuel: "Diesel",
    transmission: "Automatico",
    traction: "Posteriore",
    price: 39900,
    status: "ready_to_publish",
    published: false,
    city: "Milano",
    province: "MI",
    description:
      "Berlina premium in ottime condizioni, manutenzione regolare certificata, pacchetto ADAS completo e storico interventi disponibile.",
    created_at: "2026-07-01T10:00:00.000Z",
    updated_at: "2026-07-02T10:00:00.000Z",
    vehicle_images: [
      { id: "img-1", image_url: "a.jpg", position: 0, is_cover: true },
      { id: "img-2", image_url: "b.jpg", position: 1, is_cover: false },
      { id: "img-3", image_url: "c.jpg", position: 2, is_cover: false },
    ],
    ...overrides,
  };
}

describe("vehicle-health", () => {
  it("valuta correttamente un veicolo completo", () => {
    const result = evaluateVehicleHealth({
      vehicle: {
        ...createBaseVehicle(),
        engine_size: "1995",
        power_kw: 140,
      } as VehicleRow,
    });

    expect(result.publishable).toBe(true);
    expect(result.level === "eccellente" || result.level === "buono").toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("segnala mancanza immagini", () => {
    const result = evaluateVehicleHealth({
      vehicle: createBaseVehicle({ vehicle_images: [] }),
    });

    expect(result.publishable).toBe(false);
    expect(result.issues.some((issue) => issue.code === "images")).toBe(true);
  });

  it("segnala mancanza prezzo", () => {
    const result = evaluateVehicleHealth({
      vehicle: createBaseVehicle({ price: null }),
    });

    expect(result.publishable).toBe(false);
    expect(result.issues.some((issue) => issue.code === "price")).toBe(true);
  });

  it("segnala descrizione insufficiente", () => {
    const result = evaluateVehicleHealth({
      vehicle: createBaseVehicle({ description: "Descrizione breve" }),
    });

    expect(result.publishable).toBe(false);
    expect(result.issues.some((issue) => issue.code === "description")).toBe(true);
  });

  it("rileva veicolo non pubblicabile per stato", () => {
    const result = evaluateVehicleHealth({
      vehicle: createBaseVehicle({ status: "sold", published: false }),
    });

    expect(result.publishable).toBe(false);
    expect(result.issues.some((issue) => issue.code === "status")).toBe(true);
  });
});
