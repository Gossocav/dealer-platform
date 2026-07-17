import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { safeEqualSecret } from "@/lib/demo-lifecycle";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");

  if (!safeEqualSecret(provided, secret)) {
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

  const { data, error } = await supabaseAdmin.rpc("expire_due_demos");

  if (error) {
    console.error("[demo-cron]", { action: "expire_due_demos", message: error.message, details: error.details, hint: error.hint });
    return NextResponse.json({ error: "Scadenza Demo temporaneamente non disponibile." }, { status: 500 });
  }
  const processed = typeof data === "object" && data && "processed" in data ? Number(data.processed) || 0 : 0;
  return NextResponse.json({ processed }, { status: 200 });
}
