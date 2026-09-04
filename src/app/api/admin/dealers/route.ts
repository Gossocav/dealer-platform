import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { resolveActivePlanCode } from "@/lib/dealer-plan";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";
import { sendDealerLifecycleEmail } from "@/lib/dealer-account-emails";

// Il pannello admin mostra conteggi ed elenchi operativi: una risposta
// riusata dalla cache farebbe vedere dati vecchi (concessionarie gia'
// approvate, richieste demo non ancora comparse) senza alcun segnale.
export const dynamic = "force-dynamic";

type DealerAdminAction = "approve" | "reject" | "suspend" | "reactivate" | "cancel";

type DealerAdminRequestBody = {
  dealerId?: string;
  action?: DealerAdminAction;
};

type DealerListRow = {
  id: string;
  legal_name: string | null;
  name: string | null;
  vat_number: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  /**
   * Sito e social: raccolti nelle Impostazioni del concessionario e mostrati
   * **solo qui**. Le pagine pubbliche non li nominano piu' dal 03/09/2026 --
   * chi cerca un'automobile deve restare sulla piattaforma -- ma il titolare
   * ha bisogno di sapere chi ha un sito e chi e' attivo sui social prima di
   * telefonargli. Vedi `src/lib/collegamenti-in-pannello.ts`.
   */
  website: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  linkedin_url: string | null;
  status: string | null;
  subscription_plan: string | null;
  subscription_status: string | null;
  created_at: string | null;
  /** Il piano che vale davvero, ricavato dalla riga di abbonamento. */
  active_plan_code?: string | null;
};

type DealerStatusRow = {
  id: string;
  legal_name: string | null;
  name: string | null;
  email: string | null;
  status: string | null;
};

type ProfileRoleRow = {
  role: string | null;
};

const SUPPORTED_DEALER_STATUSES = ["pending_review", "approved", "rejected", "suspended", "cancelled"] as const;

