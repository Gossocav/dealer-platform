import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { hitRateLimit } from "../../../../lib/api-rate-limit";
import { sendAdminNotificationEmail } from "../../../../lib/admin-notification-email";
import { resolveDealerIdFromTenantSources } from "../../../../lib/dealer-id-resolution";
import { getDemoPlan, normalizeDemoPlanCode } from "../../../../lib/demo-plan-catalog";

const PLAN_REQUEST_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 5,
} as const;

type DealerRow = {
  id: string;
  name: string | null;
  account_type: string | null;
};

type SubscriptionRow = {
  requested_plan_code: string | null;
  requested_plan_at: string | null;
  converted_plan_code: string | null;
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

async function resolveDealerContext(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return {
      error: NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 }),
      supabaseAdmin: null,
      userId: null,
      dealerId: null,
    } as const;
  }

  const accessToken = extractBearerToken(request.headers.get("authorization"));

  if (!accessToken) {
    return {
      error: NextResponse.json({ error: "Sessione non valida." }, { status: 401 }),
      supabaseAdmin: null,
      userId: null,
      dealerId: null,
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
      dealerId: null,
    } as const;
  }

  let dealerId: string | null = null;

  try {
    dealerId = await resolveDealerIdFromTenantSources(supabaseAdmin, user.id);
  } catch (error) {
    return {
      error: NextResponse.json(
        { error: error instanceof Error ? error.message : "Errore risoluzione concessionaria." },
        { status: 500 }
      ),
      supabaseAdmin: null,
      userId: null,
      dealerId: null,
    } as const;
  }

  if (!dealerId) {
    return {
      error: NextResponse.json({ error: "Nessuna concessionaria associata a questo account." }, { status: 403 }),
      supabaseAdmin: null,
      userId: null,
      dealerId: null,
    } as const;
  }

  return {
    error: null,
    supabaseAdmin,
    userId: user.id,
    dealerId,
  } as const;
}

export async function GET(request: Request) {
  const context = await resolveDealerContext(request);

  if (context.error) {
    return context.error;
  }

  const dealer = await context.supabaseAdmin
    .from("dealers")
    .select("id, name, account_type")
    .eq("id", context.dealerId)
    .maybeSingle<DealerRow>();

  if (dealer.error) {
    return NextResponse.json({ error: dealer.error.message || "Errore lettura concessionaria." }, { status: 500 });
  }

  // dealer_demo_subscriptions is looked up regardless of account_type: a
  // dealer whose demo was just converted is now account_type "paid", but
  // this row (and its converted_plan_code) is still the only record of
  // which plan they actually have -- dealers.subscription_plan is a
  // separate, legacy base/pro-only field never touched by the demo
  // conversion flow.
  const subscription = await context.supabaseAdmin
    .from("dealer_demo_subscriptions")
    .select("requested_plan_code, requested_plan_at, converted_plan_code")
    .eq("dealer_id", context.dealerId)
    .maybeSingle<SubscriptionRow>();

  if (subscription.error) {
    return NextResponse.json({ error: subscription.error.message || "Errore lettura piano." }, { status: 500 });
  }

  const isDemo = normalizeText(dealer.data?.account_type)?.toLowerCase() === "demo";

  return NextResponse.json(
    {
      requestedPlanCode: isDemo ? (normalizeDemoPlanCode(subscription.data?.requested_plan_code) ?? null) : null,
      requestedPlanAt: isDemo ? normalizeText(subscription.data?.requested_plan_at) : null,
      activePlanCode: normalizeDemoPlanCode(subscription.data?.converted_plan_code) ?? null,
    },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  const context = await resolveDealerContext(request);

  if (context.error) {
    return context.error;
  }

  const rateLimit = hitRateLimit(`demo-plan-request:${context.userId}`, PLAN_REQUEST_RATE_LIMIT);

  if (rateLimit.limited) {
    return NextResponse.json({ error: "Troppi tentativi. Riprova tra poco." }, { status: 429 });
  }

  let body: { planCode?: string } = {};

  try {
    body = (await request.json()) as { planCode?: string };
  } catch {
    return NextResponse.json({ error: "Payload non valido." }, { status: 400 });
  }

  const planCode = normalizeDemoPlanCode(body.planCode);

  if (!planCode) {
    return NextResponse.json({ error: "Piano non valido." }, { status: 400 });
  }

  const dealer = await context.supabaseAdmin
    .from("dealers")
    .select("id, name, account_type")
    .eq("id", context.dealerId)
    .maybeSingle<DealerRow>();

  if (dealer.error) {
    return NextResponse.json({ error: dealer.error.message || "Errore lettura concessionaria." }, { status: 500 });
  }

  if (normalizeText(dealer.data?.account_type)?.toLowerCase() !== "demo") {
    return NextResponse.json({ error: "Questa funzione e disponibile solo per account in demo." }, { status: 403 });
  }

  const requestedPlanAt = new Date().toISOString();

  const update = await context.supabaseAdmin
    .from("dealer_demo_subscriptions")
    .update({ requested_plan_code: planCode, requested_plan_at: requestedPlanAt })
    .eq("dealer_id", context.dealerId);

  if (update.error) {
    return NextResponse.json({ error: update.error.message || "Errore invio richiesta piano." }, { status: 500 });
  }

  const plan = getDemoPlan(planCode);
  const notificationResult = await sendAdminNotificationEmail({
    subject: "Richiesta piano da un dealer in demo",
    html: `
      <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
        <h2 style="margin:0 0 12px;">Richiesta piano dalla demo</h2>
        <p style="margin:0 0 12px;">Concessionaria: <strong>${dealer.data?.name ?? "-"}</strong></p>
        <p style="margin:0 0 12px;">Piano richiesto: <strong>${plan?.name ?? planCode}</strong></p>
        <p style="margin:0 0 12px;">Vai su /admin/demo-requests per attivarlo.</p>
      </div>
    `.trim(),
  });

  if (!notificationResult.ok) {
    console.error("demo-plan-request:admin-notification-error", notificationResult);
  }

  return NextResponse.json({ requestedPlanCode: planCode, requestedPlanAt }, { status: 200 });
}
