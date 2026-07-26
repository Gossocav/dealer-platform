// Vehicle photos are uploaded straight from phones -- production has 3840x2160
// files of ~3.8 MB that get rendered into ~400px cards. Decoding one of those
// costs ~32 MB of bitmap memory and visibly stalls scrolling on the public
// pages. Downscaling once at upload time fixes it for every future view,
// without needing a paid image-transformation service.

export const MAX_UPLOAD_IMAGE_DIMENSION = 1920;
export const UPLOAD_IMAGE_QUALITY = 0.85;

/**
 * Longest-edge downscale that preserves the aspect ratio. Returns the original
 * dimensions when the image already fits, so we never upscale a small photo.
 */
export function computeResizedDimensions(
  width: number,
  height: number,
  maxDimension: number = MAX_UPLOAD_IMAGE_DIMENSION
): { width: number; height: number; shouldResize: boolean } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width, height, shouldResize: false };
  }

  const longestEdge = Math.max(width, height);
  if (longestEdge <= maxDimension) {
    return { width, height, shouldResize: false };
  }

  const scale = maxDimension / longestEdge;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    shouldResize: true,
  };
}

/** Output is always JPEG, so the stored name has to match the real content. */
export function toJpegFileName(originalName: string): string {
  const trimmed = String(originalName ?? "").trim() || "foto";
  const withoutExtension = trimmed.replace(/\.[^.]+$/, "");
  return `${withoutExtension || "foto"}.jpg`;
}

/**
 * Downscales an image file for upload. Never throws and never blocks an
 * upload: if anything about the browser path fails (unsupported format,
 * missing canvas support, decode error) the original file is returned so the
 * dealer's upload still goes through, just unoptimized.
 */
export async function resizeImageForUpload(
  file: File,
  maxDimension: number = MAX_UPLOAD_IMAGE_DIMENSION
): Promise<File> {
  if (typeof window === "undefined" || typeof createImageBitmap !== "function") {
    return file;
  }

  if (!file.type.startsWith("image/")) {
    return file;
  }

  let bitmap: ImageBitmap | null = null;

  try {
    // `imageOrientation: "from-image"` applies the EXIF rotation phone photos
    // carry; without it a portrait shot would be re-encoded sideways, since
    // the EXIF tag is dropped by the canvas round-trip.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    const { width, height, shouldResize } = computeResizedDimensions(bitmap.width, bitmap.height, maxDimension);

    if (!shouldResize) {
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      return file;
    }

    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", UPLOAD_IMAGE_QUALITY);
    });

    if (!blob) {
      return file;
    }

    // A pathological re-encode that ends up larger than the original is not
    // worth keeping.
    if (blob.size >= file.size) {
      return file;
    }

    return new File([blob], toJpegFileName(file.name), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