const ALLOWED_ACTIONS_BY_STATUS: Record<string, DealerAdminAction[]> = {
  pending_review: ["approve", "reject", "cancel"],
  approved: ["suspend", "cancel"],
  suspended: ["reactivate", "cancel"],
  rejected: ["approve", "cancel"],
  cancelled: [],
};

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function normalizeStatus(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
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

function toDealerAndMembershipStatus(action: DealerAdminAction) {
  if (action === "approve") {
    return { dealerStatus: "approved", membershipStatus: "active" } as const;
  }

  if (action === "reject") {
    return { dealerStatus: "rejected", membershipStatus: "disabled" } as const;
  }

  if (action === "suspend") {
    return { dealerStatus: "suspended", membershipStatus: "disabled" } as const;
  }

  if (action === "reactivate") {
    return { dealerStatus: "approved", membershipStatus: "active" } as const;
  }

  return { dealerStatus: "cancelled", membershipStatus: "disabled" } as const;
}

function canApplyAction(currentStatus: string | null, action: DealerAdminAction) {
  const normalizedStatus = normalizeStatus(currentStatus);

  if (!normalizedStatus) {
    return false;
  }

  const allowed = ALLOWED_ACTIONS_BY_STATUS[normalizedStatus] ?? [];
  return allowed.includes(action);
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

  const metadataRole = resolveUserRoleFromMetadata(user);

  let isAuthorized = isPlatformAdminRole(metadataRole);

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

  const dealers = await context.supabaseAdmin
    .from("dealers")
    .select(
      "id, legal_name, name, vat_number, contact_person, email, phone, website, facebook_url, instagram_url, linkedin_url, status, subscription_plan, subscription_status, created_at"
    )
    .in("status", [...SUPPORTED_DEALER_STATUSES])
    .order("created_at", { ascending: false })
    .returns<DealerListRow[]>();

  if (dealers.error) {
    return NextResponse.json({ error: dealers.error.message || "Errore caricamento elenco dealer." }, { status: 500 });
  }

  const elenco = dealers.data ?? [];

  // Il piano non si legge da dealers.subscription_plan: quella colonna resta
  // al valore della registrazione e la conversione non la tocca, quindi
  // diceva "Base" anche a chi aveva attivato Elite. Il piano in vigore sta
  // sulla riga di abbonamento, ed e' la stessa fonte che il database usa per
  // decidere quanti annunci si possono pubblicare.
  const pianoPerDealer = new Map<string, { converted: string | null; demo: string | null }>();

  if (elenco.length > 0) {
    const abbonamenti = await context.supabaseAdmin
      .from("dealer_demo_subscriptions")
      .select("dealer_id, converted_plan_code, demo_profile_code")
      .in("dealer_id", elenco.map((dealer) => dealer.id))
      .returns<Array<{ dealer_id: string | null; converted_plan_code: string | null; demo_profile_code: string | null }>>();

    // Se questa lettura fallisce non si fa fallire l'elenco: si resta senza
    // piano, che e' un dato mancante e non un dato falso.
    if (!abbonamenti.error) {
      for (const riga of abbonamenti.data ?? []) {
        const chiave = String(riga.dealer_id ?? "").trim();
        if (!chiave) continue;
        pianoPerDealer.set(chiave, { converted: riga.converted_plan_code, demo: riga.demo_profile_code });
      }
    }
  }

  const conPiano = elenco.map((dealer) => {
    const fonti = pianoPerDealer.get(dealer.id);

    return {
      ...dealer,
      active_plan_code: resolveActivePlanCode({
        convertedPlanCode: fonti?.converted ?? null,
        demoProfileCode: fonti?.demo ?? null,
        legacyPlanCode: dealer.subscription_plan,
      }),
    };
  });

  return NextResponse.json({ dealers: conPiano }, { status: 200 });
}

export async function POST(request: Request) {
  const context = await resolveAdminContext(request);

  if (context.error) {
    return context.error;
  }

  if (!context.supabaseAdmin) {
    return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
  }

  let body: DealerAdminRequestBody;
  try {
    body = (await request.json()) as DealerAdminRequestBody;
  } catch {
    return NextResponse.json({ error: "Payload non valido." }, { status: 400 });
  }

  const dealerId = normalizeText(body.dealerId);
  const action = body.action;

  if (!dealerId || !action || !["approve", "reject", "suspend", "reactivate", "cancel"].includes(action)) {
    return NextResponse.json({ error: "Dati richiesta non validi." }, { status: 400 });
  }

  const dealerTarget = await context.supabaseAdmin
    .from("dealers")
    .select("id, legal_name, name, email, status")
    .eq("id", dealerId)
    .maybeSingle<DealerStatusRow>();

  if (dealerTarget.error) {
    return NextResponse.json({ error: dealerTarget.error.message || "Errore caricamento dati dealer." }, { status: 500 });
  }

  if (!dealerTarget.data) {
    return NextResponse.json({ error: "Dealer non trovato." }, { status: 404 });
  }

  if (!canApplyAction(dealerTarget.data.status, action)) {
    return NextResponse.json({ error: "Transizione di stato non consentita." }, { status: 409 });
  }

  const { dealerStatus, membershipStatus } = toDealerAndMembershipStatus(action);
  const nowIso = new Date().toISOString();

  const dealerUpdate = await context.supabaseAdmin
    .from("dealers")
    .update({
      status: dealerStatus,
      updated_at: nowIso,
    })
    .eq("id", dealerId);

  if (dealerUpdate.error) {
    return NextResponse.json({ error: dealerUpdate.error.message || "Errore aggiornamento stato dealer." }, { status: 500 });
  }

  const membershipUpdate = await context.supabaseAdmin
    .from("dealer_users")
    .update({
      status: membershipStatus,
      updated_at: nowIso,
    })
    .eq("dealer_id", dealerId);

  if (membershipUpdate.error) {
    return NextResponse.json({ error: membershipUpdate.error.message || "Errore aggiornamento membership dealer." }, { status: 500 });
  }

  const targetEmail = normalizeText(dealerTarget.data.email);
  const dealerName = normalizeText(dealerTarget.data.legal_name) || normalizeText(dealerTarget.data.name) || "Concessionaria";

  if (targetEmail && (action === "suspend" || action === "reactivate")) {
    try {
      const emailResult = await sendDealerLifecycleEmail({
        toEmail: targetEmail,
        dealerName,
        kind: action === "suspend" ? "suspended" : "reactivated",
      });

      if (!emailResult.ok) {
        console.error("Dealer lifecycle email provider error", emailResult);
      }
    } catch (emailError) {
      console.error("Dealer lifecycle email failed", emailError);
    }
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
