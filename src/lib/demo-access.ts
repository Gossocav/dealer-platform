export type DemoAccountType = "demo" | "paid" | "internal" | string;
export type DemoStatus = "active" | "expired" | "converted" | "revoked" | string;

export type DemoFeatureKey = "vehicle" | "lead" | "user" | "export" | "import" | "billing" | "subscription" | "admin" | "integration" | "write";

import type { SupabaseClient } from "@supabase/supabase-js";

export type DemoAccessContext = {
  dealerId: string | null;
  accountType: DemoAccountType | null;
  demoStatus: DemoStatus | null;
  demoStartedAt: string | null;
  demoExpiresAt: string | null;
  isDemo: boolean;
  isDemoActive: boolean;
  isDemoExpired: boolean;
  daysRemaining: number;
  canRead: boolean;
  canWrite: boolean;
  usage: {
    vehicle: number;
    lead: number;
    user: number;
  };
  featureLimits: Record<string, number | null>;
};

export type DemoFeatureBlock = {
  code: string;
  message: string;
};

export const DEMO_FULL_VERSION_MESSAGE = "Questa funzione e disponibile nella versione completa.";

export const DEMO_LIMITS = {
  vehicles: 10,
  leads: 20,
  users: 1,
  exports: 0,
  imports: 0,
  billing: 0,
  subscriptions: 0,
  admin: 0,
  integrations: 0,
} as const;

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeAccountType(value: string | null | undefined) {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeDemoStatus(value: string | null | undefined) {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : null;
}

export async function resolveDemoAccessContext(
  supabase: SupabaseClient,
  dealerId: string | null | undefined,
  options?: {
    vehicleCount?: number | null;
    leadCount?: number | null;
    userCount?: number | null;
  }
): Promise<DemoAccessContext> {
  const normalizedDealerId = String(dealerId ?? "").trim();

  if (!normalizedDealerId) {
    return getDemoStatusSummary({
      dealerId: null,
      accountType: null,
      demoStatus: null,
      demoStartedAt: null,
      demoExpiresAt: null,
      vehicleCount: options?.vehicleCount ?? 0,
      leadCount: options?.leadCount ?? 0,
      userCount: options?.userCount ?? 0,
    });
  }

  const { data, error } = await supabase
    .from("dealers")
    .select("id, account_type, demo_status, demo_started_at, demo_expires_at")
    .eq("id", normalizedDealerId)
    .maybeSingle<{
      id: string | null;
      account_type: string | null;
      demo_status: string | null;
      demo_started_at: string | null;
      demo_expires_at: string | null;
    }>();

  if (error || !data) {
    return getDemoStatusSummary({
      dealerId: normalizedDealerId,
      accountType: null,
      demoStatus: null,
      demoStartedAt: null,
      demoExpiresAt: null,
      vehicleCount: options?.vehicleCount ?? 0,
      leadCount: options?.leadCount ?? 0,
      userCount: options?.userCount ?? 0,
    });
  }

  return getDemoStatusSummary({
    dealerId: data.id,
    accountType: data.account_type,
    demoStatus: data.demo_status,
    demoStartedAt: data.demo_started_at,
    demoExpiresAt: data.demo_expires_at,
    vehicleCount: options?.vehicleCount ?? 0,
    leadCount: options?.leadCount ?? 0,
    userCount: options?.userCount ?? 0,
  });
}

export function getDemoStatusSummary(input: {
  dealerId?: string | null;
  accountType?: string | null;
  demoStatus?: string | null;
  demoStartedAt?: string | null;
  demoExpiresAt?: string | null;
  vehicleCount?: number;
  leadCount?: number;
  userCount?: number;
}): DemoAccessContext {
  const accountType = normalizeAccountType(input.accountType);
  const demoStatus = normalizeDemoStatus(input.demoStatus);
  const isDemo = accountType === "demo";
  const demoStartedAt = input.demoStartedAt ?? null;
  const demoExpiresAt = input.demoExpiresAt ?? null;
  const now = Date.now();
  const expiresAt = demoExpiresAt ? Date.parse(demoExpiresAt) : Number.NaN;
  const hasExpiry = Number.isFinite(expiresAt);
  const isDemoExpired = isDemo && hasExpiry ? now > expiresAt : false;
  const isDemoRevoked = isDemo && demoStatus === "revoked";
  const isDemoActive = isDemo && demoStatus === "active" && !isDemoExpired && !isDemoRevoked;
  const daysRemaining = hasExpiry ? Math.max(0, Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24))) : 0;

  const vehicleUsed = Math.max(0, input.vehicleCount ?? 0);
  const leadUsed = Math.max(0, input.leadCount ?? 0);
  const userUsed = Math.max(0, input.userCount ?? 0);
  const canWrite = !isDemo || (isDemoActive && !isDemoExpired && !isDemoRevoked);
  const canRead = true;

  return {
    dealerId: input.dealerId ?? null,
    accountType,
    demoStatus,
    demoStartedAt,
    demoExpiresAt,
    isDemo,
    isDemoActive,
    isDemoExpired,
    daysRemaining,
    canRead,
    canWrite,
    usage: {
      vehicle: vehicleUsed,
      lead: leadUsed,
      user: userUsed,
    },
    featureLimits: {
      vehicle: DEMO_LIMITS.vehicles,
      lead: DEMO_LIMITS.leads,
      user: DEMO_LIMITS.users,
      export: DEMO_LIMITS.exports,
      import: DEMO_LIMITS.imports,
      billing: DEMO_LIMITS.billing,
      subscription: DEMO_LIMITS.subscriptions,
      admin: DEMO_LIMITS.admin,
      integration: DEMO_LIMITS.integrations,
    },
  };
}

