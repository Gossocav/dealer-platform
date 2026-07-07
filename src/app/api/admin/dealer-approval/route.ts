import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";

type DealerApprovalAction = "approve" | "reject";

type DealerApprovalRequestBody = {
  dealerId?: string;
  action?: DealerApprovalAction;
};

type DealerListRow = {
  id: string;
  legal_name: string | null;
  name: string | null;
  vat_number: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  created_at: string | null;
};

type ProfileRoleRow = {
  role: string | null;
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

  const metadataRole = resolveUserRoleFromMetadata(user);

  let isAuthorized = isPlatformAdminRole(metadataRole);

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

  const dealers = await context.supabaseAdmin
    .from("dealers")
    .select("id, legal_name, name, vat_number, contact_person, email, phone, status, created_at")
    .eq("status", "pending_review")
    .order("created_at", { ascending: true })
    .returns<DealerListRow[]>();

  if (dealers.error) {
    return NextResponse.json({ error: dealers.error.message || "Errore caricamento dealer in verifica." }, { status: 500 });
  }

  return NextResponse.json({ dealers: dealers.data ?? [] }, { status: 200 });
}

export async function POST(request: Request) {
  const context = await resolveAdminContext(request);

  if (context.error) {
    return context.error;
  }

  if (!context.supabaseAdmin) {
    return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
  }

  let body: DealerApprovalRequestBody;
  try {
    body = (await request.json()) as DealerApprovalRequestBody;
  } catch {
    return NextResponse.json({ error: "Payload non valido." }, { status: 400 });
  }

  const dealerId = normalizeText(body.dealerId);
  const action = body.action;

  if (!dealerId || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Dati richiesta non validi." }, { status: 400 });
  }

  const dealerStatus = action === "approve" ? "approved" : "rejected";
  const membershipStatus = action === "approve" ? "active" : "disabled";

  const dealerUpdate = await context.supabaseAdmin
    .from("dealers")
    .update({
      status: dealerStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dealerId);

  if (dealerUpdate.error) {
    return NextResponse.json({ error: dealerUpdate.error.message || "Errore aggiornamento stato dealer." }, { status: 500 });
  }

  const membershipUpdate = await context.supabaseAdmin
    .from("dealer_users")
    .update({
      status: membershipStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("dealer_id", dealerId);

  if (membershipUpdate.error) {
    return NextResponse.json({ error: membershipUpdate.error.message || "Errore aggiornamento membership dealer." }, { status: 500 });
  }

  return NextResponse.json(
    {
      dealerId,
      dealerStatus,
      membershipStatus,
    },
    { status: 200 }
  );
}
