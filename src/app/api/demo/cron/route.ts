import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createDemoAccessAuditEntry } from "@/lib/demo-audit";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");

  if (!secret || provided !== secret) {
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

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("dealers")
    .select("id")
    .eq("account_type", "demo")
    .eq("demo_status", "active")
    .lt("demo_expires_at", now);

  if (error) {
    return NextResponse.json({ error: error.message || "Errore aggiornamento demo scadute." }, { status: 500 });
  }

  for (const dealer of data ?? []) {
    await supabaseAdmin.from("dealers").update({
      demo_status: "expired",
      updated_at: now,
    }).eq("id", dealer.id);

    await createDemoAccessAuditEntry(supabaseAdmin, {
      dealerId: dealer.id,
      action: "demo.expired",
      metadata: { triggeredAt: now },
    });
  }

  return NextResponse.json({ processed: (data ?? []).length }, { status: 200 });
}
