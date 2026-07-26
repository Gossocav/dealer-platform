import { describe, expect, it } from "vitest";
import {
  computeResizedDimensions,
  MAX_UPLOAD_IMAGE_DIMENSION,
  resizeImageForUpload,
  toJpegFileName,
} from "./image-resize";

describe("computeResizedDimensions", () => {
  it("downscales the real 4K phone photo that stalls the homepage", () => {
    // The Alfa Romeo Stelvio cover in production: 3840x2160, ~3.8 MB.
    const result = computeResizedDimensions(3840, 2160);

    expect(result.shouldResize).toBe(true);
    expect(result.width).toBe(MAX_UPLOAD_IMAGE_DIMENSION);
    expect(result.height).toBe(1080);
  });

  it("preserves the aspect ratio for portrait photos", () => {
    const result = computeResizedDimensions(2160, 3840);

    expect(result.shouldResize).toBe(true);
    expect(result.height).toBe(MAX_UPLOAD_IMAGE_DIMENSION);
    expect(result.width).toBe(1080);
  });

  it("never upscales an image that already fits", () => {
    // The Porsche cover in production: 960x638, already small.
    const result = computeResizedDimensions(960, 638);

    expect(result.shouldResize).toBe(false);
    expect(result.width).toBe(960);
    expect(result.height).toBe(638);
  });

  it("leaves an image exactly at the limit alone", () => {
    const result = computeResizedDimensions(1920, 1200);

    expect(result.shouldResize).toBe(false);
  });

  it("treats invalid dimensions as not resizable instead of producing NaN", () => {
    expect(computeResizedDimensions(0, 0).shouldResize).toBe(false);
    expect(computeResizedDimensions(Number.NaN, 100).shouldResize).toBe(false);
    expect(computeResizedDimensions(-100, 200).shouldResize).toBe(false);
  });
});

describe("toJpegFileName", () => {
  it("rewrites the extension so the stored name matches the JPEG output", () => {
    expect(toJpegFileName("IMG_1234.HEIC")).toBe("IMG_1234.jpg");
    expect(toJpegFileName("foto.png")).toBe("foto.jpg");
    expect(toJpegFileName("auto.jpeg")).toBe("auto.jpg");
  });

  it("handles names with dots and names with no extension", () => {
    expect(toJpegFileName("alfa.romeo.stelvio.jpeg")).toBe("alfa.romeo.stelvio.jpg");
    expect(toJpegFileName("senza-estensione")).toBe("senza-estensione.jpg");
  });

  it("falls back to a usable name for empty input", () => {
    expect(toJpegFileName("")).toBe("foto.jpg");
    expect(toJpegFileName("   ")).toBe("foto.jpg");
  });
});

// These run under vitest's node environment, where `window` is undefined, so
// they cover the "no browser image APIs available" branch specifically: the
// contract is that the caller always gets a usable File back and the upload
// proceeds. The in-browser decode/canvas failures take the same escape route
// via the function's try/catch, but are not exercised here -- the actual
// pixel resizing needs a real browser and is verified by uploading a photo.
describe("resizeImageForUpload (without browser image APIs)", () => {
  it("returns non-image files untouched", async () => {
    const pdf = new File(["x"], "documento.pdf", { type: "application/pdf" });

    await expect(resizeImageForUpload(pdf)).resolves.toBe(pdf);
  });

  it("returns the original file instead of throwing, so an upload is never blocked", async () => {
    const image = new File(["fake-bytes"], "foto.jpg", { type: "image/jpeg" });

    await expect(resizeImageForUpload(image)).resolves.toBe(image);
  });
});
