import {
  DEMO_MODULE_KEYS,
  DEMO_LIMIT_KEYS,
  DEMO_MARKETING_SERVICE_KEYS,
  validateDemoProfileConfiguration,
  type DemoLimits,
  type DemoMarketingServices,
  type DemoModules,
  type DemoProfileCode,
} from "@/lib/demo-profiles";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DemoAccessErrorCode =
  | "DEMO_INACTIVE"
  | "DEMO_EXPIRED"
  | "DEMO_SUSPENDED"
  | "DEMO_REVOKED"
  | "DEMO_CONVERTED"
  | "DEMO_MODULE_DISABLED"
  | "DEMO_LIMIT_REACHED"
  | "DEMO_STORAGE_LIMIT_REACHED"
  | "DEMO_EMAIL_DISABLED"
  | "DEMO_CONTEXT_INVALID"
  | "DEMO_MEMBERSHIP_INVALID"
  | "DEMO_PROVISIONING_INCOMPLETE";

export type DemoAccessContext = {
  isDemo: boolean;
  accountType: string | null;
  demoStatus: string | null;
  profileCode: DemoProfileCode | null;
  dealerId: string | null;
  profileId: string | null;
  userId: string | null;
  membershipRole: string | null;
  membershipActive: boolean;
  startedAt: string | null;
  expiresAt: string | null;
  modules: DemoModules;
  limits: DemoLimits;
  marketingServices: DemoMarketingServices;
  canSendEmail: boolean;
  snapshotValid: boolean;
  provisioningComplete: boolean;
  tenantMatches: boolean;
  demoExpiresAt: string | null;
  daysRemaining: number;
  isDemoActive: boolean;
  isDemoExpired: boolean;
  canWrite: boolean;
  usage: { vehicle: number; lead: number; user: number };
};

export type DemoContextInput = {
  accountType: string | null; demoStatus: string | null; profileCode: DemoProfileCode | null;
  dealerId: string | null; profileId: string | null; userId: string | null;
  membershipRole: string | null; membershipActive: boolean; startedAt: string | null;
  expiresAt: string | null; provisioningComplete: boolean;
  tenantMatches: boolean;
  modules: unknown;
  limits: unknown;
  marketingServices: unknown;
};

const FALLBACK_MODULES = Object.fromEntries(DEMO_MODULE_KEYS.map((key) => [key, false])) as DemoModules;
const FALLBACK_LIMITS: DemoLimits = {
  max_users: 0, max_vehicles: 0, max_leads: 0, max_clients: 0,
  max_appointments: 0, max_storage_mb: 0, can_send_email: false,
  can_publish_marketplace: false, can_export_data: false, can_create_users: false,
  can_use_bulk_import: false,
};
const FALLBACK_MARKETING: DemoMarketingServices = {
  social_visibility: false, google_ads_management: false, monthly_marketing_report: false,
  meta_ads_management: false, dedicated_landing_page: false, local_seo: false,
};

const ERROR_MESSAGES: Record<DemoAccessErrorCode, string> = {
  DEMO_INACTIVE: "La Demo non è attiva.",
  DEMO_EXPIRED: "La Demo è scaduta. Contatta l’amministratore per proseguire.",
  DEMO_SUSPENDED: "La Demo è sospesa.",
  DEMO_REVOKED: "L’accesso Demo è stato revocato.",
  DEMO_CONVERTED: "La Demo è stata convertita in account cliente.",
  DEMO_MODULE_DISABLED: "Funzione non inclusa nel profilo Demo attivo.",
  DEMO_LIMIT_REACHED: "Hai raggiunto il limite previsto dal profilo Demo.",
  DEMO_STORAGE_LIMIT_REACHED: "Hai raggiunto il limite storage previsto dal profilo Demo.",
  DEMO_EMAIL_DISABLED: "L’invio email non è disponibile per il profilo Demo.",
  DEMO_CONTEXT_INVALID: "Contesto Demo non valido.",
  DEMO_MEMBERSHIP_INVALID: "Membership Demo non valida.",
  DEMO_PROVISIONING_INCOMPLETE: "Provisioning Demo incompleto.",
};

export class DemoAccessError extends Error {
  constructor(public readonly code: DemoAccessErrorCode, public readonly status: number) {
    super(ERROR_MESSAGES[code]);
    this.name = "DemoAccessError";
  }
  toResponseBody() { return { error: this.message, code: this.code }; }
}

export function demoAccessErrorFromUnknown(value: unknown): DemoAccessError | null {
  const message = String(value && typeof value === "object" && "message" in value ? (value as { message?: unknown }).message : value ?? "");
  const code = (Object.keys(ERROR_MESSAGES) as DemoAccessErrorCode[]).find((item) => message.includes(item));
  if (!code) return null;
  const status = code === "DEMO_EXPIRED" ? 410 : code.includes("LIMIT") ? 409 : code === "DEMO_CONTEXT_INVALID" || code === "DEMO_PROVISIONING_INCOMPLETE" ? 422 : 403;
  return new DemoAccessError(code, status);
}

