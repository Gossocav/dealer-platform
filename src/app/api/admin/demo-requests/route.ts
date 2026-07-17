import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";
import { createDemoAccessAuditEntry } from "@/lib/demo-audit";
import {
  activateConfiguredDemo,
  DemoActivationError,
  normalizeDemoActivationEmail,
  type DemoActivationRequest,
  type DemoActivationReservation,
  type DemoActivationRow,
} from "@/lib/demo-activation";
import {
  createDemoProfileSnapshot,
  getDemoProfileByCode,
  normalizeDemoProfileCode,
  validateDemoProfileConfiguration,
  type DemoLimits,
  type DemoMarketingServices,
  type DemoModules,
  type DemoProfileCode,
} from "@/lib/demo-profiles";
import { lifecycleHttpStatus, normalizeDemoLifecycleReason, normalizeDemoReactivationDuration } from "@/lib/demo-lifecycle";
import { resolveServerSupabaseUrl } from "@/lib/server-supabase-url";

type DemoRequestStatus = "pending" | "contacted" | "activated" | "rejected";
type DemoAdminAction = "mark_contacted" | "activate_demo" | "reject" | "suspend_demo" | "reactivate_demo" | "revoke_demo" | "convert_demo" | "configure_demo" | "view_document" | "download_document";

const DEMO_DOCUMENT_BUCKET = "demo-documents";

type ProfileRoleRow = {
  role: string | null;
};

type DemoRequestRow = {
  id: string;
  dealership_name: string;
  company_name?: string | null;
  vat_number: string | null;
  contact_name: string;
  email: string;
  phone: string;
  city: string;
  vehicle_count: number | string | null;
  message: string | null;
  province?: string | null;
  brands?: string | null;
  management_software?: string | null;
  notes?: string | null;
  privacy_accepted?: boolean | null;
  chamber_document_path: string | null;
  chamber_document_name: string | null;
  chamber_document_mime_type: string | null;
  chamber_document_size: number | null;
  status: DemoRequestStatus;
  created_at: string;
  updated_at: string;
  account_type?: string | null;
  demo_status?: string | null;
  demo_started_at?: string | null;
  demo_expires_at?: string | null;
  activated_at?: string | null;
  activated_by?: string | null;
  demo_auth_user_id?: string | null;
  linked_dealer_id?: string | null;
  demo_profile_id?: string | null;
  demo_profile_code?: DemoProfileCode | null;
  demo_profile_price_monthly?: number | null;
  demo_duration_days?: number | null;
  demo_modules?: DemoModules | Record<string, unknown> | null;
  demo_limits?: DemoLimits | Record<string, unknown> | null;
  demo_marketing_services?: DemoMarketingServices | Record<string, unknown> | null;
  assigned_marketing_manager?: string | null;
  internal_notes?: string | null;
  expired_at?: string | null;
  suspended_at?: string | null;
  suspension_reason?: string | null;
  reactivated_at?: string | null;
  revoked_at?: string | null;
  revocation_reason?: string | null;
  converted_at?: string | null;
  lifecycle_version?: number | null;
};

