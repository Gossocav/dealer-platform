import { createClient } from "@supabase/supabase-js";
import { formatRegistrationLabel } from "@/lib/vehicles";
import { cache } from "react";
import { normalizzaMisuraFoto } from "@/lib/dealer-site-import";

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

export const MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES = ["published"] as const;
export const MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES = ["approved", "active"] as const;

const MARKETPLACE_PUBLISHABLE_VEHICLE_STATUSES = new Set<string>(MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES);
const MARKETPLACE_PUBLISHABLE_DEALER_STATUSES = new Set<string>(MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES);

export function getMarketplaceStatusFilter() {
  return "status.eq.published,status.eq.pubblicato,status.eq.active,status.eq.attivo";
}

export function logMarketplaceQueryError(context: string, error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown marketplace query error";
  console.error("[marketplace] query failed", {
    context,
    errorMessage: message,
  });
}

export function isMarketplaceVehiclePublishable(input: { published?: boolean | null; status?: string | null; dealerStatus?: string | null }) {
  const published = Boolean(input.published);
  const vehicleStatus = String(input.status ?? "").trim().toLowerCase();
  const dealerStatus = String(input.dealerStatus ?? "").trim().toLowerCase();

  if (!published) {
    return false;
  }

  if (!vehicleStatus || !MARKETPLACE_PUBLISHABLE_VEHICLE_STATUSES.has(vehicleStatus)) {
    return false;
  }

  return dealerStatus.length > 0 && MARKETPLACE_PUBLISHABLE_DEALER_STATUSES.has(dealerStatus);
}

export function isMarketplacePublishableStatus(status: string | null | undefined) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) return false;

  if (normalized === "draft" || normalized === "bozza") {
    return false;
  }

  return MARKETPLACE_PUBLISHABLE_VEHICLE_STATUSES.has(normalized);
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
  registration_date?: string | null;
  registrationDate?: string | null;
  first_registration_date?: string | null;
  data_immatricolazione?: string | null;
  immatricolazione?: string | null;
  mileage: number | null;
  price: string | number | null;
  fuel: string | null;
  transmission: string | null;
  traction?: string | null;
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
  return firstDealer?.legal_name?.trim() || firstDealer?.name?.trim() || "Concessionaria";
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
  return createMarketplaceSlug(firstDealer?.legal_name ?? firstDealer?.name ?? firstDealer?.company_name ?? "concessionaria");
}

