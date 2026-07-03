import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
}

export const publicSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const MARKETPLACE_PUBLISHABLE_STATUSES = new Set([
  "published",
  "pubblicato",
  "active",
  "attivo",
]);

export function getMarketplaceStatusFilter() {
  return "status.is.null,status.eq.published,status.eq.pubblicato,status.eq.active,status.eq.attivo";
}

export function isMarketplacePublishableStatus(status: string | null | undefined) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (normalized === "draft" || normalized === "bozza") {
    return false;
  }

  return MARKETPLACE_PUBLISHABLE_STATUSES.has(normalized);
}

export type MarketplaceVehicleImage = {
  image_url: string | null;
  position: number | null;
  is_cover: boolean | null;
};

export type MarketplaceDealer = {
  id: string | null;
  name: string | null;
  business_name: string | null;
  company_name: string | null;
  logo_url: string | null;
  legal_name: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  zip_code: string | null;
  email: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  vat_number: string | null;
  website: string | null;
  description: string | null;
  opening_hours: string | null;
  social_links: string | null;
};

export type MarketplaceVehicle = {
  id: string;
  brand: string | null;
  model: string | null;
  version: string | null;
  interior_type: string | null;
  year: string | number | null;
  mileage: number | null;
  price: string | number | null;
  fuel: string | null;
  transmission: string | null;
  description: string | null;
  body_type: string | null;
  color: string | null;
  power_cv: number | null;
  doors: number | null;
  seats: number | null;
  warranty: string | null;
  availability: string | null;
  emission_class: string | null;
  province: string | null;
  city: string | null;
  status: string | null;
  created_at: string | null;
  dealer_id: string | null;
  dealers?: MarketplaceDealer | MarketplaceDealer[] | null;
  vehicle_images?: MarketplaceVehicleImage[] | null;
};

export function normalizeVehicleDealerName(dealer: MarketplaceDealer | MarketplaceDealer[] | null | undefined) {
  const firstDealer = Array.isArray(dealer) ? dealer[0] : dealer;
  return firstDealer?.name?.trim() || "Concessionaria";
}

export function createMarketplaceSlug(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "concessionaria";
}

export function resolveDealerSlug(dealer: MarketplaceDealer | MarketplaceDealer[] | null | undefined) {
  const firstDealer = Array.isArray(dealer) ? dealer[0] : dealer;
  return createMarketplaceSlug(firstDealer?.name ?? firstDealer?.company_name ?? firstDealer?.legal_name ?? "concessionaria");
}

export function resolveDealerDisplayName(dealer: MarketplaceDealer | MarketplaceDealer[] | null | undefined) {
  const firstDealer = Array.isArray(dealer) ? dealer[0] : dealer;
  return firstDealer?.name?.trim() || firstDealer?.business_name?.trim() || firstDealer?.company_name?.trim() || firstDealer?.legal_name?.trim() || "Concessionaria";
}

export function resolveDealerEmail(dealer: MarketplaceDealer | MarketplaceDealer[] | null | undefined) {
  const firstDealer = Array.isArray(dealer) ? dealer[0] : dealer;
  return firstDealer?.email?.trim() || null;
}

export function resolveDealerPhone(dealer: MarketplaceDealer | MarketplaceDealer[] | null | undefined) {
  const firstDealer = Array.isArray(dealer) ? dealer[0] : dealer;
  return firstDealer?.phone?.trim() || null;
}

export function resolveDealerWhatsAppPhone(dealer: MarketplaceDealer | MarketplaceDealer[] | null | undefined) {
  const firstDealer = Array.isArray(dealer) ? dealer[0] : dealer;
  return firstDealer?.whatsapp_phone?.trim() || null;
}

export function resolveDealerWebsite(dealer: MarketplaceDealer | MarketplaceDealer[] | null | undefined) {
  const firstDealer = Array.isArray(dealer) ? dealer[0] : dealer;
  return firstDealer?.website?.trim() || null;
}

export function resolveDealerLogo(dealer: MarketplaceDealer | MarketplaceDealer[] | null | undefined) {
  const firstDealer = Array.isArray(dealer) ? dealer[0] : dealer;
  return firstDealer?.logo_url?.trim() || null;
}

export function resolveDealerAddress(dealer: MarketplaceDealer | MarketplaceDealer[] | null | undefined) {
  const firstDealer = Array.isArray(dealer) ? dealer[0] : dealer;
  if (!firstDealer) {
    return null;
  }

  const cityValue = String(firstDealer.city ?? "").trim();
  const provinceValue = String(firstDealer.province ?? "").trim();
  const cityLine = cityValue.length > 0
    ? `${cityValue}${provinceValue.length > 0 ? ` (${provinceValue})` : ""}`
    : "";

  const composed = [
    String(firstDealer.address ?? "").trim(),
    String(firstDealer.zip_code ?? "").trim(),
    cityLine,
  ]
    .filter((value) => value.length > 0)
    .join(", ");

  return composed || null;
}

export function resolveDealerVatNumber(dealer: MarketplaceDealer | MarketplaceDealer[] | null | undefined) {
  const firstDealer = Array.isArray(dealer) ? dealer[0] : dealer;
  return firstDealer?.vat_number?.trim() || null;
}

