import {
  evaluateVehicleStateTransition,
  getVehicleStateLabel,
  resolveVehicleLifecycleState,
  type VehicleLifecycleState,
  type VehiclePermission,
} from "@/lib/vehicle-state-machine";

export type VehicleStatus = VehicleLifecycleState | string;

export const VEHICLE_TRACTION_OPTIONS = ["Anteriore", "Posteriore", "Integrale 4x4"] as const;
export type VehicleTraction = (typeof VEHICLE_TRACTION_OPTIONS)[number];

export type VehicleImageRow = {
  id: string;
  image_url: string | null;
  position: number | null;
  is_cover: boolean | null;
};

export type VehicleRow = {
  id: string;
  dealer_id: string | null;
  brand: string | null;
  model: string | null;
  version: string | null;
  interior_type?: string | null;
  engine_size?: string | number | null;
  power_kw?: number | null;
  power_cv?: number | null;
  doors?: number | null;
  registration_date?: string | null;
  year: string | number | null;
  mileage: number | null;
  fuel: string | null;
  transmission: string | null;
  traction?: string | null;
  price: string | number | null;
  status: string | null;
  published: boolean | null;
  city: string | null;
  province: string | null;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
  vehicle_images?: VehicleImageRow[] | null;
};

export type VehicleListItem = {
  id: string;
  brand: string;
  model: string;
  version: string;
  year: string;
  priceValue: number;
  priceLabel: string;
  status: VehicleStatus;
  statusLabel: string;
  badge: string;
  fuel: string;
  transmission: string;
  mainImageUrl: string | null;
  leadCount: number;
  viewsCount: number;
  insertedAt: string;
  raw: VehicleRow;
};

export type VehicleFilters = {
  query: string;
  brand: string;
  model: string;
  fuel: string;
  transmission: string;
  status: string;
  priceBand: string;
};

export type VehicleSortField = "created_at" | "brand" | "model" | "year" | "price" | "status";

export type VehicleSortState = {
  field: VehicleSortField;
  direction: "asc" | "desc";
};

export type VehicleKpi = {
  id: string;
  label: string;
  value: string;
  delta: string;
};

type VehicleStateTransitionValidation = {
  allowed: boolean;
  fromState: VehicleLifecycleState;
  toState: VehicleLifecycleState;
  nextStatus: VehicleLifecycleState;
  nextPublished: boolean;
  message: string | null;
};

const CRUD_STATE_MACHINE_PERMISSIONS: ReadonlyArray<VehiclePermission> = [
  "vehicle.state.update",
  "vehicle.publish",
  "vehicle.reserve",
  "vehicle.negotiate",
  "vehicle.sell",
  "vehicle.deliver",
  "vehicle.archive",
];

export const defaultVehicleFilters: VehicleFilters = {
  query: "",
  brand: "all",
  model: "all",
  fuel: "all",
  transmission: "all",
  status: "all",
  priceBand: "all",
};

export const statusOptions = [
  { value: "all", label: "Tutti gli stati" },
  { value: "published", label: "Pubblicato" },
  { value: "draft", label: "Bozza" },
  { value: "sold", label: "Venduto" },
  { value: "review", label: "In revisione" },
] as const;

export const priceBandOptions = [
  { value: "all", label: "Tutti i prezzi" },
  { value: "0-20000", label: "Fino a EUR 20.000" },
  { value: "20001-30000", label: "EUR 20.001 - EUR 30.000" },
  { value: "30001-40000", label: "EUR 30.001 - EUR 40.000" },
  { value: "40001-plus", label: "Oltre EUR 40.000" },
] as const;

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function parsePrice(value: string | number | null | undefined): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function formatVehicleStatus(status: string | null | undefined, published?: boolean | null): string {
  return getVehicleStateLabel(resolveVehicleLifecycleState(status, published));
}

export function normalizeVehicleStatus(status: string | null | undefined, published?: boolean | null): VehicleStatus {
  return resolveVehicleLifecycleState(status, published);
}

function toVehiclePublishedFlag(state: VehicleLifecycleState) {
  return state === "published";
}

export function validateVehicleStatusTransitionForCrud(params: {
  fromStatus: string | null | undefined;
  fromPublished?: boolean | null;
  toStatus: string | null | undefined;
  toPublished?: boolean | null;
}): VehicleStateTransitionValidation {
  const fromState = resolveVehicleLifecycleState(params.fromStatus, params.fromPublished ?? null);
  const toState = resolveVehicleLifecycleState(params.toStatus, params.toPublished ?? null);

  if (fromState === toState) {
    return {
      allowed: true,
      fromState,
      toState,
      nextStatus: toState,
      nextPublished: toVehiclePublishedFlag(toState),
      message: null,
    };
  }

  const evaluation = evaluateVehicleStateTransition(fromState, toState, CRUD_STATE_MACHINE_PERMISSIONS);
  if (!evaluation.allowed) {
    return {
      allowed: false,
      fromState,
      toState,
      nextStatus: toState,
      nextPublished: toVehiclePublishedFlag(toState),
      message: `Transizione stato non consentita: ${getVehicleStateLabel(fromState)} -> ${getVehicleStateLabel(toState)}.`,
    };
  }

  return {
    allowed: true,
    fromState,
    toState,
    nextStatus: toState,
    nextPublished: toVehiclePublishedFlag(toState),
    message: null,
  };
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("it-IT");
}

export function safeText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : "-";
}

export function normalizeVehicleTraction(value: unknown): VehicleTraction | null {
  if (typeof value !== "string") {
    return null;
  }

  const raw = value.trim();
  if (!raw) {
    return null;
  }

  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!normalized) {
    return null;
  }

  if (normalized.includes("integrale") || normalized.includes("4x4") || normalized.includes("4wd") || normalized.includes("awd")) {
    return "Integrale 4x4";
  }

  if (normalized.includes("anteriore") || normalized.includes("fwd") || normalized.includes("front wheel")) {
    return "Anteriore";
  }

  if (normalized.includes("posteriore") || normalized.includes("rwd") || normalized.includes("rear wheel")) {
    return "Posteriore";
  }

  return null;
}

export function extractVehicleImagePath(value: string) {
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

      return value;
    } catch {
      return value;
    }
  }

  return value.replace(/^\/+/, "").replace(/^vehicle-images\//, "");
}

export function resolveCoverImage(images: VehicleImageRow[] | null | undefined): string | null {
  if (!Array.isArray(images) || images.length === 0) {
    return null;
  }

  const sorted = [...images].sort((a, b) => {
    const aCover = a.is_cover ? 1 : 0;
    const bCover = b.is_cover ? 1 : 0;
    if (aCover !== bCover) return bCover - aCover;

    const aPosition = typeof a.position === "number" ? a.position : Number.MAX_SAFE_INTEGER;
    const bPosition = typeof b.position === "number" ? b.position : Number.MAX_SAFE_INTEGER;
    return aPosition - bPosition;
  });

  for (const image of sorted) {
    const cover = String(image.image_url ?? "").trim();
    if (cover) {
      return cover;
    }
  }

  return null;
}

export function applyPriceBandFilters(
  minMax: { minPrice: number | null; maxPrice: number | null },
  priceBand: string
): { minPrice: number | null; maxPrice: number | null } {
  if (priceBand === "0-20000") return { minPrice: 0, maxPrice: 20000 };
  if (priceBand === "20001-30000") return { minPrice: 20001, maxPrice: 30000 };
  if (priceBand === "30001-40000") return { minPrice: 30001, maxPrice: 40000 };
  if (priceBand === "40001-plus") return { minPrice: 40001, maxPrice: null };
  return minMax;
}