export function resolveDealerDisplayName(dealer: MarketplaceDealer | MarketplaceDealer[] | null | undefined) {
  const firstDealer = Array.isArray(dealer) ? dealer[0] : dealer;
  return firstDealer?.legal_name?.trim() || firstDealer?.name?.trim() || firstDealer?.business_name?.trim() || firstDealer?.company_name?.trim() || "Concessionaria";
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

/**
 * Dove si trova l'auto: sempre la sede della concessionaria.
 *
 * I veicoli hanno colonne city/province proprie, compilate a mano una per
 * auto, e non erano tenute in accordo con la sede: in produzione l'unico
 * veicolo pubblicato dichiarava Bard (AO) mentre la concessionaria sta a
 * Bagnolo in Piano (RE), 350 km piu' a sud. Chi cercava per distanza trovava
 * l'auto vicino a Reggio e poi leggeva Valle d'Aosta nell'annuncio.
 *
 * La ricerca per distanza misura dalla sede, quindi la sede e' anche l'unica
 * risposta che non contraddice i risultati.
 */
export function resolveDealerLocality(dealer: MarketplaceDealer | MarketplaceDealer[] | null | undefined) {
  const firstDealer = Array.isArray(dealer) ? dealer[0] : dealer;
  if (!firstDealer) return null;

  const city = String(firstDealer.city ?? "").trim();
  if (!city) return null;

  const province = String(firstDealer.province ?? "").trim();
  return province ? `${city} (${province})` : city;
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

// Dealer data entry / feed imports are inconsistently cased -- e.g. a real
// vehicle in production has version "sprint" (all lowercase) while its
// brand/model are properly cased, and another has brand "PORSCHE" and
// version "TURBO" (all uppercase), so the joined title read "Alfa Romeo
// Stelvio sprint" and "PORSCHE GT3 TURBO". Normalize each word instead of
// each field, so "Alfa Romeo" (already two properly-cased words) is left
// alone while "sprint"/"PORSCHE"/"TURBO" get Title Cased. Short all-caps
// tokens (<=4 chars, e.g. "GT3", "TDI", "AMG", "BMW") are assumed to be
// acronyms/trim codes and kept as-is rather than mangled into "Gt3"/"Bmw".
function normalizeVehicleLabelWord(word: string): string {
  if (!word) return word;

  const hasUpper = /[A-Z]/.test(word);
  const hasLower = /[a-z]/.test(word);

  if (hasUpper && hasLower) {
    return word;
  }

  if (hasUpper && !hasLower && word.length <= 4) {
    return word;
  }

  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function normalizeVehicleLabelField(value: string): string {
  return value
    .split(" ")
    .map((word) => normalizeVehicleLabelWord(word))
    .join(" ");
}

export function resolveVehicleLabel(vehicle: Pick<MarketplaceVehicle, "brand" | "model" | "version">) {
  const brand = vehicle.brand ? normalizeVehicleLabelField(String(vehicle.brand)) : "";
  const model = vehicle.model ? normalizeVehicleLabelField(String(vehicle.model)) : "";
  const brandModel = [brand, model].filter(Boolean).join(" ");

  const rawVersion = vehicle.version ? normalizeVehicleLabelField(String(vehicle.version)) : "";
  const version = stripDuplicatedBrandModel(rawVersion, brandModel);

  return [brandModel, version].filter(Boolean).join(" ") || "Veicolo";
}

// Alcune importazioni scrivono nella versione l'intero titolo trovato altrove
// (es. "Hyundai Tucson"), che duplica marca e modello gia' mostrati subito
// prima: qui si toglie quella parte ripetuta invece di stamparla due volte.
function stripDuplicatedBrandModel(version: string, brandModel: string): string {
  if (!version || !brandModel) return version;

  const versionLower = version.toLowerCase();
  const brandModelLower = brandModel.toLowerCase();

  if (versionLower === brandModelLower) return "";
  if (versionLower.startsWith(`${brandModelLower} `)) {
    return version.slice(brandModel.length).trim();
  }

  return version;
}

/**
 * L'immatricolazione come va letta da un italiano: 02/07/2026, non
 * 2026-07-02. La data arriva dal database nel formato ISO, e finiva sulle
 * card e sull'annuncio esattamente cosi' com'era.
 *
 * Usa la stessa funzione del pannello, quindi la data che il concessionario
 * vede nella sua scheda e quella che vede il cliente sull'annuncio sono
 * scritte allo stesso modo -- compreso il ripiego sull'anno per i veicoli
 * importati, che spesso portano solo quello.
 */
export function resolveVehicleRegistrationDate(vehicle: MarketplaceVehicle) {
  const source = vehicle as Record<string, unknown>;
  const candidates = [
    source.registration_date,
    source.registrationDate,
    source.first_registration_date,
    source.immatricolazione,
    source.data_immatricolazione,
  ];

  for (const value of candidates) {
    const normalized = String(value ?? "").trim();
    if (normalized.length > 0) {
      return formatRegistrationLabel({ registration_date: normalized }) ?? normalized;
    }
  }

  return formatRegistrationLabel({ year: source.year as string | number | null | undefined }) ?? "—";
}

export function getAppBaseUrl() {
  return (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function toAbsoluteUrl(pathname: string) {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${getAppBaseUrl()}${normalizedPath}`;
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
    // Come sopra: le foto importate quando la misura era piu' piccola
    // vengono chieste grandi lo stesso, senza toccare cio' che e' salvato.
    return `/api/image-proxy?url=${encodeURIComponent(normalizzaMisuraFoto(value))}`;
  }

  const storagePath = extractVehicleImagePath(value);

  if (!storagePath) {
    return null;
  }

   return resolveVehicleImageUrlByStoragePath(storagePath);
}

// The bucket-creation migration declares "vehicle-images" as public, but
// production's actual bucket is private (drifted from the migration --
// verified directly against the Storage API: `public: false`). getPublicUrl()
// alone builds a URL the browser can't actually load there ("Bucket not
// found"), which made the broken <img>'s alt text -- the vehicle's title --
// show up as visible text inside the photo box. createSignedUrl() works
// regardless of the bucket's public/private setting, so try that first and
// only fall back to the public URL if it fails.
/**
 * Chi firma gli indirizzi delle fotografie del marketplace.
 *
 * Firmava la chiave pubblica, e per farlo le serviva il permesso di leggere
 * l'archivio: lo stesso permesso che consentiva a chiunque, da internet, di
 * percorrere le cartelle dell'archivio e vedere come e' fatto dentro --
 * concessionaria, veicolo, nomi dei file. I file non si scaricavano, ma la
 * struttura era in chiaro.
 *
 * Adesso firma la chiave di servizio, che vive solo qui sul server (questo
 * modulo lo usano soltanto pagine server: nessun componente del browser lo
 * importa). Cosi' alla chiave pubblica si puo' togliere ogni accesso
 * all'archivio senza spegnere le foto del sito.
 */
const storageSigner = (() => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    // Senza chiave di servizio si resta com'era: meglio una firma fatta con
    // la chiave pubblica che un catalogo senza fotografie.
    return publicSupabase;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
})();

const resolveVehicleImageUrlByStoragePath = cache(async (storagePath: string) => {
  if (!storagePath) {
    return null;
  }

  const { data: signedData, error: signedError } = await storageSigner.storage
    .from("vehicle-images")
    .createSignedUrl(storagePath, 60 * 60);

  if (!signedError && signedData?.signedUrl) {
    return signedData.signedUrl;
  }

  const { data: publicUrlData } = storageSigner.storage.from("vehicle-images").getPublicUrl(storagePath);
  return publicUrlData.publicUrl || null;
});

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