export function getDemoFeatureBlockReason(context: DemoAccessContext, feature: DemoFeatureKey): DemoFeatureBlock | null {
  if (!context.isDemo) {
    return null;
  }

  if (context.demoStatus === "revoked") {
    return {
      code: "DEMO_REVOKED",
      message: "La demo e stata revocata. Non e possibile eseguire operazioni di scrittura.",
    };
  }

  if (context.isDemoExpired || context.demoStatus === "expired") {
    return {
      code: "DEMO_EXPIRED",
      message: "La demo e scaduta. Non e possibile eseguire operazioni di scrittura.",
    };
  }

  if (feature === "vehicle" && context.featureLimits.vehicle !== null) {
    const used = context.usage.vehicle;
    if (used >= Number(context.featureLimits.vehicle)) {
      return {
        code: "DEMO_VEHICLE_LIMIT_REACHED",
        message: "Hai raggiunto il limite massimo di 10 veicoli per la demo.",
      };
    }
  }

  if (feature === "lead" && context.featureLimits.lead !== null) {
    const used = context.usage.lead;
    if (used >= Number(context.featureLimits.lead)) {
      return {
        code: "DEMO_LEAD_LIMIT_REACHED",
        message: "Hai raggiunto il limite massimo di 20 lead per la demo.",
      };
    }
  }

  if (feature === "user" && context.featureLimits.user !== null) {
    return {
      code: "DEMO_USERS_NOT_ALLOWED",
      message: DEMO_FULL_VERSION_MESSAGE,
    };
  }

  if (feature === "export") {
    return {
      code: "DEMO_EXPORT_NOT_ALLOWED",
      message: DEMO_FULL_VERSION_MESSAGE,
    };
  }

  if (feature === "import") {
    return {
      code: "DEMO_IMPORT_NOT_ALLOWED",
      message: DEMO_FULL_VERSION_MESSAGE,
    };
  }

  if (feature === "billing" || feature === "subscription") {
    return {
      code: "DEMO_FEATURE_NOT_AVAILABLE",
      message: DEMO_FULL_VERSION_MESSAGE,
    };
  }

  if (feature === "admin" || feature === "integration") {
    return {
      code: "DEMO_FEATURE_NOT_AVAILABLE",
      message: DEMO_FULL_VERSION_MESSAGE,
    };
  }

  return null;
}

export function assertDemoWriteAccess(context: DemoAccessContext, feature: DemoFeatureKey) {
  const block = getDemoFeatureBlockReason(context, feature);
  if (!block) {
    return null;
  }

  return block;
}
