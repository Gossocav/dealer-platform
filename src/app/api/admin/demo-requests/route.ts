import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";
import { sendDemoLifecycleEmail, sendPlatformEmail } from "@/lib/admin-notification-email";
import { createDemoAccessAuditEntry } from "@/lib/demo-audit";

type DemoRequestStatus = "pending" | "contacted" | "activated" | "rejected";
type DemoAdminAction = "mark_contacted" | "activate_demo" | "reject" | "revoke_demo" | "convert_demo" | "view_document" | "download_document";

const DEMO_DOCUMENT_BUCKET = "demo-documents";

type ProfileRoleRow = {
  role: string | null;
};

type DemoRequestRow = {
  id: string;
  dealership_name: string;
  company_name: string | null;
  vat_number: string | null;
  contact_name: string;
  email: string;
  phone: string;
  city: string;
  vehicle_count: number | null;
  message: string | null;
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
    .select("id, dealership_name, company_name, vat_number, contact_name, email, phone, city, vehicle_count, message, chamber_document_path, chamber_document_name, chamber_document_mime_type, chamber_document_size, status, created_at, updated_at")
    .order("created_at", { ascending: false })
    .returns<DemoRequestRow[]>();

  if (requests.error) {
    return NextResponse.json({ error: requests.error.message || "Errore caricamento richieste demo." }, { status: 500 });
  }

  const requestIds = (requests.data ?? []).map((item) => item.id);
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
      .returns<Array<{
        id: string;
        demo_request_id: string | null;
        account_type: string | null;
        demo_status: string | null;
        demo_started_at: string | null;
        demo_expires_at: string | null;
      }>>();

    if (!dealers.error) {
      for (const dealer of dealers.data ?? []) {
        const key = String(dealer.demo_request_id ?? "").trim();
        if (!key) {
          continue;
        }

        dealerByRequestId.set(key, {
          id: dealer.id,
          account_type: dealer.account_type,
          demo_status: dealer.demo_status,
          demo_started_at: dealer.demo_started_at,
          demo_expires_at: dealer.demo_expires_at,
        });
      }
    }
  }

  const enriched = (requests.data ?? []).map((request) => {
    const linked = dealerByRequestId.get(request.id);

    return {
      ...request,
      linked_dealer_id: linked?.id ?? null,
      account_type: linked?.account_type ?? null,
      demo_status: linked?.demo_status ?? null,
      demo_started_at: linked?.demo_started_at ?? null,
      demo_expires_at: linked?.demo_expires_at ?? null,
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

  const targetRequest = await context.supabaseAdmin
    .from("demo_requests")
    .select("id, dealership_name, company_name, vat_number, contact_name, email, phone, city, vehicle_count, message, chamber_document_path, chamber_document_name, chamber_document_mime_type, chamber_document_size, status, created_at, updated_at")
    .eq("id", requestId)
    .maybeSingle<DemoRequestRow>();

  if (targetRequest.error) {
    return NextResponse.json({ error: targetRequest.error.message || "Errore lettura richiesta demo." }, { status: 500 });
  }

  if (!targetRequest.data) {
    return NextResponse.json({ error: "Richiesta demo non trovata." }, { status: 404 });
  }

  if (action === "view_document" || action === "download_document") {
    const objectPath = normalizeText(targetRequest.data.chamber_document_path);
    if (!objectPath) {
      return NextResponse.json({ error: "Documento visura non disponibile per questa richiesta." }, { status: 404 });
    }

    const signed = await context.supabaseAdmin.storage
      .from(DEMO_DOCUMENT_BUCKET)
      .createSignedUrl(objectPath, 120, action === "download_document" ? { download: targetRequest.data.chamber_document_name ?? true } : undefined);

    if (signed.error || !signed.data?.signedUrl) {
      return NextResponse.json({ error: "Impossibile generare link temporaneo." }, { status: 500 });
    }

    await context.supabaseAdmin.from("audit_logs").insert({
      dealer_id: targetRequest.data.linked_dealer_id ?? null,
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
        fileName: targetRequest.data.chamber_document_name,
        mimeType: targetRequest.data.chamber_document_mime_type,
      },
      { status: 200 }
    );
  }

  if (action === "mark_contacted" && targetRequest.data.status !== "pending") {
    return NextResponse.json({ error: "La richiesta non puo essere segnata come contattata nello stato corrente." }, { status: 409 });
  }

  if (action === "activate_demo" && targetRequest.data.status === "rejected") {
    return NextResponse.json({ error: "Richiesta demo rifiutata. Azione non consentita." }, { status: 409 });
  }

  if (action === "activate_demo" && targetRequest.data.status === "activated") {
    return NextResponse.json({ requestId, status: "activated" }, { status: 200 });
  }

  if (action === "reject" && targetRequest.data.status === "activated") {
    return NextResponse.json({ error: "Richiesta demo gia attivata. Usa Revoca Demo." }, { status: 409 });
  }

  const nextStatus = actionToStatus(action);

  if (action === "mark_contacted" || action === "activate_demo" || action === "reject") {
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
      .select("id, status")
      .eq("email", targetRequest.data.email)
      .limit(1)
      .maybeSingle<{ id: string; status: string | null }>();

    if (existingDealer.error) {
      return NextResponse.json({ error: existingDealer.error.message || "Errore lookup dealer esistente." }, { status: 500 });
    }

    const dealerId = existingDealer.data?.id ?? crypto.randomUUID();
    const dealerUpsert = await context.supabaseAdmin.from("dealers").upsert(
      {
        id: dealerId,
        name: targetRequest.data.dealership_name,
        legal_name: targetRequest.data.dealership_name,
        contact_person: targetRequest.data.contact_name,
        email: targetRequest.data.email,
        phone: targetRequest.data.phone,
        city: targetRequest.data.city,
        status: existingDealer.data?.status ?? "approved",
        account_type: "demo",
        demo_status: "active",
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
      email: targetRequest.data.email,
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
        full_name: targetRequest.data.contact_name,
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

    await createDemoAccessAuditEntry(context.supabaseAdmin, {
      dealerId,
      actorProfileId: context.userId,
      action: "demo.approved",
      metadata: {
        requestId,
        email: targetRequest.data.email,
      },
    });

    await sendPlatformEmail({
      toEmail: targetRequest.data.email,
      subject: "Demo Dealer Platform attivata",
      html: `
        <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
          <h2 style="margin:0 0 12px;">Demo attivata</h2>
          <p style="margin:0 0 12px;">La tua demo Dealer Platform e stata attivata per 7 giorni.</p>
          <p style="margin:0 0 12px;">Concessionaria: <strong>${targetRequest.data.dealership_name}</strong></p>
          <p style="margin:0 0 12px;">Scadenza: <strong>${expiresAt}</strong></p>
          <p style="margin:0 0 12px;">Limiti: max 10 veicoli, 20 lead, nessuna esportazione/importazione di massa.</p>
        </div>
      `.trim(),
    });

    await sendDemoLifecycleEmail({
      toEmail: targetRequest.data.email,
      kind: "approved",
      dealerName: targetRequest.data.dealership_name,
      expiresAt: expiresAt,
    });
  }

  if (action === "revoke_demo") {
    const now = new Date().toISOString();
    const { error: revokeError } = await context.supabaseAdmin
      .from("dealers")
      .update({
        demo_status: "revoked",
        demo_revoked_at: now,
        updated_at: now,
      })
      .eq("demo_request_id", requestId);

    if (revokeError) {
      return NextResponse.json({ error: revokeError.message || "Errore revoca demo." }, { status: 500 });
    }

    await createDemoAccessAuditEntry(context.supabaseAdmin, {
      dealerId: null,
      actorProfileId: context.userId,
      action: "demo.revoked",
      metadata: { requestId },
    });

    await sendDemoLifecycleEmail({
      toEmail: targetRequest.data.email,
      kind: "revoked",
      dealerName: targetRequest.data.dealership_name,
    });
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

    await createDemoAccessAuditEntry(context.supabaseAdmin, {
      dealerId: null,
      actorProfileId: context.userId,
      action: "demo.converted",
      metadata: { requestId },
    });

    await sendDemoLifecycleEmail({
      toEmail: targetRequest.data.email,
      kind: "converted",
      dealerName: targetRequest.data.dealership_name,
    });
  }

  const responseStatus = action === "revoke_demo"
    ? "activated"
    : action === "convert_demo"
      ? "activated"
      : nextStatus;

  return NextResponse.json({ requestId, status: responseStatus }, { status: 200 });
}
