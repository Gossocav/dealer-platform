export type DemoProfileCode = "base" | "pro" | "elite";

export type DemoMarketingServiceKey =
  | "social_visibility"
  | "google_ads_management"
  | "monthly_marketing_report"
  | "meta_ads_management"
  | "dedicated_landing_page"
  | "local_seo";

export type DemoMarketingServices = Record<DemoMarketingServiceKey, boolean>;

export type DemoModules = {
  dashboard: boolean;
  vehicles: boolean;
  leads: boolean;
  clients: boolean;
  calendar: boolean;
  notifications: boolean;
  dealership_profile: boolean;
  reports: boolean;
  analytics: boolean;
  documents: boolean;
  bulk_import: boolean;
  marketplace_publish: boolean;
  email_sending: boolean;
  user_management: boolean;
  roles_permissions: boolean;
  billing: boolean;
  advanced_settings: boolean;
  api_integrations: boolean;
  admin: boolean;
  data_export: boolean;
  registration: boolean;
  social_marketing: boolean;
  google_ads: boolean;
  marketing_dashboard: boolean;
};

export type DemoLimits = {
  max_users: number;
  max_vehicles: number;
  max_leads: number;
  max_clients: number;
  max_appointments: number;
  max_storage_mb: number;
  can_send_email: boolean;
  can_publish_marketplace: boolean;
  can_export_data: boolean;
  can_create_users: boolean;
  can_use_bulk_import: boolean;
};

export type DemoProfile = {
  code: DemoProfileCode;
  name: string;
  description: string;
  duration_days: number;
  enabled: boolean;
  price_monthly: number | null;
  badgeLabel?: string;
  mainFeatures: string[];
  includedServices: string[];
  marketingNote?: string | null;
  marketing_services: DemoMarketingServices;
  modules: DemoModules;
  limits: DemoLimits;
};

export type DemoProfileSnapshot = {
  profileCode: DemoProfileCode;
  profileName: string;
  priceMonthly: number | null;
  durationDays: number;
  modules: DemoModules;
  limits: DemoLimits;
  marketingServices: DemoMarketingServices;
  assignedMarketingManager: string | null;
  createdAt: string;
};

export type DemoProfileConfigurationInput = {
  profileCode?: string | null;
  durationDays?: unknown;
  priceMonthly?: unknown;
  moduleOverrides?: unknown;
  limitOverrides?: unknown;
  marketingServiceOverrides?: unknown;
  assignedMarketingManager?: unknown;
  createdAt?: string;
};

export type DemoProfileValidationResult =
  | { valid: true; errors: []; configuration: DemoProfileSnapshot }
  | { valid: false; errors: string[]; configuration: null };

export const DEMO_GOOGLE_ADS_NOTE =
  "La gestione della campagna Google Ads è inclusa. Il budget pubblicitario non è incluso nel canone di € 699/mese, viene concordato con il cliente ed è sostenuto direttamente dal cliente.";

const EMPTY_MARKETING_SERVICES: DemoMarketingServices = {
  social_visibility: false,
  google_ads_management: false,
  monthly_marketing_report: false,
  meta_ads_management: false,
  dedicated_landing_page: false,
  local_seo: false,
};

export const DEMO_MARKETING_SERVICE_DEFAULTS: DemoMarketingServices = {
  social_visibility: true,
  google_ads_management: true,
  monthly_marketing_report: true,
  meta_ads_management: false,
  dedicated_landing_page: false,
  local_seo: false,
};

const BASE_MODULES: DemoModules = {
  dashboard: true, vehicles: true, leads: true, clients: true, calendar: true,
  notifications: true, dealership_profile: true, reports: true, analytics: false,
  documents: true, bulk_import: false, marketplace_publish: true, email_sending: false,
  user_management: false, roles_permissions: false, billing: false, advanced_settings: false,
  api_integrations: false, admin: false, data_export: false, registration: false,
  social_marketing: false, google_ads: false, marketing_dashboard: false,
};

