import { describe, expect, it } from "vitest";
import { extractVehicleImageUrls, MAX_VEHICLE_IMAGES } from "./vehicle-import";

describe("extractVehicleImageUrls", () => {
  it("extracts every URL from a normally-sized feed row", () => {
    const urls = extractVehicleImageUrls({
      images: "https://cdn.example.com/1.jpg,https://cdn.example.com/2.jpg;https://cdn.example.com/3.jpg",
    });

    expect(urls).toEqual([
      "https://cdn.example.com/1.jpg",
      "https://cdn.example.com/2.jpg",
      "https://cdn.example.com/3.jpg",
    ]);
  });

  it("caps a feed row at MAX_VEHICLE_IMAGES, keeping the first ones in order", () => {
    const many = Array.from({ length: 200 }, (_, index) => `https://cdn.example.com/${index}.jpg`);

    const urls = extractVehicleImageUrls({ images: many.join(",") });

    expect(urls).toHaveLength(MAX_VEHICLE_IMAGES);
    expect(urls[0]).toBe("https://cdn.example.com/0.jpg");
    expect(urls[urls.length - 1]).toBe(`https://cdn.example.com/${MAX_VEHICLE_IMAGES - 1}.jpg`);
  });

  it("deduplicates before applying the cap", () => {
    const urls = extractVehicleImageUrls({
      images: "https://cdn.example.com/1.jpg,https://cdn.example.com/1.jpg,https://cdn.example.com/2.jpg",
    });

    expect(urls).toEqual(["https://cdn.example.com/1.jpg", "https://cdn.example.com/2.jpg"]);
  });

  it("ignores non-http values and returns an empty list when there is nothing usable", () => {
    expect(extractVehicleImageUrls({ images: "not-a-url, also-not" })).toEqual([]);
    expect(extractVehicleImageUrls({ brand: "Audi" })).toEqual([]);
  });
});
