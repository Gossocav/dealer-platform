import { describe, expect, it } from "vitest";
import { buildVehicleSheetQr } from "./vehicle-sheet-qr";

const URL_ANNUNCIO = "https://keyauto.it/auto/3f1c2b9e-0000-4000-8000-000000000001";

describe("buildVehicleSheetQr", () => {
  it("produces path data for a listing URL", () => {
    const qr = buildVehicleSheetQr(URL_ANNUNCIO);

    expect(qr.path.length).toBeGreaterThan(0);
    expect(qr.path.startsWith("M")).toBe(true);
  });

  it("keeps the 4-module quiet zone the spec requires", () => {
    const qr = buildVehicleSheetQr(URL_ANNUNCIO);

    // Every drawn square must sit inside the quiet zone on both axes.
    const coordinates = [...qr.path.matchAll(/M(\d+) (\d+)h/g)].map(([, x, y]) => ({
      x: Number(x),
      y: Number(y),
    }));

    expect(coordinates.length).toBeGreaterThan(0);
    for (const { x, y } of coordinates) {
      expect(x).toBeGreaterThanOrEqual(4);
      expect(y).toBeGreaterThanOrEqual(4);
      expect(x).toBeLessThanOrEqual(qr.size - 5);
      expect(y).toBeLessThanOrEqual(qr.size - 5);
    }
  });

  it("reports a size that matches the modules plus both quiet zones", () => {
    const qr = buildVehicleSheetQr(URL_ANNUNCIO);
    const maxX = Math.max(...[...qr.path.matchAll(/M(\d+) \d+h/g)].map(([, x]) => Number(x)));

    // Widest dark module + its own width + the trailing quiet zone.
    expect(qr.size).toBeGreaterThanOrEqual(maxX + 1 + 4);
  });

  it("is deterministic for the same URL", () => {
    expect(buildVehicleSheetQr(URL_ANNUNCIO)).toEqual(buildVehicleSheetQr(URL_ANNUNCIO));
  });

  it("encodes different URLs differently", () => {
    const first = buildVehicleSheetQr("https://keyauto.it/auto/aaaa");
    const second = buildVehicleSheetQr("https://keyauto.it/auto/bbbb");

    expect(first.path).not.toBe(second.path);
  });

  it("grows the code rather than truncating a long URL", () => {
    const short = buildVehicleSheetQr("https://keyauto.it/auto/1");
    const long = buildVehicleSheetQr(`https://keyauto.it/auto/${"x".repeat(120)}`);

    expect(long.size).toBeGreaterThan(short.size);
  });

  it("refuses an empty URL instead of printing an unscannable box", () => {
    expect(() => buildVehicleSheetQr("")).toThrow(/URL mancante/i);
    expect(() => buildVehicleSheetQr("   ")).toThrow(/URL mancante/i);
  });
});