export function resolveDealerDescription(dealer: MarketplaceDealer | MarketplaceDealer[] | null | undefined) {
  const firstDealer = Array.isArray(dealer) ? dealer[0] : dealer;
  return firstDealer?.description?.trim() || null;
}

export function resolveDealerOpeningHours(dealer: MarketplaceDealer | MarketplaceDealer[] | null | undefined) {
  const firstDealer = Array.isArray(dealer) ? dealer[0] : dealer;
  return firstDealer?.opening_hours?.trim() || null;
}

export function resolveDealerSocialLinks(dealer: MarketplaceDealer | MarketplaceDealer[] | null | undefined) {
  const firstDealer = Array.isArray(dealer) ? dealer[0] : dealer;
  const raw = String(firstDealer?.social_links ?? "").trim();
  if (!raw) {
    return [] as Array<{ label: string; url: string }>;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return Object.entries(parsed)
      .map(([label, url]) => ({ label: label.trim(), url: String(url ?? "").trim() }))
      .filter((item) => item.label.length > 0 && item.url.length > 0);
  } catch {
    return [] as Array<{ label: string; url: string }>;
  }
}

export function buildTelLink(phone: string | null | undefined) {
  const value = normalizePhoneDigits(phone);
  return value ? `tel:+${value}` : null;
}

export function buildWhatsAppLink(phone: string | null | undefined, message: string) {
  const value = normalizePhoneDigits(phone);
  if (!value) {
    return null;
  }

  return `https://wa.me/${value}?text=${encodeURIComponent(message)}`;
}

export function buildMailtoLink(email: string | null | undefined, subject: string, body: string) {
  const value = String(email ?? "").trim();
  if (!value) {
    return null;
  }

  return `mailto:${value}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function resolveVehicleImages(images?: MarketplaceVehicleImage[] | null) {
  if (!Array.isArray(images) || images.length === 0) {
    return [] as string[];
  }

  return [...images]
    .sort((a, b) => {
      const aCover = a.is_cover ? 1 : 0;
      const bCover = b.is_cover ? 1 : 0;
      if (aCover !== bCover) {
        return bCover - aCover;
      }

      const aPosition = typeof a.position === "number" ? a.position : Number.MAX_SAFE_INTEGER;
      const bPosition = typeof b.position === "number" ? b.position : Number.MAX_SAFE_INTEGER;
      return aPosition - bPosition;
    })
    .map((item) => String(item.image_url ?? "").trim())
    .filter((value) => value.length > 0);
}

export function resolveVehicleLabel(vehicle: Pick<MarketplaceVehicle, "brand" | "model" | "version">) {
  return [vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(" ") || "Veicolo";
}

export function formatMileage(value: number | null) {
  if (typeof value !== "number") return "-";
  return `${new Intl.NumberFormat("it-IT").format(value)} km`;
}

export function formatPrice(value: string | number | null) {
  if (value === null || value === undefined || value === "") return "-";

  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return String(value);
  }

  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatText(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : "-";
}

export async function resolveVehicleImageUrl(rawValue?: string | null) {
  const value = String(rawValue ?? "").trim();
  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value) && !isSupabaseStorageUrl(value)) {
    return `/api/image-proxy?url=${encodeURIComponent(value)}`;
  }

  const storagePath = extractVehicleImagePath(value);

  if (!storagePath) {
    return null;
  }

  const { data: signedData, error: signedError } = await publicSupabase.storage
    .from("vehicle-images")
    .createSignedUrl(storagePath, 60 * 60);

  if (!signedError && signedData?.signedUrl) {
    return signedData.signedUrl;
  }

  const { data: publicUrlData } = publicSupabase.storage.from("vehicle-images").getPublicUrl(storagePath);
  return publicUrlData.publicUrl || null;
}

function extractVehicleImagePath(value: string) {
  if (!value) return null;

  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const parsed = new URL(value);
      const publicPrefix = "/storage/v1/object/public/vehicle-images/";
      const signedPrefix = "/storage/v1/object/sign/vehicle-images/";

      if (parsed.pathname.includes(publicPrefix)) {
        const path = parsed.pathname.split(publicPrefix)[1];
        return path ? decodeURIComponent(path) : null;
      }

      if (parsed.pathname.includes(signedPrefix)) {
        const path = parsed.pathname.split(signedPrefix)[1];
        return path ? decodeURIComponent(path) : null;
      }

      return null;
    } catch {
      return null;
    }
  }

  return value.replace(/^\/+/, "").replace(/^vehicle-images\//, "");
}

function isSupabaseStorageUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.hostname === "supabase.co" || parsed.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

function normalizePhoneDigits(phone: string | null | undefined) {
  const rawValue = String(phone ?? "").trim();
  if (!rawValue) {
    return null;
  }

  const hasInternationalPrefix = rawValue.startsWith("+");
  const digits = rawValue.replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  if (hasInternationalPrefix) {
    return digits;
  }

  if (digits.startsWith("00")) {
    return digits.slice(2);
  }

  if (digits.startsWith("39")) {
    return digits;
  }

  return `39${digits}`;
}