type DemoRequestActionBody = {
  requestId?: string;
  action?: DemoAdminAction;
  demoProfileCode?: string | null;
  durationDays?: unknown;
  moduleOverrides?: unknown;
  limitOverrides?: unknown;
  marketingServiceOverrides?: unknown;
  assignedMarketingManager?: unknown;
  internalNotes?: string | null;
  reason?: unknown;
  lifecycleVersion?: unknown;
};

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function extractBearerToken(authHeader: string | null) {
  const raw = String(authHeader ?? "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = raw.slice(7).trim();
  return token.length > 0 ? token : null;
}

function actionToStatus(action: DemoAdminAction): DemoRequestStatus {
  if (action === "mark_contacted") return "contacted";
  if (action === "activate_demo") return "activated";
  return "rejected";
}

function normalizeVehicleCount(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const parsed = Number.parseInt(text, 10);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return text;
}

function normalizeJsonObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizePriceMonthly(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Number(numericValue.toFixed(2));
}

function normalizeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function normalizeOptionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function countEnabledModules(modules: Record<string, unknown> | null | undefined) {
  return Object.values(modules ?? {}).filter((value) => value === true).length;
}

function normalizeDemoRequestRow(raw: Record<string, unknown>): DemoRequestRow {
  const dealershipName = normalizeText(raw.dealership_name) ?? "-";

  return {
    id: String(raw.id ?? ""),
    dealership_name: dealershipName,
    company_name: dealershipName,
    vat_number: normalizeText(raw.vat_number),
    contact_name: normalizeText(raw.contact_name) ?? "-",
    email: normalizeText(raw.email) ?? "-",
    phone: normalizeText(raw.phone) ?? "-",
    city: normalizeText(raw.city) ?? "-",
    vehicle_count: normalizeVehicleCount(raw.vehicle_count),
    message: normalizeText(raw.message),
    province: normalizeText(raw.province),
    brands: normalizeText(raw.brands),
    management_software: normalizeText(raw.management_software),
    notes: normalizeText(raw.notes),
    privacy_accepted: typeof raw.privacy_accepted === "boolean" ? raw.privacy_accepted : null,
    chamber_document_path: normalizeText(raw.chamber_document_path),
    chamber_document_name: normalizeText(raw.chamber_document_name),
    chamber_document_mime_type: normalizeText(raw.chamber_document_mime_type),
    chamber_document_size:
      typeof raw.chamber_document_size === "number" && Number.isFinite(raw.chamber_document_size)
        ? raw.chamber_document_size
        : null,
    status: (normalizeText(raw.status) as DemoRequestStatus | null) ?? "pending",
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
    account_type: normalizeText(raw.account_type),
    demo_status: normalizeText(raw.demo_status),
    demo_started_at: normalizeText(raw.demo_started_at),
    demo_expires_at: normalizeText(raw.demo_expires_at),
    activated_at: normalizeText(raw.activated_at),
    activated_by: normalizeText(raw.activated_by),
    demo_auth_user_id: normalizeText(raw.demo_auth_user_id),
    linked_dealer_id: normalizeText(raw.linked_dealer_id),
    demo_profile_id: normalizeText(raw.demo_profile_id),
    demo_profile_code: normalizeDemoProfileCode(normalizeText(raw.demo_profile_code)),
    demo_profile_price_monthly: normalizePriceMonthly(raw.demo_profile_price_monthly),
    demo_duration_days: normalizeInteger(raw.demo_duration_days),
    demo_modules: normalizeJsonObject(raw.demo_modules),
    demo_limits: normalizeJsonObject(raw.demo_limits),
    demo_marketing_services: normalizeJsonObject(raw.demo_marketing_services),
    assigned_marketing_manager: normalizeOptionalText(raw.assigned_marketing_manager),
    expired_at: normalizeText(raw.expired_at),
    suspended_at: normalizeText(raw.suspended_at),
    suspension_reason: normalizeText(raw.suspension_reason),
    reactivated_at: normalizeText(raw.reactivated_at),
    revoked_at: normalizeText(raw.revoked_at),
    revocation_reason: normalizeText(raw.revocation_reason),
    converted_at: normalizeText(raw.converted_at),
    lifecycle_version: normalizeInteger(raw.lifecycle_version),
  };
}

function toActivationRequest(raw: Record<string, unknown>): DemoActivationRequest {
  return {
    id: String(raw.id ?? ""),
    dealershipName: normalizeText(raw.dealership_name) ?? normalizeText(raw.company_name) ?? "-",
    contactName: normalizeText(raw.contact_name) ?? "-",
    email: normalizeDemoActivationEmail(raw.email) ?? "",
    phone: normalizeText(raw.phone),
    city: normalizeText(raw.city),
    demoStatus: normalizeText(raw.demo_status),
    profileId: normalizeText(raw.demo_profile_id),
    profileCode: normalizeText(raw.demo_profile_code),
    priceMonthly: normalizePriceMonthly(raw.demo_profile_price_monthly),
    durationDays: normalizeInteger(raw.demo_duration_days),
    modules: normalizeJsonObject(raw.demo_modules),
    limits: normalizeJsonObject(raw.demo_limits),
    marketingServices: normalizeJsonObject(raw.demo_marketing_services),
    linkedDealerId: normalizeText(raw.linked_dealer_id),
    authUserId: normalizeText(raw.demo_auth_user_id),
  };
}

function toActivationRow(raw: Record<string, unknown>): DemoActivationRow {
  return {
    id: String(raw.id ?? ""),
    status: normalizeText(raw.status) ?? "activated",
    demo_status: normalizeText(raw.demo_status) ?? "active",
    demo_started_at: normalizeText(raw.demo_started_at) ?? "",
    demo_expires_at: normalizeText(raw.demo_expires_at) ?? "",
    activated_at: normalizeText(raw.activated_at) ?? "",
    linked_dealer_id: normalizeText(raw.linked_dealer_id) ?? "",
    demo_auth_user_id: normalizeText(raw.demo_auth_user_id) ?? "",
    demo_profile_code: normalizeDemoProfileCode(normalizeText(raw.demo_profile_code)) ?? "base",
  };
}

async function findAuthUserIdByEmail(supabaseAdmin: SupabaseClient, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const result = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw new DemoActivationError("auth_lookup_failed");
    const match = result.data.users.find((user) => normalizeDemoActivationEmail(user.email) === email);
    if (match?.id) return match.id;
    if (!result.data.nextPage) break;
  }
  return null;
}

