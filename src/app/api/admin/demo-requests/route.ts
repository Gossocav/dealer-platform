import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";
import { sendPlatformEmail } from "@/lib/admin-notification-email";

type DemoRequestStatus = "pending" | "contacted" | "activated" | "rejected";
type DemoAdminAction = "mark_contacted" | "activate_demo" | "reject";

type ProfileRoleRow = {
  role: string | null;
};

type DemoRequestRow = {
  id: string;
  dealership_name: string;
  contact_name: string;
  email: string;
  phone: string;
  city: string;
  vehicle_count: number | null;
  message: string | null;
  status: DemoRequestStatus;
  created_at: string;
  updated_at: string;
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
    } as const;
  }

  const accessToken = extractBearerToken(request.headers.get("authorization"));

  if (!accessToken) {
    return {
      error: NextResponse.json({ error: "Sessione non valida." }, { status: 401 }),
      supabaseAdmin: null,
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
    } as const;
  }

  let isAuthorized = isPlatformAdminRole(resolveUserRoleFromMetadata(user));

  if (!isAuthorized) {
    const profileRole = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).maybeSingle<ProfileRoleRow>();

    if (profileRole.error) {
      return {
        error: NextResponse.json({ error: profileRole.error.message || "Errore verifica autorizzazioni." }, { status: 500 }),
        supabaseAdmin: null,
      } as const;
    }

    isAuthorized = isPlatformAdminRole(profileRole.data?.role);
  }

  if (!isAuthorized) {
    return {
      error: NextResponse.json({ error: "Accesso negato." }, { status: 403 }),
      supabaseAdmin: null,
    } as const;
  }

  return {
    error: null,
    supabaseAdmin,
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
    .select("id, dealership_name, contact_name, email, phone, city, vehicle_count, message, status, created_at, updated_at")
    .order("created_at", { ascending: false })
    .returns<DemoRequestRow[]>();

  if (requests.error) {
    return NextResponse.json({ error: requests.error.message || "Errore caricamento richieste demo." }, { status: 500 });
  }

  return NextResponse.json({ requests: requests.data ?? [] }, { status: 200 });
}

export async function POST(request: Request) {
  const context = await resolveAdminContext(request);

  if (context.error) {
    return context.error;
  }

  if (!context.supabaseAdmin) {
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

  if (!requestId || !action || !["mark_contacted", "activate_demo", "reject"].includes(action)) {
    return NextResponse.json({ error: "Dati richiesta non validi." }, { status: 400 });
  }

  const targetRequest = await context.supabaseAdmin
    .from("demo_requests")
    .select("id, dealership_name, contact_name, email, phone, city, vehicle_count, message, status, created_at, updated_at")
    .eq("id", requestId)
    .maybeSingle<DemoRequestRow>();

  if (targetRequest.error) {
    return NextResponse.json({ error: targetRequest.error.message || "Errore lettura richiesta demo." }, { status: 500 });
  }

  if (!targetRequest.data) {
    return NextResponse.json({ error: "Richiesta demo non trovata." }, { status: 404 });
  }

  const nextStatus = actionToStatus(action);
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

  if (action === "activate_demo") {
    const emailResult = await sendPlatformEmail({
      toEmail: targetRequest.data.email,
      subject: "Demo Dealer Platform attivata",
      html: `
        <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
          <p>La tua demo Dealer Platform e stata attivata. Ti contatteremo per completare l'accesso.</p>
        </div>
      `.trim(),
    });

    if (!emailResult.ok) {
      console.error("Demo activation email provider error", emailResult);
    }
  }

  return NextResponse.json({ requestId, status: nextStatus }, { status: 200 });
}
