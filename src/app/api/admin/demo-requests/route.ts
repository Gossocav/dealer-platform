import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";
import { hitRateLimit } from "@/lib/api-rate-limit";
import { sendDemoLifecycleEmail, sendPlatformEmail } from "@/lib/admin-notification-email";
import { createDemoAccessAuditEntry } from "@/lib/demo-audit";

type DemoRequestStatus = "pending" | "contacted" | "activated" | "rejected" | "converted" | "revoked";
type DemoAdminAction = "mark_contacted" | "activate_demo" | "reject" | "revoke_demo" | "convert_demo" | "view_document" | "download_document";

const DEMO_DOCUMENT_BUCKET = "demo-documents";
const ADMIN_DEMO_REQUESTS_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 10,
} as const;

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
  linked_dealer_id?: string | null;
};

type DemoRequestActionBody = {
  requestId?: string;
  action?: DemoAdminAction;
};

type DemoRpcPayload = {
  outcome?: string;
  subscription?: {
    dealer_id?: string | null;
    demo_status?: string | null;
    expires_at?: string | null;
    lifecycle_version?: number | string | null;
  } | null;
  request?: {
    id?: string | null;
    status?: string | null;
    demo_status?: string | null;
    demo_expires_at?: string | null;
    linked_dealer_id?: string | null;
  } | null;
  dealer?: {
    id?: string | null;
    demo_status?: string | null;
  } | null;
};