function createDemoActivationDependencies(supabaseAdmin: SupabaseClient) {
  return {
    async reserve(input: { requestId: string; actorId: string; attemptId: string }): Promise<DemoActivationReservation> {
      const { data, error } = await supabaseAdmin.rpc("reserve_demo_activation", {
        p_request_id: input.requestId,
        p_actor_id: input.actorId,
        p_attempt_id: input.attemptId,
      });
      if (error || !data || typeof data !== "object") throw new DemoActivationError("reservation_failed");
      const payload = data as Record<string, unknown>;
      const outcome = normalizeText(payload.outcome);
      if (outcome === "not_found" || outcome === "invalid_state" || outcome === "invalid_profile" || outcome === "busy") return { outcome };
      const rawRequest = normalizeJsonObject(payload.request);
      if (!rawRequest) throw new DemoActivationError("reservation_invalid_response");
      if (outcome === "already_active") return { outcome, request: toActivationRequest(rawRequest), activation: toActivationRow(rawRequest) };
      if (outcome === "reserved") return { outcome, request: toActivationRequest(rawRequest) };
      throw new DemoActivationError("reservation_invalid_response");
    },
    async ensureAuthUser(input: { email: string; contactName: string; requestId: string }) {
      const existingUserId = await findAuthUserIdByEmail(supabaseAdmin, input.email);
      if (existingUserId) return { userId: existingUserId };
      const created = await supabaseAdmin.auth.admin.createUser({
        email: input.email,
        email_confirm: false,
        app_metadata: { role: "dealer_member" },
        user_metadata: { full_name: input.contactName, demo_request_id: input.requestId },
      });
      if (created.data.user?.id) return { userId: created.data.user.id };
      const racedUserId = await findAuthUserIdByEmail(supabaseAdmin, input.email);
      if (racedUserId) return { userId: racedUserId };
      throw new DemoActivationError("auth_create_failed");
    },
    async ensureDealer(input: { request: DemoActivationRequest; userId: string }) {
      const existing = await supabaseAdmin.from("dealers").select("id").eq("demo_request_id", input.request.id).maybeSingle<{ id: string }>();
      if (existing.error) throw new DemoActivationError("dealer_lookup_failed");
      const dealerId = existing.data?.id ?? input.request.linkedDealerId ?? crypto.randomUUID();
      const result = await supabaseAdmin.from("dealers").upsert({
        id: dealerId,
        user_id: input.userId,
        name: input.request.dealershipName,
        legal_name: input.request.dealershipName,
        contact_person: input.request.contactName,
        email: input.request.email,
        phone: input.request.phone,
        city: input.request.city,
        status: "approved",
        account_type: "demo",
        demo_status: "pending_activation",
        demo_request_id: input.request.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (result.error) throw new DemoActivationError("dealer_upsert_failed");
      return { dealerId };
    },
    async ensureMembership(input: { dealerId: string; userId: string; contactName: string }) {
      const existingProfile = await supabaseAdmin.from("profiles").select("dealer_id").eq("id", input.userId).maybeSingle<{ dealer_id: string | null }>();
      if (existingProfile.error) throw new DemoActivationError("profile_lookup_failed");
      if (existingProfile.data?.dealer_id && existingProfile.data.dealer_id !== input.dealerId) {
        throw new DemoActivationError("auth_user_tenant_conflict");
      }
      const profile = await supabaseAdmin.from("profiles").upsert({
        id: input.userId, dealer_id: input.dealerId, full_name: input.contactName,
        role: "dealer_member", status: "active", updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (profile.error) throw new DemoActivationError("profile_upsert_failed");
      const membership = await supabaseAdmin.from("dealer_users").upsert({
        dealer_id: input.dealerId, profile_id: input.userId, role: "dealer_member",
        status: "active", updated_at: new Date().toISOString(),
      }, { onConflict: "dealer_id,profile_id" });
      if (membership.error) throw new DemoActivationError("membership_upsert_failed");
    },
    async recordProgress(input: { requestId: string; attemptId: string; state: string; userId?: string; dealerId?: string }) {
      const { data, error } = await supabaseAdmin.rpc("record_demo_activation_progress", {
        p_request_id: input.requestId, p_attempt_id: input.attemptId, p_state: input.state,
        p_user_id: input.userId ?? null, p_dealer_id: input.dealerId ?? null,
      });
      if (error || data !== true) throw new DemoActivationError("progress_record_failed");
    },
    async finalize(input: { requestId: string; actorId: string; attemptId: string; userId: string; dealerId: string }) {
      const { data, error } = await supabaseAdmin.rpc("finalize_demo_activation", {
        p_request_id: input.requestId, p_actor_id: input.actorId, p_attempt_id: input.attemptId,
        p_user_id: input.userId, p_dealer_id: input.dealerId,
      });
      if (error || !data || typeof data !== "object") throw new DemoActivationError("finalization_failed");
      return toActivationRow(data as Record<string, unknown>);
    },
    async markFailed(input: { requestId: string; attemptId: string; errorCode: string }) {
      await supabaseAdmin.rpc("fail_demo_activation", {
        p_request_id: input.requestId, p_attempt_id: input.attemptId, p_error_code: input.errorCode,
      });
    },
  };
}

function logConfigureDemoError(params: {
  requestId: string;
  code: string | null;
  message: string;
  details?: string | null;
  hint?: string | null;
}) {
  console.error("[admin-demo-requests]", {
    action: "configure_demo",
    requestId: params.requestId,
    code: params.code,
    message: params.message,
    details: params.details ?? null,
    hint: params.hint ?? null,
  });
}

async function resolveAdminContext(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return {
      error: NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 }),
      supabaseAdmin: null,
      userId: null,
    } as const;
  }

  const accessToken = extractBearerToken(request.headers.get("authorization"));

  if (!accessToken) {
    return {
      error: NextResponse.json({ error: "Sessione non valida." }, { status: 401 }),
      supabaseAdmin: null,
      userId: null,
    } as const;
  }

  const supabaseAdmin = createClient(resolveServerSupabaseUrl(supabaseUrl), supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (userError || !user) {
    return {
      error: NextResponse.json({ error: "Utente non autenticato." }, { status: 401 }),
      supabaseAdmin: null,
      userId: null,
    } as const;
  }

  let isAuthorized = isPlatformAdminRole(resolveUserRoleFromMetadata(user));

  if (!isAuthorized) {
    const profileRole = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).maybeSingle<ProfileRoleRow>();

    if (profileRole.error) {
      return {
        error: NextResponse.json({ error: profileRole.error.message || "Errore verifica autorizzazioni." }, { status: 500 }),
        supabaseAdmin: null,
        userId: null,
      } as const;
    }

    isAuthorized = isPlatformAdminRole(profileRole.data?.role);
  }

  if (!isAuthorized) {
    return {
      error: NextResponse.json({ error: "Accesso negato." }, { status: 403 }),
      supabaseAdmin: null,
      userId: null,
    } as const;
  }

  return {
    error: null,
    supabaseAdmin,
    userId: user.id,
  } as const;
}

export async function GET(request: Request) {
  const context = await resolveAdminContext(request);

  if (context.error) {
    return context.error;
  }

  if (!context.supabaseAdmin) {
    return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
  }

  const requests = await context.supabaseAdmin
    .from("demo_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<Record<string, unknown>[]>();

  if (requests.error) {
    return NextResponse.json({ error: requests.error.message || "Errore caricamento richieste demo." }, { status: 500 });
  }

  const normalizedRequests = (requests.data ?? []).map((item) => normalizeDemoRequestRow(item));

  const requestIds = normalizedRequests.map((item) => item.id).filter(Boolean);
  const dealerByRequestId = new Map<string, {
    id: string;
    account_type: string | null;
    demo_status: string | null;
    demo_started_at: string | null;
    demo_expires_at: string | null;
  }>();

  if (requestIds.length > 0) {
    const dealers = await context.supabaseAdmin
      .from("dealers")
      .select("id, demo_request_id, account_type, demo_status, demo_started_at, demo_expires_at")
      .in("demo_request_id", requestIds)
      .returns<Array<Record<string, unknown>>>();

    if (!dealers.error) {
      for (const dealer of dealers.data ?? []) {
        const key = String(dealer.demo_request_id ?? "").trim();
        if (!key) {
          continue;
        }

        dealerByRequestId.set(key, {
          id: String(dealer.id ?? ""),
          account_type: normalizeText(dealer.account_type),
          demo_status: normalizeText(dealer.demo_status),
          demo_started_at: normalizeText(dealer.demo_started_at),
          demo_expires_at: normalizeText(dealer.demo_expires_at),
        });
      }
    }
  }

  const enriched = normalizedRequests.map((request) => {
    const linked = dealerByRequestId.get(request.id);

    return {
      ...request,
      linked_dealer_id: linked?.id ?? null,
      account_type: linked?.account_type ?? null,
      demo_status: linked?.demo_status ?? request.demo_status ?? null,
      demo_started_at: linked?.demo_started_at ?? request.demo_started_at ?? null,
      demo_expires_at: linked?.demo_expires_at ?? request.demo_expires_at ?? null,
    };
  });

  return NextResponse.json({ requests: enriched }, { status: 200 });
}

export async function POST(request: Request) {
  const context = await resolveAdminContext(request);

  if (context.error) {
    return context.error;
  }

  if (!context.supabaseAdmin || !context.userId) {
    return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
  }

  let body: DemoRequestActionBody;
  try {
    body = (await request.json()) as DemoRequestActionBody;
  } catch {
    return NextResponse.json({ error: "Payload non valido." }, { status: 400 });
  }

  const requestId = normalizeText(body.requestId);
  const action = body.action;

  if (!requestId || !action || !["mark_contacted", "activate_demo", "reject", "suspend_demo", "reactivate_demo", "revoke_demo", "convert_demo", "configure_demo", "view_document", "download_document"].includes(action)) {
    return NextResponse.json({ error: "Dati richiesta non validi." }, { status: 400 });
  }

  const targetRequestResult = await context.supabaseAdmin
    .from("demo_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle<Record<string, unknown>>();

  if (targetRequestResult.error) {
    if (action === "configure_demo") {
      logConfigureDemoError({
        requestId,
        code: normalizeDemoProfileCode(body.demoProfileCode),
        message: "Errore lettura richiesta demo.",
        details: targetRequestResult.error.details,
        hint: targetRequestResult.error.hint,
      });
      return NextResponse.json({ error: "Impossibile recuperare la richiesta Demo." }, { status: 500 });
    }
    return NextResponse.json({ error: targetRequestResult.error.message || "Errore lettura richiesta demo." }, { status: 500 });
  }

  if (!targetRequestResult.data) {
    return NextResponse.json({ error: "Richiesta demo non trovata." }, { status: 404 });
  }

  const targetRequest = normalizeDemoRequestRow(targetRequestResult.data);

  if (action === "configure_demo") {
    if (["active", "expired", "suspended", "revoked", "converted"].includes(targetRequest.demo_status ?? "")) {
      return NextResponse.json({ error: "La configurazione Demo non e modificabile nello stato corrente." }, { status: 409 });
    }
    const requestedProfileCode = normalizeDemoProfileCode(body.demoProfileCode);
    const demoProfile = requestedProfileCode ? getDemoProfileByCode(requestedProfileCode) : null;

    if (!demoProfile || !demoProfile.enabled) {
      return NextResponse.json({ error: "Profilo demo non valido." }, { status: 400 });
    }

    const validation = validateDemoProfileConfiguration({
      profileCode: requestedProfileCode,
      durationDays: body.durationDays,
      moduleOverrides: body.moduleOverrides,
      limitOverrides: body.limitOverrides,
      marketingServiceOverrides: body.marketingServiceOverrides,
      assignedMarketingManager: body.assignedMarketingManager,
    });

    if (!validation.valid) {
      return NextResponse.json({ error: "Configurazione demo non valida.", validationErrors: validation.errors }, { status: 400 });
    }

    const snapshot = createDemoProfileSnapshot({
      profileCode: requestedProfileCode,
      durationDays: validation.configuration.durationDays,
      moduleOverrides: validation.configuration.modules,
      limitOverrides: validation.configuration.limits,
      marketingServiceOverrides: validation.configuration.marketingServices,
      assignedMarketingManager: validation.configuration.assignedMarketingManager,
      createdAt: validation.configuration.createdAt,
    });

    const profileResult = await context.supabaseAdmin
      .from("demo_profiles")
      .select("id")
      .eq("code", snapshot.profileCode)
      .eq("enabled", true)
      .maybeSingle<{ id: string }>();

    if (profileResult.error) {
      logConfigureDemoError({
        requestId,
        code: snapshot.profileCode,
        message: "Errore lookup profilo demo.",
        details: profileResult.error.details,
        hint: profileResult.error.hint,
      });
      return NextResponse.json({ error: "Impossibile recuperare il profilo Demo." }, { status: 500 });
    }

    if (!profileResult.data?.id) {
      return NextResponse.json({ error: "Profilo Demo non disponibile nel database." }, { status: 409 });
    }

    const updateResult = await context.supabaseAdmin
      .from("demo_requests")
      .update({
        demo_profile_id: profileResult.data.id,
        demo_profile_code: snapshot.profileCode,
        demo_profile_price_monthly: snapshot.priceMonthly,
        demo_duration_days: snapshot.durationDays,
        demo_modules: snapshot.modules,
        demo_limits: snapshot.limits,
        demo_marketing_services: snapshot.marketingServices,
        assigned_marketing_manager: snapshot.assignedMarketingManager,
        demo_status: "configured",
        updated_at: snapshot.createdAt,
      })
      .eq("id", requestId)
      .select("*")
      .single<Record<string, unknown>>();

    if (updateResult.error) {
      logConfigureDemoError({
        requestId,
        code: snapshot.profileCode,
        message: "Errore salvataggio configurazione demo.",
        details: updateResult.error.details,
        hint: updateResult.error.hint,
      });
      return NextResponse.json({ error: "Impossibile salvare la configurazione Demo." }, { status: 500 });
    }

    const updatedRequest = normalizeDemoRequestRow(updateResult.data);

    return NextResponse.json(
      {
        requestId,
        request: updatedRequest,
        demoProfileCode: snapshot.profileCode,
        demoProfileName: snapshot.profileName,
        demoModules: snapshot.modules,
        demoLimits: snapshot.limits,
        demoMarketingServices: snapshot.marketingServices,
      },
      { status: 200 }
    );
  }

  if (action === "view_document" || action === "download_document") {
    const objectPath = normalizeText(targetRequest.chamber_document_path);
    if (!objectPath) {
      return NextResponse.json({ error: "Documento visura non disponibile per questa richiesta." }, { status: 404 });
    }

    const signed = await context.supabaseAdmin.storage
      .from(DEMO_DOCUMENT_BUCKET)
      .createSignedUrl(objectPath, 120, action === "download_document" ? { download: targetRequest.chamber_document_name ?? true } : undefined);

    if (signed.error || !signed.data?.signedUrl) {
      return NextResponse.json({ error: "Impossibile generare link temporaneo." }, { status: 500 });
    }

    await context.supabaseAdmin.from("audit_logs").insert({
      dealer_id: targetRequest.linked_dealer_id ?? null,
      actor_profile_id: context.userId,
      actor_type: "user",
      action: "demo.document_accessed",
      entity_type: "demo_request",
      entity_id: requestId,
      metadata_json: {
        mode: action,
        path: objectPath,
      },
      created_by: context.userId,
    });

    return NextResponse.json(
      {
        requestId,
        action,
        signedUrl: signed.data.signedUrl,
        fileName: targetRequest.chamber_document_name,
        mimeType: targetRequest.chamber_document_mime_type,
      },
      { status: 200 }
    );
  }

  if (action === "mark_contacted" && targetRequest.status !== "pending") {
    return NextResponse.json({ error: "La richiesta non puo essere segnata come contattata nello stato corrente." }, { status: 409 });
  }

  if (action === "activate_demo") {
    const attemptId = crypto.randomUUID();
    const result = await activateConfiguredDemo({
      requestId,
      actorId: context.userId,
      attemptId,
      dependencies: createDemoActivationDependencies(context.supabaseAdmin),
    }).catch((error) => {
      console.error("[admin-demo-requests]", {
        action: "activate_demo", requestId, code: "orchestration_failed",
        message: error instanceof Error ? error.message : "Unknown activation error",
      });
      return { ok: false as const, code: "activation_failed" as const, status: 500 };
    });

    if (!result.ok) {
      console.error("[admin-demo-requests]", {
        action: "activate_demo",
        requestId,
        code: result.code,
        message: "Demo activation did not complete.",
        details: null,
        hint: result.code === "busy" ? "Retry after the active reservation completes." : null,
      });
      const message = result.code === "not_found"
        ? "Richiesta Demo non trovata."
        : result.code === "busy"
          ? "Attivazione Demo gia in corso."
          : result.code === "invalid_snapshot"
            ? "Snapshot Demo incompleto o non valido."
            : result.code === "invalid_profile"
              ? "Profilo Demo non disponibile."
              : result.code === "invalid_state"
                ? "La richiesta Demo non e pronta per l'attivazione."
                : "Attivazione Demo non completata. Riprova in sicurezza.";
      return NextResponse.json({ error: message, code: result.code }, { status: result.status });
    }

    await createDemoAccessAuditEntry(context.supabaseAdmin, {
      dealerId: result.activation.linked_dealer_id,
      actorProfileId: context.userId,
      action: "demo.approved",
      entityType: "demo_request",
      entityId: requestId,
      metadata: { profileCode: result.activation.demo_profile_code, idempotent: result.code === "already_active" },
    });

    const refreshed = await context.supabaseAdmin.from("demo_requests").select("*").eq("id", requestId).single<Record<string, unknown>>();
    if (refreshed.error || !refreshed.data) {
      return NextResponse.json({ error: "Demo attivata, ma aggiornamento risposta non disponibile." }, { status: 500 });
    }

    return NextResponse.json({
      requestId,
      status: "activated",
      demoStatus: "active",
      request: normalizeDemoRequestRow(refreshed.data),
    }, { status: 200 });
  }

  if (action === "reject" && targetRequest.status === "activated") {
    return NextResponse.json({ error: "Richiesta demo gia attivata. Usa Revoca Demo." }, { status: 409 });
  }

  const nextStatus = actionToStatus(action);

  if (action === "mark_contacted" || action === "reject") {
    const updateResult = await context.supabaseAdmin
      .from("demo_requests")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (updateResult.error) {
      return NextResponse.json({ error: updateResult.error.message || "Errore aggiornamento stato richiesta demo." }, { status: 500 });
    }
  }

  if (["suspend_demo", "reactivate_demo", "revoke_demo", "convert_demo"].includes(action)) {
    const reason = action === "suspend_demo" || action === "revoke_demo" ? normalizeDemoLifecycleReason(body.reason) : null;
    const durationDays = action === "reactivate_demo" ? normalizeDemoReactivationDuration(body.durationDays) : null;
    if ((action === "suspend_demo" || action === "revoke_demo") && !reason) {
      return NextResponse.json({ error: "Motivazione obbligatoria (3-500 caratteri).", code: "DEMO_TRANSITION_NOT_ALLOWED" }, { status: 422 });
    }
    if (action === "reactivate_demo" && !durationDays) {
      return NextResponse.json({ error: "Durata di riattivazione non valida.", code: "DEMO_REACTIVATION_INVALID" }, { status: 422 });
    }
    const expectedVersion = normalizeInteger(body.lifecycleVersion);
    const lifecycle = await context.supabaseAdmin.rpc("transition_demo_lifecycle", {
      p_request_id: requestId, p_actor_id: context.userId, p_action: action,
      p_reason: reason, p_duration_days: durationDays, p_expected_version: expectedVersion,
    });
    if (lifecycle.error) {
      console.error("[admin-demo-requests]", { action, requestId, code: "DEMO_LIFECYCLE_CONFLICT", message: lifecycle.error.message, details: lifecycle.error.details, hint: lifecycle.error.hint });
      return NextResponse.json({ error: "Transizione Demo non completata.", code: "DEMO_LIFECYCLE_CONFLICT" }, { status: 409 });
    }
    const result = lifecycle.data && typeof lifecycle.data === "object" ? lifecycle.data as Record<string, unknown> : {};
    const outcome = normalizeText(result.outcome);
    if (outcome !== "updated" && outcome !== "already_applied") {
      const code = outcome === "provisioning_incomplete" ? "DEMO_CONVERSION_INVALID"
        : outcome === "invalid_input" ? (action === "reactivate_demo" ? "DEMO_REACTIVATION_INVALID" : "DEMO_TRANSITION_NOT_ALLOWED")
          : outcome === "conflict" ? "DEMO_LIFECYCLE_CONFLICT" : "DEMO_TRANSITION_NOT_ALLOWED";
      return NextResponse.json({ error: "Transizione Demo non consentita.", code }, { status: lifecycleHttpStatus(code) });
    }
    const refreshed = await context.supabaseAdmin.from("demo_requests").select("*").eq("id", requestId).single<Record<string, unknown>>();
    if (refreshed.error || !refreshed.data) return NextResponse.json({ error: "Transizione completata, risposta non disponibile." }, { status: 500 });
    return NextResponse.json({ requestId, status: "activated", request: normalizeDemoRequestRow(refreshed.data) }, { status: 200 });
  }

  return NextResponse.json({ requestId, status: nextStatus }, { status: 200 });
}
