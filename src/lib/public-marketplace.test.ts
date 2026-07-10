import { describe, expect, it } from "vitest";
import { isMarketplaceVehiclePublishable } from "./public-marketplace";

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