const BASE_LIMITS: DemoLimits = {
  max_users: 2, max_vehicles: 250, max_leads: 500, max_clients: 500,
  max_appointments: 500, max_storage_mb: 750, can_send_email: false,
  can_publish_marketplace: true, can_export_data: false, can_create_users: false,
  can_use_bulk_import: false,
};

const PRO_MODULES: DemoModules = {
  dashboard: true, vehicles: true, leads: true, clients: true, calendar: true,
  notifications: true, dealership_profile: true, reports: true, analytics: true,
  documents: true, bulk_import: true, marketplace_publish: true, email_sending: false,
  user_management: true, roles_permissions: true, billing: false, advanced_settings: true,
  api_integrations: true, admin: false, data_export: true, registration: false,
  social_marketing: false, google_ads: false, marketing_dashboard: false,
};

const PRO_LIMITS: DemoLimits = {
  max_users: 5, max_vehicles: 2500, max_leads: 2500, max_clients: 2500,
  max_appointments: 2500, max_storage_mb: 2500, can_send_email: false,
  can_publish_marketplace: true, can_export_data: true, can_create_users: true,
  can_use_bulk_import: true,
};

const ELITE_MODULES: DemoModules = {
  ...PRO_MODULES,
  social_marketing: true,
  google_ads: true,
  marketing_dashboard: true,
  email_sending: false,
};

const ELITE_LIMITS: DemoLimits = {
  max_users: 10, max_vehicles: 9999, max_leads: 9999, max_clients: 9999,
  max_appointments: 9999, max_storage_mb: 5000, can_send_email: false,
  can_publish_marketplace: true, can_export_data: true, can_create_users: true,
  can_use_bulk_import: true,
};

export const DEMO_PROFILE_CATALOG: DemoProfile[] = [
  {
    code: "base", name: "Dealer Platform Base",
    description: "Soluzione essenziale per verificare il flusso operativo base della concessionaria.",
    duration_days: 7, enabled: true, price_monthly: null,
    mainFeatures: ["Dashboard", "Veicoli", "Lead", "Marketplace publish"],
    includedServices: ["Accesso alla piattaforma", "Supporto operativo", "Pubblicazione veicoli"],
    marketing_services: { ...EMPTY_MARKETING_SERVICES }, modules: { ...BASE_MODULES }, limits: { ...BASE_LIMITS },
  },
  {
    code: "pro", name: "Dealer Platform Pro",
    description: "Soluzione evoluta per concessionarie con volumi maggiori e processi più strutturati.",
    duration_days: 7, enabled: true, price_monthly: null,
    mainFeatures: ["CRM lead avanzato", "Statistiche e KPI", "Import massivo", "Esportazione dati"],
    includedServices: ["Accesso alla piattaforma", "Funzioni avanzate", "Supporto prioritario"],
    marketing_services: { ...EMPTY_MARKETING_SERVICES }, modules: { ...PRO_MODULES }, limits: { ...PRO_LIMITS },
  },
  {
    code: "elite", name: "Dealer Platform Elite",
    description: "Soluzione completa con piattaforma Dealer Platform e servizi di visibilità e promozione online.",
    duration_days: 7, enabled: true, price_monthly: 699, badgeLabel: "Soluzione completa",
    mainFeatures: ["Software Dealer Platform completo", "Visibilità social", "Gestione Google Ads", "Report mensile"],
    includedServices: ["Software Dealer Platform completo", "Visibilità sui social ufficiali Dealer Platform", "Gestione Google Ads", "Report mensile delle performance marketing"],
    marketingNote: DEMO_GOOGLE_ADS_NOTE,
    marketing_services: { ...DEMO_MARKETING_SERVICE_DEFAULTS }, modules: { ...ELITE_MODULES }, limits: { ...ELITE_LIMITS },
  },
];

export const DEMO_MODULE_KEYS = Object.keys(BASE_MODULES) as Array<keyof DemoModules>;
export const DEMO_LIMIT_KEYS = Object.keys(BASE_LIMITS) as Array<keyof DemoLimits>;
export const DEMO_MARKETING_SERVICE_KEYS = Object.keys(EMPTY_MARKETING_SERVICES) as DemoMarketingServiceKey[];

