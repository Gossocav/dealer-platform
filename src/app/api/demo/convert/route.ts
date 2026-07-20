import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";
import { hitRateLimit } from "@/lib/api-rate-limit";
import { resolveDemoLifecycleVersion, toHttpStatusFromOutcome } from "../../../../lib/demo-lifecycle-http";

const ADMIN_DEMO_ACTION_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 10,
} as const;

function extractBearerToken(authHeader: string | null) {
  const raw = String(authHeader ?? "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return raw.slice(7).trim();
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
  const deltaMs = resetAt - Date.now();
  return Math.max(1, Math.ceil(deltaMs / 1000));
}

export async function POST(request: Request) {
  const accessToken = extractBearerToken(request.headers.get("authorization"));
  if (!accessToken) {
    return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !user) {
    return NextResponse.json({ error: "Utente non autenticato." }, { status: 401 });
  }

  let isAuthorized = isPlatformAdminRole(resolveUserRoleFromMetadata(user));
  if (!isAuthorized) {
    const profile = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role: string | null }>();
    isAuthorized = isPlatformAdminRole(profile.data?.role);
  }

  if (!isAuthorized) {
    return NextResponse.json({ error: "Accesso negato." }, { status: 403 });
  }

  const clientIp = resolveClientIp(request);
  const rateLimitKey = `admin-demo-action:convert:${user.id}:${clientIp}`;
  const rateLimit = hitRateLimit(rateLimitKey, ADMIN_DEMO_ACTION_RATE_LIMIT);
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

  const body = (await request.json().catch(() => ({}))) as { dealerId?: string };
  const dealerId = String(body.dealerId ?? "").trim();
  if (!dealerId) {
    return NextResponse.json({ error: "dealerId obbligatorio." }, { status: 400 });
  }

  const dealerLookup = await supabaseAdmin
    .from("dealers")
    .select("demo_request_id")
    .eq("id", dealerId)
    .maybeSingle<{ demo_request_id: string | null }>();

  if (dealerLookup.error) {
    return NextResponse.json({ error: "Errore lettura dealer." }, { status: 500 });
  }

  const requestId = String(dealerLookup.data?.demo_request_id ?? "").trim();
  if (!requestId) {
    return NextResponse.json({ error: "Nessuna richiesta demo collegata a questo dealer." }, { status: 404 });
  }

  const lifecycleVersionResult = await resolveDemoLifecycleVersion(supabaseAdmin, dealerId);
  if (!lifecycleVersionResult.ok) {
    return lifecycleVersionResult.response;
  }
  const { lifecycleVersion } = lifecycleVersionResult;

  const convertResult = await supabaseAdmin.rpc("convert_demo_request_atomic", {
    p_request_id: requestId,
    p_dealer_id: dealerId,
    p_actor_id: user.id,
    p_lifecycle_version: lifecycleVersion,
  });

  if (convertResult.error) {
    return NextResponse.json({ error: "Errore conversione demo. Riprova." }, { status: 500 });
  }

  const outcome = String((convertResult.data as { outcome?: string } | null)?.outcome ?? "DEMO_UNKNOWN_ERROR");
  if (outcome !== "DEMO_CONVERTED") {
    return NextResponse.json({ error: "Conversione demo non consentita nello stato corrente." }, { status: toHttpStatusFromOutcome(outcome) });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
