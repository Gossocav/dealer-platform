import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createDemoAccessAuditEntry } from "@/lib/demo-audit";

// Authorizes the caller against CRON_SECRET. Accepts two header styles:
// - `Authorization: Bearer <secret>` -> sent automatically by Vercel Cron;
// - `x-cron-secret: <secret>`        -> for manual / external triggering.
// Fails closed when CRON_SECRET is not configured.
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  if (request.headers.get("authorization") === `Bearer ${secret}`) {
    return true;
  }

  if (request.headers.get("x-cron-secret") === secret) {
    return true;
  }

  return false;
}

async function expireDueDemos(supabaseAdmin: SupabaseClient, nowIso: string) {
  // Single atomic update that flips every due demo and returns the affected
  // ids (previously a SELECT followed by one UPDATE per row).
  const { data, error } = await supabaseAdmin
    .from("dealers")
    .update({ demo_status: "expired", updated_at: nowIso })
    .eq("account_type", "demo")
    .eq("demo_status", "active")
    .lt("demo_expires_at", nowIso)
    .select("id");

  if (error) {
    return { processed: 0, error };
  }

  const expired = data ?? [];
  for (const dealer of expired) {
    await createDemoAccessAuditEntry(supabaseAdmin, {
      dealerId: dealer.id,
      action: "demo.expired",
      metadata: { triggeredAt: nowIso },
    });
  }

  return { processed: expired.length, error: null };
}

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Accesso negato." }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRole) {
    return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const nowIso = new Date().toISOString();
  const { processed, error } = await expireDueDemos(supabaseAdmin, nowIso);

  if (error) {
    const message = (error as { message?: string }).message || "Errore aggiornamento demo scadute.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ processed }, { status: 200 });
}

// Vercel Cron invokes the endpoint with a GET request.
export async function GET(request: Request) {
  return handle(request);
}

// Retained for manual / external triggering.
export async function POST(request: Request) {
  return handle(request);
}