const DEMO_PROFILE_BY_CODE = new Map(DEMO_PROFILE_CATALOG.map((profile) => [profile.code, profile]));

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneProfile(profile: DemoProfile): DemoProfile {
  return {
    ...profile,
    mainFeatures: [...profile.mainFeatures],
    includedServices: [...profile.includedServices],
    marketing_services: { ...profile.marketing_services },
    modules: { ...profile.modules },
    limits: { ...profile.limits },
  };
}

export function normalizeDemoProfileCode(value: string | null | undefined): DemoProfileCode | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "base" || normalized === "pro" || normalized === "elite" ? normalized : null;
}

export function getDemoProfileByCode(code: string | null | undefined): DemoProfile | null {
  const normalized = normalizeDemoProfileCode(code);
  const profile = normalized ? DEMO_PROFILE_BY_CODE.get(normalized) : null;
  return profile ? cloneProfile(profile) : null;
}

export function listEnabledDemoProfiles(): DemoProfile[] {
  return DEMO_PROFILE_CATALOG.filter((profile) => profile.enabled).map(cloneProfile);
}

export function normalizeDemoModules(profileCode: string | null | undefined, overrides?: unknown): DemoModules | null {
  const profile = getDemoProfileByCode(profileCode);
  if (!profile) return null;
  const normalized = { ...profile.modules };
  if (!isRecord(overrides)) return normalized;
  for (const key of DEMO_MODULE_KEYS) {
    if (typeof overrides[key] === "boolean") normalized[key] = overrides[key];
  }
  return normalized;
}

export function normalizeDemoLimits(profileCode: string | null | undefined, overrides?: unknown): DemoLimits | null {
  const profile = getDemoProfileByCode(profileCode);
  if (!profile) return null;
  const normalized = { ...profile.limits };
  if (!isRecord(overrides)) return normalized;
  for (const key of DEMO_LIMIT_KEYS) {
    const current = normalized[key];
    const candidate = overrides[key];
    if (typeof current === "boolean" && typeof candidate === "boolean") {
      (normalized[key] as boolean) = candidate;
    } else if (typeof current === "number" && typeof candidate === "number" && Number.isFinite(candidate) && Number.isInteger(candidate) && candidate >= 0) {
      (normalized[key] as number) = candidate;
    }
  }
  return normalized;
}

export function normalizeDemoMarketingServices(profileCode: string | null | undefined, overrides?: unknown): DemoMarketingServices | null {
  const profile = getDemoProfileByCode(profileCode);
  if (!profile) return null;
  if (profile.code !== "elite") return { ...EMPTY_MARKETING_SERVICES };
  const normalized = { ...profile.marketing_services };
  if (!isRecord(overrides)) return normalized;
  for (const key of DEMO_MARKETING_SERVICE_KEYS) {
    if (typeof overrides[key] === "boolean") normalized[key] = overrides[key];
  }
  return normalized;
}

export function getDemoMarketingServicesDefaults(): DemoMarketingServices {
  return { ...DEMO_MARKETING_SERVICE_DEFAULTS };
}

