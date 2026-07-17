export const DEMO_PROFILE_CODES = ["base", "pro", "elite"] as const;
export type DemoProfileCode = (typeof DEMO_PROFILE_CODES)[number];

export const DEMO_REQUEST_STATUSES = ["pending", "contacted", "qualified", "approved_for_activation", "rejected"] as const;
export type DemoRequestStatus = (typeof DEMO_REQUEST_STATUSES)[number];

export const DEMO_ACTIVATION_STATES = ["idle", "reserved", "auth_ready", "dealer_ready", "profile_ready", "membership_ready", "completed", "failed"] as const;
export type DemoActivationState = (typeof DEMO_ACTIVATION_STATES)[number];

export const DEMO_STATUSES = ["configured", "ready_for_activation", "active", "suspended", "expired", "revoked", "converted"] as const;
export type DemoStatus = (typeof DEMO_STATUSES)[number];

export const DEMO_SUBSCRIPTION_STATUSES = ["demo", "pending_payment", "paid", "suspended", "expired", "revoked"] as const;
export type DemoSubscriptionStatus = (typeof DEMO_SUBSCRIPTION_STATUSES)[number];

export const DEMO_ERROR_CODES = [
  "DEMO_PROFILE_INVALID",
  "DEMO_PROFILE_IMMUTABLE",
  "DEMO_DURATION_FIXED",
  "DEMO_EXTENSION_NOT_ALLOWED",
  "DEMO_EXTENSION_ALREADY_USED",
  "DEMO_EXTENSION_REASON_REQUIRED",
  "DEMO_TRANSITION_NOT_ALLOWED",
  "DEMO_LIFECYCLE_CONFLICT",
  "DEMO_REQUEST_STATUS_INVALID",
  "DEMO_ACTIVATION_INVALID_STATE",
  "DEMO_PROVISIONING_INCOMPLETE",
  "DEMO_MEMBERSHIP_INVALID",
  "DEMO_AUTH_REQUIRED",
  "DEMO_ANON_ACCESS_FORBIDDEN",
  "DEMO_REGISTRATION_DISABLED",
  "DEMO_MODULE_DISABLED",
  "DEMO_LIMIT_REACHED",
  "DEMO_STORAGE_LIMIT_REACHED",
  "DEMO_EMAIL_DISABLED",
  "DEMO_EMAIL_RATE_LIMITED",
  "DEMO_CONVERSION_PENDING_SUBSCRIPTION",
  "DEMO_CONTEXT_INVALID",
] as const;
export type DemoErrorCode = (typeof DEMO_ERROR_CODES)[number];

export interface DemoModuleSnapshot {
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
}

export interface DemoLimitSnapshot {
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
}

export interface DemoMarketingSnapshot {
  social_visibility: boolean;
  google_ads_management: boolean;
  monthly_marketing_report: boolean;
  meta_ads_management: boolean;
  dedicated_landing_page: boolean;
  local_seo: boolean;
}

export interface DemoEmailPolicySnapshot {
  email_sending: boolean;
  can_send_email: boolean;
  rate_limit_per_hour?: number | null;
  rate_limit_per_day?: number | null;
}

export interface DealerDemoSubscription {
  id: string;
  dealerId: string;
  demoRequestId: string;
  demoProfileCode: DemoProfileCode;
  modulesSnapshot: DemoModuleSnapshot;
  limitsSnapshot: DemoLimitSnapshot;
  marketingSnapshot: DemoMarketingSnapshot;
  emailPolicy: DemoEmailPolicySnapshot;
  startsAt: string;
  expiresAt: string;
  extensionUsed: boolean;
  extendedAt: string | null;
  extendedBy: string | null;
  extensionReason: string | null;
  requestStatus: DemoRequestStatus;
  activationState: DemoActivationState;
  demoStatus: DemoStatus;
  lifecycleVersion: number;
  convertedPlanCode: DemoProfileCode | null;
  convertedAt: string | null;
  convertedBy: string | null;
  subscriptionStatus: DemoSubscriptionStatus;
  createdAt: string;
  updatedAt: string;
}
