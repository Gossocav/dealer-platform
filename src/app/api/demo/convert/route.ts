import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";

function extractBearerToken(authHeader: string | null) {
  const raw = String(authHeader ?? "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return raw.slice(7).trim();
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

  const body = (await request.json().catch(() => ({}))) as { dealerId?: string };
  const dealerId = String(body.dealerId ?? "").trim();
  if (!dealerId) {
    return NextResponse.json({ error: "dealerId obbligatorio." }, { status: 400 });
  }

  const linked = await supabaseAdmin.from("dealers").select("demo_request_id").eq("id", dealerId).maybeSingle<{ demo_request_id: string | null }>();
  if (linked.error || !linked.data?.demo_request_id) return NextResponse.json({ error: "Demo non trovata." }, { status: 404 });
  const transition = await supabaseAdmin.rpc("transition_demo_lifecycle", { p_request_id: linked.data.demo_request_id, p_actor_id: user.id, p_action: "convert_demo" });
  const outcome = transition.data && typeof transition.data === "object" && "outcome" in transition.data ? String(transition.data.outcome) : null;
  if (transition.error || !["updated", "already_applied"].includes(outcome ?? "")) return NextResponse.json({ error: "Conversione Demo non consentita." }, { status: 409 });
  return NextResponse.json({ ok: true }, { status: 200 });
}