type DealerDemoSubscriptionRow = {
  dealer_id: string;
  lifecycle_version: number | string;
  demo_status: string | null;
  expires_at: string | null;
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

function resolveClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

function retryAfterSeconds(resetAt: number) {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}

function actionToStatus(action: DemoAdminAction): DemoRequestStatus {
  if (action === "mark_contacted") return "contacted";
  if (action === "activate_demo") return "activated";
  if (action === "convert_demo") return "converted";
  if (action === "revoke_demo") return "revoked";
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

function normalizeRpcPayload(payload: unknown): DemoRpcPayload {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  return payload as DemoRpcPayload;
}

function toHttpStatusFromOutcome(outcome: string) {
  if (
    outcome === "DEMO_LIFECYCLE_CONFLICT" ||
    outcome === "DEMO_ACTIVATION_ATTEMPT_CONFLICT" ||
    outcome === "DEMO_ACTIVATION_ATTEMPT_MISMATCH" ||
    outcome === "DEMO_ACTIVATION_SEQUENCE_INVALID" ||
    outcome === "DEMO_ACTIVATION_INVALID_STATE" ||
    outcome === "DEMO_TRANSITION_NOT_ALLOWED" ||
    outcome === "DEMO_TERMINAL_STATE"
  ) {
    return 409;
  }

  if (
    outcome === "DEMO_NOT_FOUND" ||
    outcome === "DEMO_DEALER_NOT_FOUND" ||
    outcome === "DEMO_REQUEST_NOT_FOUND"
  ) {
    return 404;
  }

  if (
    outcome === "DEMO_INVALID_INPUT" ||
    outcome === "DEMO_INVALID_ACTION" ||
    outcome === "DEMO_INVALID_REASON" ||
    outcome === "DEMO_INVALID_PLAN" ||
    outcome === "DEMO_PROFILE_INVALID"
  ) {
    return 400;
  }

  return 422;
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
    linked_dealer_id: normalizeText(raw.linked_dealer_id),
  };
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

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
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

  if (!requestId || !action || !["mark_contacted", "activate_demo", "reject", "revoke_demo", "convert_demo", "view_document", "download_document"].includes(action)) {
    return NextResponse.json({ error: "Dati richiesta non validi." }, { status: 400 });
  }

  const clientIp = resolveClientIp(request);
  const rateLimitKey = `admin-mutate:demo-requests:${action}:${context.userId}:${clientIp}`;
  const rateLimit = hitRateLimit(rateLimitKey, ADMIN_DEMO_REQUESTS_RATE_LIMIT);
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: "Troppi tentativi. Riprova tra poco." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds(rateLimit.resetAt)),
        },
      }
    );
  }

  const targetRequestResult = await context.supabaseAdmin
    .from("demo_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle<Record<string, unknown>>();

  if (targetRequestResult.error) {
    return NextResponse.json({ error: targetRequestResult.error.message || "Errore lettura richiesta demo." }, { status: 500 });
  }

  if (!targetRequestResult.data) {
    return NextResponse.json({ error: "Richiesta demo non trovata." }, { status: 404 });
  }

  const targetRequest = normalizeDemoRequestRow(targetRequestResult.data);

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

  if (action === "activate_demo" && targetRequest.status === "rejected") {
    return NextResponse.json({ error: "Richiesta demo rifiutata. Azione non consentita." }, { status: 409 });
  }

  if (action === "activate_demo" && targetRequest.status === "activated") {
    return NextResponse.json({ error: "Richiesta demo gia accettata. Azione non consentita." }, { status: 409 });
  }

  if (action === "reject" && targetRequest.status === "rejected") {
    return NextResponse.json({ error: "Richiesta demo gia rifiutata. Azione non consentita." }, { status: 409 });
  }

  const nextStatus = actionToStatus(action);

  if (action === "mark_contacted") {
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

  if (action === "activate_demo") {
    const now = new Date();
    const startedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const existingDealer = await context.supabaseAdmin
      .from("dealers")
      .select("id, status, account_type, demo_status")
      .eq("email", targetRequest.email)
      .limit(1)
      .maybeSingle<{ id: string; status: string | null; account_type: string | null; demo_status: string | null }>();

    if (existingDealer.error) {
      return NextResponse.json({ error: existingDealer.error.message || "Errore lookup dealer esistente." }, { status: 500 });
    }

    if (existingDealer.data) {
      const existingAccountType = (normalizeText(existingDealer.data.account_type) ?? "").toLowerCase();
      const existingDemoStatus = (normalizeText(existingDealer.data.demo_status) ?? "").toLowerCase();

      // Reusing this dealer row (matched by email) would overwrite a real subscriber's account
      // back into a demo — with decine di concessionari on the platform, this must never happen.
      if (existingAccountType === "paid" || existingDemoStatus === "converted") {
        return NextResponse.json(
          { error: "Esiste gia un account abbonato con questa email. Attivazione demo non consentita." },
          { status: 409 }
        );
      }
    }

    const dealerId = existingDealer.data?.id ?? crypto.randomUUID();
    const dealerUpsert = await context.supabaseAdmin.from("dealers").upsert(
      {
        id: dealerId,
        name: targetRequest.dealership_name,
        legal_name: targetRequest.dealership_name,
        contact_person: targetRequest.contact_name,
        email: targetRequest.email,
        phone: targetRequest.phone,
        city: targetRequest.city,
        status: existingDealer.data?.status ?? "approved",
        account_type: "demo",
        demo_status: "provisioning",
        demo_started_at: startedAt,
        demo_expires_at: expiresAt,
        demo_request_id: requestId,
        demo_approved_by: context.userId,
        demo_approved_at: startedAt,
        updated_at: startedAt,
      },
      { onConflict: "id" }
    );

    if (dealerUpsert.error) {
      return NextResponse.json({ error: dealerUpsert.error.message || "Errore creazione dealer demo." }, { status: 500 });
    }

    const generatedPassword = `${crypto.randomUUID()}-${Date.now()}`;
    const createdUser = await context.supabaseAdmin.auth.admin.createUser({
      email: targetRequest.email,
      password: generatedPassword,
      email_confirm: true,
      user_metadata: {
        role: "dealer_member",
      },
    });

    if (createdUser.error || !createdUser.data?.user?.id) {
      return NextResponse.json({ error: createdUser.error?.message || "Errore creazione utente demo." }, { status: 500 });
    }

    const profileId = createdUser.data.user.id;
    const profileUpsert = await context.supabaseAdmin.from("profiles").upsert(
      {
        id: profileId,
        dealer_id: dealerId,
        full_name: targetRequest.contact_name,
        role: "dealer_member",
        status: "active",
        updated_at: startedAt,
      },
      { onConflict: "id" }
    );

    if (profileUpsert.error) {
      return NextResponse.json({ error: profileUpsert.error.message || "Errore creazione profilo demo." }, { status: 500 });
    }

    const membershipUpsert = await context.supabaseAdmin.from("dealer_users").upsert(
      {
        dealer_id: dealerId,
        profile_id: profileId,
        role: "dealer_member",
        status: "active",
        updated_at: startedAt,
      },
      { onConflict: "dealer_id,profile_id" }
    );

    if (membershipUpsert.error) {
      return NextResponse.json({ error: membershipUpsert.error.message || "Errore creazione membership demo." }, { status: 500 });
    }

    const configureResult = await context.supabaseAdmin.rpc("configure_demo_profile", {
      p_dealer_id: dealerId,
      p_demo_request_id: requestId,
      p_profile_code: "base",
      p_actor_id: context.userId,
    });

    if (configureResult.error) {
      return NextResponse.json({ error: "Errore attivazione demo. Riprova." }, { status: 500 });
    }

    const configurePayload = normalizeRpcPayload(configureResult.data);
    const configureOutcome = normalizeText(configurePayload.outcome) ?? "DEMO_UNKNOWN_ERROR";

    if (configureOutcome !== "DEMO_CONFIGURED" && configureOutcome !== "DEMO_CONFIG_NOOP") {
      return NextResponse.json({ error: "Attivazione demo non consentita nello stato corrente." }, { status: toHttpStatusFromOutcome(configureOutcome) });
    }

    const activationAttemptId = crypto.randomUUID();
    const reserveResult = await context.supabaseAdmin.rpc("reserve_demo_activation", {
      p_dealer_id: dealerId,
      p_actor_id: context.userId,
      p_attempt_id: activationAttemptId,
    });

    if (reserveResult.error) {
      return NextResponse.json({ error: "Errore attivazione demo. Riprova." }, { status: 500 });
    }

    const reservePayload = normalizeRpcPayload(reserveResult.data);
    const reserveOutcome = normalizeText(reservePayload.outcome) ?? "DEMO_UNKNOWN_ERROR";
    const reserveAccepted = reserveOutcome === "DEMO_RESERVED" || reserveOutcome === "DEMO_RESERVATION_NOOP" || reserveOutcome === "DEMO_ALREADY_ACTIVE";

    if (!reserveAccepted) {
      return NextResponse.json({ error: "Attivazione demo non consentita nello stato corrente." }, { status: toHttpStatusFromOutcome(reserveOutcome) });
    }

    if (reserveOutcome !== "DEMO_ALREADY_ACTIVE") {
      const progressStates = ["auth_ready", "dealer_ready", "profile_ready", "membership_ready"] as const;
      for (const state of progressStates) {
        const progressResult = await context.supabaseAdmin.rpc("record_demo_activation_progress", {
          p_dealer_id: dealerId,
          p_actor_id: context.userId,
          p_attempt_id: activationAttemptId,
          p_state: state,
        });

        if (progressResult.error) {
          await context.supabaseAdmin.rpc("fail_demo_activation", {
            p_dealer_id: dealerId,
            p_actor_id: context.userId,
            p_attempt_id: activationAttemptId,
            p_reason: "Activation flow failed",
          });
          return NextResponse.json({ error: "Errore attivazione demo. Riprova." }, { status: 500 });
        }

        const progressPayload = normalizeRpcPayload(progressResult.data);
        const progressOutcome = normalizeText(progressPayload.outcome) ?? "DEMO_UNKNOWN_ERROR";
        if (progressOutcome !== "DEMO_PROGRESS_RECORDED") {
          await context.supabaseAdmin.rpc("fail_demo_activation", {
            p_dealer_id: dealerId,
            p_actor_id: context.userId,
            p_attempt_id: activationAttemptId,
            p_reason: "Activation flow failed",
          });
          return NextResponse.json({ error: "Attivazione demo non consentita nello stato corrente." }, { status: toHttpStatusFromOutcome(progressOutcome) });
        }
      }

      const finalizeResult = await context.supabaseAdmin.rpc("finalize_demo_activation", {
        p_dealer_id: dealerId,
        p_actor_id: context.userId,
        p_attempt_id: activationAttemptId,
        p_profile_id: profileId,
        p_demo_request_id: requestId,
      });

      if (finalizeResult.error) {
        await context.supabaseAdmin.rpc("fail_demo_activation", {
          p_dealer_id: dealerId,
          p_actor_id: context.userId,
          p_attempt_id: activationAttemptId,
          p_reason: "Activation flow failed",
        });
        return NextResponse.json({ error: "Errore attivazione demo. Riprova." }, { status: 500 });
      }

      const finalizePayload = normalizeRpcPayload(finalizeResult.data);
      const finalizeOutcome = normalizeText(finalizePayload.outcome) ?? "DEMO_UNKNOWN_ERROR";
      if (finalizeOutcome !== "DEMO_ACTIVATED" && finalizeOutcome !== "DEMO_FINALIZE_NOOP") {
        await context.supabaseAdmin.rpc("fail_demo_activation", {
          p_dealer_id: dealerId,
          p_actor_id: context.userId,
          p_attempt_id: activationAttemptId,
          p_reason: "Activation flow failed",
        });
        return NextResponse.json({ error: "Attivazione demo non consentita nello stato corrente." }, { status: toHttpStatusFromOutcome(finalizeOutcome) });
      }
    }

    const subscriptionLookup = await context.supabaseAdmin
      .from("dealer_demo_subscriptions")
      .select("dealer_id, demo_status, expires_at")
      .eq("dealer_id", dealerId)
      .maybeSingle<{ dealer_id: string; demo_status: string | null; expires_at: string | null }>();

    if (subscriptionLookup.error) {
      return NextResponse.json({ error: "Errore lettura stato demo attivata." }, { status: 500 });
    }

    const demoStatus = normalizeText(subscriptionLookup.data?.demo_status) ?? "active";
    const demoExpiresAt = normalizeText(subscriptionLookup.data?.expires_at) ?? expiresAt;

    const dealerStateUpdate = await context.supabaseAdmin
      .from("dealers")
      .update({
        account_type: "demo",
        demo_status: demoStatus,
        demo_started_at: startedAt,
        demo_expires_at: demoExpiresAt,
        demo_request_id: requestId,
        demo_approved_by: context.userId,
        demo_approved_at: startedAt,
        updated_at: startedAt,
      })
      .eq("id", dealerId);

    if (dealerStateUpdate.error) {
      return NextResponse.json({ error: "Errore aggiornamento stato dealer demo." }, { status: 500 });
    }

    const demoRequestSync = await context.supabaseAdmin
      .from("demo_requests")
      .update({
        status: "activated",
        demo_status: demoStatus,
        demo_expires_at: demoExpiresAt,
        linked_dealer_id: dealerId,
        updated_at: startedAt,
      })
      .eq("id", requestId);

    if (demoRequestSync.error) {
      return NextResponse.json({ error: "Errore aggiornamento richiesta demo." }, { status: 500 });
    }

    await createDemoAccessAuditEntry(context.supabaseAdmin, {
      dealerId,
      actorProfileId: context.userId,
      action: "demo.approved",
      metadata: {
        requestId,
        email: targetRequest.email,
      },
    });

    await sendPlatformEmail({
      toEmail: targetRequest.email,
      subject: "Demo Dealer Platform attivata",
      html: `
        <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
          <h2 style="margin:0 0 12px;">Demo attivata</h2>
          <p style="margin:0 0 12px;">La tua demo Dealer Platform e stata attivata per 7 giorni.</p>
          <p style="margin:0 0 12px;">Concessionaria: <strong>${targetRequest.dealership_name}</strong></p>
          <p style="margin:0 0 12px;">Scadenza: <strong>${expiresAt}</strong></p>
          <p style="margin:0 0 12px;">Limiti: max 10 veicoli, 20 lead, nessuna esportazione/importazione di massa.</p>
        </div>
      `.trim(),
    });

    await sendDemoLifecycleEmail({
      toEmail: targetRequest.email,
      kind: "approved",
      dealerName: targetRequest.dealership_name,
      expiresAt: expiresAt,
    });
  }

  if (action === "reject" || action === "revoke_demo") {
    let dealerId = normalizeText(targetRequest.linked_dealer_id);
    if (!dealerId) {
      const linkedDealerResult = await context.supabaseAdmin
        .from("dealers")
        .select("id")
        .eq("demo_request_id", requestId)
        .limit(1)
        .maybeSingle<{ id: string }>();

      if (linkedDealerResult.error) {
        return NextResponse.json({ error: "Errore lettura dealer collegato." }, { status: 500 });
      }

      dealerId = normalizeText(linkedDealerResult.data?.id);
    }

    if (!dealerId) {
      if (action === "revoke_demo") {
        return NextResponse.json({ error: "Errore lettura dealer collegato." }, { status: 404 });
      }

      // No dealer/demo lifecycle exists yet for this request (never activated) — a plain status update suffices.
      const updateResult = await context.supabaseAdmin
        .from("demo_requests")
        .update({
          status: "rejected",
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (updateResult.error) {
        return NextResponse.json({ error: updateResult.error.message || "Errore aggiornamento stato richiesta demo." }, { status: 500 });
      }
    } else {
      const subscriptionResult = await context.supabaseAdmin
        .from("dealer_demo_subscriptions")
        .select("dealer_id, lifecycle_version")
        .eq("dealer_id", dealerId)
        .maybeSingle<DealerDemoSubscriptionRow>();

      if (subscriptionResult.error) {
        return NextResponse.json({ error: "Errore lettura stato demo." }, { status: 500 });
      }

      if (!subscriptionResult.data) {
        return NextResponse.json({ error: "Errore lettura stato demo." }, { status: 404 });
      }

      const lifecycleVersion = Number(subscriptionResult.data.lifecycle_version);
      if (!Number.isFinite(lifecycleVersion)) {
        return NextResponse.json({ error: "Errore stato demo non valido." }, { status: 500 });
      }

      const rejectResult = await context.supabaseAdmin.rpc("reject_demo_request_atomic", {
        p_request_id: requestId,
        p_dealer_id: dealerId,
        p_actor_id: context.userId,
        p_reason: action === "revoke_demo" ? "Demo revoked by admin" : "Demo request rejected by admin",
        p_lifecycle_version: lifecycleVersion,
      });

      if (rejectResult.error) {
        return NextResponse.json({ error: "Errore rifiuto demo. Riprova." }, { status: 500 });
      }

      const rejectPayload = normalizeRpcPayload(rejectResult.data);
      const rejectOutcome = normalizeText(rejectPayload.outcome) ?? "DEMO_UNKNOWN_ERROR";

      if (rejectOutcome !== "DEMO_REJECTED") {
        return NextResponse.json({ error: "Rifiuto demo non consentito nello stato corrente." }, { status: toHttpStatusFromOutcome(rejectOutcome) });
      }

      const rejectRequest = rejectPayload.request ?? {};
      const rejectDealer = rejectPayload.dealer ?? {};

      return NextResponse.json(
        {
          requestId,
          status: normalizeText(rejectRequest.status) ?? "rejected",
          demoStatus: normalizeText(rejectRequest.demo_status) ?? "revoked",
          demoExpiresAt: normalizeText(rejectRequest.demo_expires_at),
          linkedDealerId: normalizeText(rejectRequest.linked_dealer_id) ?? normalizeText(rejectDealer.id) ?? dealerId,
        },
        { status: 200 }
      );
    }
  }

  if (action === "convert_demo") {
    const now = new Date().toISOString();
    const { error: convertError } = await context.supabaseAdmin
      .from("dealers")
      .update({
        account_type: "paid",
        demo_status: "converted",
        demo_converted_at: now,
        updated_at: now,
      })
      .eq("demo_request_id", requestId);

    if (convertError) {
      return NextResponse.json({ error: convertError.message || "Errore conversione demo." }, { status: 500 });
    }

    const demoRequestUpdate = await context.supabaseAdmin
      .from("demo_requests")
      .update({
        status: "converted",
        demo_status: "converted",
        updated_at: now,
      })
      .eq("id", requestId);

    if (demoRequestUpdate.error) {
      return NextResponse.json({ error: demoRequestUpdate.error.message || "Errore aggiornamento richiesta demo." }, { status: 500 });
    }

    await createDemoAccessAuditEntry(context.supabaseAdmin, {
      dealerId: null,
      actorProfileId: context.userId,
      action: "demo.converted",
      metadata: { requestId },
    });

    await sendDemoLifecycleEmail({
      toEmail: targetRequest.email,
      kind: "converted",
      dealerName: targetRequest.dealership_name,
    });
  }

  const refreshedRequest = await context.supabaseAdmin
    .from("demo_requests")
    .select("status, demo_status, demo_expires_at, linked_dealer_id")
    .eq("id", requestId)
    .maybeSingle<Record<string, unknown>>();

  if (refreshedRequest.error) {
    return NextResponse.json({ error: "Errore lettura stato richiesta demo." }, { status: 500 });
  }

  return NextResponse.json(
    {
      requestId,
      status: normalizeText(refreshedRequest.data?.status) ?? nextStatus,
      demoStatus: normalizeText(refreshedRequest.data?.demo_status),
      demoExpiresAt: normalizeText(refreshedRequest.data?.demo_expires_at),
      linkedDealerId: normalizeText(refreshedRequest.data?.linked_dealer_id),
    },
    { status: 200 }
  );
}