function collectOverrideErrors(input: DemoProfileConfigurationInput, profile: DemoProfile): string[] {
  const errors: string[] = [];
  if (input.moduleOverrides !== undefined) {
    if (!isRecord(input.moduleOverrides)) errors.push("Gli override dei moduli devono essere un oggetto.");
    else for (const key of DEMO_MODULE_KEYS) if (key in input.moduleOverrides && typeof input.moduleOverrides[key] !== "boolean") errors.push(`Il modulo ${key} deve essere booleano.`);
  }
  if (input.limitOverrides !== undefined) {
    if (!isRecord(input.limitOverrides)) errors.push("Gli override dei limiti devono essere un oggetto.");
    else for (const key of DEMO_LIMIT_KEYS) {
      if (!(key in input.limitOverrides)) continue;
      const value = input.limitOverrides[key];
      const expected = typeof profile.limits[key];
      if (expected === "boolean" && typeof value !== "boolean") errors.push(`Il limite ${key} deve essere booleano.`);
      if (expected === "number" && (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0)) errors.push(`Il limite ${key} deve essere un intero non negativo.`);
    }
  }
  if (input.marketingServiceOverrides !== undefined) {
    if (!isRecord(input.marketingServiceOverrides)) errors.push("Gli override marketing devono essere un oggetto.");
    else for (const key of DEMO_MARKETING_SERVICE_KEYS) if (key in input.marketingServiceOverrides && typeof input.marketingServiceOverrides[key] !== "boolean") errors.push(`Il servizio marketing ${key} deve essere booleano.`);
    const marketingOverrides = isRecord(input.marketingServiceOverrides) ? input.marketingServiceOverrides : null;
    if (profile.code !== "elite" && marketingOverrides && DEMO_MARKETING_SERVICE_KEYS.some((key) => marketingOverrides[key] === true)) {
      errors.push("Base e Pro non possono avere servizi marketing attivi.");
    }
  }
  return errors;
}

export function validateDemoProfileConfiguration(input: DemoProfileConfigurationInput): DemoProfileValidationResult {
  const code = normalizeDemoProfileCode(input.profileCode);
  const profile = code ? getDemoProfileByCode(code) : null;
  if (!profile || !profile.enabled) return { valid: false, errors: ["Profilo demo non valido o non abilitato."], configuration: null };

  const errors = collectOverrideErrors(input, profile);
  if (input.assignedMarketingManager !== undefined && input.assignedMarketingManager !== null && typeof input.assignedMarketingManager !== "string") {
    errors.push("Il marketing manager deve essere una stringa.");
  }
  const durationDays = input.durationDays === undefined ? profile.duration_days : input.durationDays;
  if (typeof durationDays !== "number" || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 30) errors.push("La durata deve essere un intero compreso tra 1 e 30 giorni.");
  if (input.priceMonthly !== undefined && input.priceMonthly !== profile.price_monthly) errors.push("Il prezzo non corrisponde al catalogo server-side.");

  const modules = normalizeDemoModules(code, input.moduleOverrides);
  const limits = normalizeDemoLimits(code, input.limitOverrides);
  const marketingServices = normalizeDemoMarketingServices(code, input.marketingServiceOverrides);
  if (!modules || !limits || !marketingServices) errors.push("Configurazione profilo non normalizzabile.");
  if (modules && !Object.values(modules).some(Boolean)) errors.push("Almeno un modulo software deve essere attivo.");
  if (code === "elite" && profile.price_monthly !== 699) errors.push("Il profilo Elite deve avere prezzo mensile pari a 699 euro.");
  if (code !== "elite" && marketingServices && Object.values(marketingServices).some(Boolean)) errors.push("Base e Pro non possono avere servizi marketing attivi.");

  if (errors.length > 0 || !modules || !limits || !marketingServices || typeof durationDays !== "number") return { valid: false, errors, configuration: null };
  return {
    valid: true,
    errors: [],
    configuration: {
      profileCode: profile.code,
      profileName: profile.name,
      priceMonthly: profile.price_monthly,
      durationDays,
      modules: { ...modules },
      limits: { ...limits },
      marketingServices: { ...marketingServices },
      assignedMarketingManager: String(input.assignedMarketingManager ?? "").trim() || null,
      createdAt: input.createdAt ?? new Date().toISOString(),
    },
  };
}

export function createDemoProfileSnapshot(input: DemoProfileConfigurationInput): DemoProfileSnapshot {
  const result = validateDemoProfileConfiguration(input);
  if (!result.valid) throw new Error(result.errors.join(" "));
  return {
    ...result.configuration,
    modules: { ...result.configuration.modules },
    limits: { ...result.configuration.limits },
    marketingServices: { ...result.configuration.marketingServices },
  };
}