export function demoAccessMessageFromUnknown(value: unknown, fallback: string) {
  return demoAccessErrorFromUnknown(value)?.message ?? fallback;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function buildDemoAccessContext(input: DemoContextInput): DemoAccessContext {
  const isDemo = String(input.accountType ?? "").toLowerCase() === "demo";
  const expiresAtMs = input.expiresAt ? Date.parse(input.expiresAt) : Number.NaN;
  const isDemoExpired = isDemo && (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now());
  const isDemoActive = isDemo && input.demoStatus === "active" && !isDemoExpired;
  const legacy = {
    demoExpiresAt: input.expiresAt,
    daysRemaining: Number.isFinite(expiresAtMs) ? Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 86_400_000)) : 0,
    isDemoActive,
    isDemoExpired,
    canWrite: !isDemo || isDemoActive,
    usage: { vehicle: 0, lead: 0, user: 0 },
  };
  if (!isDemo) {
    return {
      ...input, isDemo: false, snapshotValid: true, canSendEmail: true,
      modules: { ...FALLBACK_MODULES }, limits: { ...FALLBACK_LIMITS }, marketingServices: { ...FALLBACK_MARKETING },
      ...legacy,
    };
  }

  const modulesRecord = record(input.modules);
  const limitsRecord = record(input.limits);
  const marketingRecord = record(input.marketingServices);
  const completeSnapshot = Boolean(modulesRecord && limitsRecord && marketingRecord)
    && DEMO_MODULE_KEYS.every((key) => Object.hasOwn(modulesRecord!, key))
    && DEMO_LIMIT_KEYS.every((key) => Object.hasOwn(limitsRecord!, key))
    && DEMO_MARKETING_SERVICE_KEYS.every((key) => Object.hasOwn(marketingRecord!, key));
  const validation = validateDemoProfileConfiguration({
    profileCode: input.profileCode,
    moduleOverrides: modulesRecord,
    limitOverrides: limitsRecord,
    marketingServiceOverrides: marketingRecord,
  });
  const snapshotValid = completeSnapshot && validation.valid;
  const configuration = validation.valid ? validation.configuration : null;
  return {
    ...input,
    isDemo: true,
    snapshotValid,
    modules: configuration?.modules ?? { ...FALLBACK_MODULES },
    limits: configuration?.limits ?? { ...FALLBACK_LIMITS },
    marketingServices: configuration?.marketingServices ?? { ...FALLBACK_MARKETING },
    canSendEmail: Boolean(configuration?.modules.email_sending && configuration?.limits.can_send_email),
    ...legacy,
  };
}

export function requireDemoOperational(context: DemoAccessContext, now = new Date()): void {
  if (!context.isDemo) return;
  if (!context.tenantMatches) throw new DemoAccessError("DEMO_MEMBERSHIP_INVALID", 403);
  if (!context.membershipActive || !context.userId || !context.profileId) throw new DemoAccessError("DEMO_MEMBERSHIP_INVALID", 403);
  if (!context.dealerId || !context.snapshotValid) throw new DemoAccessError("DEMO_CONTEXT_INVALID", 422);
  if (!context.provisioningComplete) throw new DemoAccessError("DEMO_PROVISIONING_INCOMPLETE", 422);
  const status = String(context.demoStatus ?? "").toLowerCase();
  if (status === "suspended") throw new DemoAccessError("DEMO_SUSPENDED", 403);
  if (status === "revoked") throw new DemoAccessError("DEMO_REVOKED", 403);
  if (status === "converted") throw new DemoAccessError("DEMO_CONVERTED", 403);
  const expiresAt = context.expiresAt ? Date.parse(context.expiresAt) : Number.NaN;
  if (status === "expired" || !Number.isFinite(expiresAt) || expiresAt <= now.getTime()) throw new DemoAccessError("DEMO_EXPIRED", 410);
  if (status !== "active") throw new DemoAccessError("DEMO_INACTIVE", 403);
}

export function isDemoModuleKey(value: unknown): value is keyof DemoModules {
  return typeof value === "string" && (DEMO_MODULE_KEYS as string[]).includes(value);
}

export function requireDemoModule(context: DemoAccessContext, moduleKey: keyof DemoModules, now = new Date()): void {
  requireDemoOperational(context, now);
  if (context.isDemo && (!isDemoModuleKey(moduleKey) || context.modules[moduleKey] !== true)) throw new DemoAccessError("DEMO_MODULE_DISABLED", 403);
}

export function requireDemoEmail(context: DemoAccessContext, now = new Date()): void {
  requireDemoOperational(context, now);
  if (context.isDemo && (context.modules.email_sending !== true || !context.canSendEmail)) throw new DemoAccessError("DEMO_EMAIL_DISABLED", 403);
}

