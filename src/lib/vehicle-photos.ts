import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizzaMisuraFoto } from "@/lib/dealer-site-import";
import { extractVehicleImagePath, type VehicleImageRow } from "@/lib/vehicles";

export type ResolvedVehicleImage = VehicleImageRow & { previewUrl: string | null };

// Photos hosted outside Supabase (imported feeds) go through the proxy, which
// is what keeps mixed-content and hotlink-blocked sources rendering.
export function mapVehicleImageUrlForDisplay(imageUrl: string): string {
  if (!/^https?:\/\//i.test(imageUrl)) {
    return imageUrl;
  }

  try {
    const parsed = new URL(imageUrl);
    const isSupabaseDomain = parsed.hostname === "supabase.co" || parsed.hostname.endsWith(".supabase.co");

    if (isSupabaseDomain) {
      return imageUrl;
    }
  } catch {
    return imageUrl;
  }

  // Le fotografie importate prima di alzare la misura hanno nel database
  // l'indirizzo della versione piccola: si chiede quella grande qui, cosi'
  // valgono anche loro senza reimportare niente.
  return `/api/image-proxy?url=${encodeURIComponent(normalizzaMisuraFoto(imageUrl))}`;
}

// Production's "vehicle-images" bucket is actually private (drifted from the
// migration that declares it public -- verified against the Storage API).
// getPublicUrl() alone builds a URL the browser can't load there, which shows
// the broken <img>'s alt text instead of the photo. createSignedUrl() works
// regardless of the bucket's public/private setting, so it is tried first.
//
// This lived inline in the vehicle page until the printable sheet needed the
// same photos: two copies of a workaround for a production quirk is exactly
// the kind of thing that gets fixed in one place and not the other.
export function createVehiclePhotoResolver(supabase: SupabaseClient) {
  const cache = new Map<string, Promise<string | null>>();

  return function resolveVehiclePhotoUrl(rawValue: string): Promise<string | null> {
    const normalized = rawValue.trim();
    if (!normalized) {
      return Promise.resolve(null);
    }

    if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
      if (!normalized.includes(".supabase.co")) {
        return Promise.resolve(mapVehicleImageUrlForDisplay(normalized));
      }
    }

    const path = extractVehicleImagePath(normalized);
    if (!path) {
      return Promise.resolve(null);
    }

    const cached = cache.get(path);
    if (cached) {
      return cached;
    }

    const pending = (async () => {
      const { data: signed, error } = await supabase.storage.from("vehicle-images").createSignedUrl(path, 3600);
      if (!error && signed?.signedUrl) {
        return signed.signedUrl;
      }

      const { data: publicData } = supabase.storage.from("vehicle-images").getPublicUrl(path);
      return publicData.publicUrl || null;
    })();

    cache.set(path, pending);
    return pending;
  };
}

export async function resolveVehicleImageRows(
  supabase: SupabaseClient,
  rows: VehicleImageRow[] | null | undefined,
): Promise<ResolvedVehicleImage[]> {
  const resolve = createVehiclePhotoResolver(supabase);

  return Promise.all(
    (rows ?? []).map(async (row) => {
      const raw = String(row.image_url ?? "").trim();

      if (!raw) {
        return { ...row, previewUrl: null };
      }

      if (raw.startsWith("http://") || raw.startsWith("https://")) {
        if (raw.includes(".supabase.co")) {
          return { ...row, previewUrl: await resolve(raw) };
        }

        return { ...row, previewUrl: mapVehicleImageUrlForDisplay(raw) };
      }

      return { ...row, previewUrl: (await resolve(raw)) || raw };
    }),
  );
}

// The cover is what the dealer chose to lead with; position is the tiebreak,
// and the first photo is the fallback when neither is set.
export function pickCoverPreviewUrl(images: ResolvedVehicleImage[]): string | null {
  return images.find((image) => image.is_cover)?.previewUrl ?? images[0]?.previewUrl ?? null;
}