export const DEMO_FULL_VERSION_MESSAGE = ERROR_MESSAGES.DEMO_MODULE_DISABLED;

export async function resolveDemoAccessContext(supabase: SupabaseClient, dealerId: string | null | undefined, options?: { vehicleCount?: number; leadCount?: number; userCount?: number }): Promise<DemoAccessContext> {
  const normalizedDealerId = String(dealerId ?? "").trim();
  if (!normalizedDealerId) throw new DemoAccessError("DEMO_CONTEXT_INVALID", 422);
  const { data, error } = await supabase.rpc("get_current_demo_access_context", { p_dealer_id: normalizedDealerId });
  if (error || !data || typeof data !== "object") throw new DemoAccessError("DEMO_CONTEXT_INVALID", 422);
  const value = data as Record<string, unknown>;
  const context = buildDemoAccessContext({
    accountType: String(value.account_type ?? ""), demoStatus: String(value.demo_status ?? ""),
    profileCode: typeof value.profile_code === "string" ? value.profile_code as DemoProfileCode : null,
    dealerId: normalizedDealerId, profileId: typeof value.profile_id === "string" ? value.profile_id : null,
    userId: typeof value.user_id === "string" ? value.user_id : null,
    membershipRole: typeof value.membership_role === "string" ? value.membership_role : null,
    membershipActive: value.membership_active === true, startedAt: typeof value.started_at === "string" ? value.started_at : null,
    expiresAt: typeof value.expires_at === "string" ? value.expires_at : null,
    modules: value.modules, limits: value.limits, marketingServices: value.marketing_services,
    provisioningComplete: value.provisioning_complete === true, tenantMatches: true,
  });
  context.usage = { vehicle: options?.vehicleCount ?? 0, lead: options?.leadCount ?? 0, user: options?.userCount ?? 0 };
  return context;
}

// Compatibility for existing read-only UI while server enforcement migrates to the typed guards.
export function getDemoStatusSummary(input: { dealerId?: string | null; accountType?: string | null; demoStatus?: string | null; demoStartedAt?: string | null; demoExpiresAt?: string | null; vehicleCount?: number; leadCount?: number; userCount?: number }) {
  const context = buildDemoAccessContext({
    dealerId: input.dealerId ?? null, accountType: input.accountType ?? null, demoStatus: input.demoStatus ?? null,
    profileCode: null, profileId: null, userId: null, membershipRole: null, membershipActive: true,
    startedAt: input.demoStartedAt ?? null, expiresAt: input.demoExpiresAt ?? null,
    modules: FALLBACK_MODULES, limits: FALLBACK_LIMITS, marketingServices: FALLBACK_MARKETING, provisioningComplete: true, tenantMatches: true,
  });
  context.snapshotValid = true;
  context.modules = Object.fromEntries(DEMO_MODULE_KEYS.map((key) => [key, true])) as DemoModules;
  context.limits = { ...FALLBACK_LIMITS, max_vehicles: 10, max_leads: 20, max_users: 1 };
  context.usage = { vehicle: input.vehicleCount ?? 0, lead: input.leadCount ?? 0, user: input.userCount ?? 0 };
  return context;
}

export function getDemoFeatureBlockReason(context: DemoAccessContext, feature: "vehicle" | "lead" | "user" | "export" | "import" | "billing" | "subscription" | "admin" | "integration" | "write") {
  if (!context.isDemo) return null;
  const moduleMap: Record<string, keyof DemoModules> = {
    vehicle: "vehicles", lead: "leads", user: "user_management", export: "data_export",
    import: "bulk_import", billing: "billing", subscription: "billing", admin: "admin",
    integration: "api_integrations", write: "dashboard",
  };
  try {
    requireDemoModule(context, moduleMap[feature]);
    if (feature === "vehicle" && context.usage.vehicle >= context.limits.max_vehicles) throw new DemoAccessError("DEMO_LIMIT_REACHED", 409);
    if (feature === "lead" && context.usage.lead >= context.limits.max_leads) throw new DemoAccessError("DEMO_LIMIT_REACHED", 409);
    return null;
  }
  catch (error) { return error instanceof DemoAccessError ? { code: error.code, message: error.message } : { code: "DEMO_CONTEXT_INVALID", message: ERROR_MESSAGES.DEMO_CONTEXT_INVALID }; }
}

export const assertDemoWriteAccess = getDemoFeatureBlockReason;

export const DEMO_OPERATION_POLICIES = {
  vehicles: { module: "vehicles", limit: "vehicles" },
  leads: { module: "leads", limit: "leads" },
  clients: { module: "clients", limit: "clients" },
  appointments: { module: "calendar", limit: "appointments" },
  users: { module: "user_management", limit: "users" },
  email: { module: "email_sending", limit: null },
  upload: { module: "vehicles", limit: "storage" },
} as const;
