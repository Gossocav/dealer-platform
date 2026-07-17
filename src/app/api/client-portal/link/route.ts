import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { createClientPortalToken, normalizePortalEmail } from "@/lib/client-portal";

type LinkBody = {
  leadId?: string;
};

type LeadEmailRow = {
  id: string;
  email: string | null;
};

function normalizeText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeActiveDealerId(value: string | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return normalized;
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      return NextResponse.json({ error: "Utente non autenticato." }, { status: 401 });
    }

    const dealerId = await resolveDealerIdFromTenantSources(supabase, user.id, {
      activeDealerId: normalizeActiveDealerId(request.headers.get("x-active-dealer-id")),
    });

    if (!dealerId) {
      return NextResponse.json({ error: "Concessionaria non associata all'utente." }, { status: 403 });
    }

    const body = (await request.json()) as LinkBody;
    const leadId = normalizeText(body.leadId);

    if (!leadId) {
      return NextResponse.json({ error: "leadId obbligatorio." }, { status: 400 });
    }

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, email")
      .eq("id", leadId)
      .eq("dealer_id", dealerId)
      .maybeSingle<LeadEmailRow>();

    if (leadError) {
      return NextResponse.json({ error: leadError.message || "Errore recupero lead." }, { status: 500 });
    }

    if (!lead?.id) {
      return NextResponse.json({ error: "Lead non trovato o non autorizzato." }, { status: 404 });
    }

    const email = normalizePortalEmail(lead.email);
    if (!email) {
      return NextResponse.json({ error: "Lead senza email: impossibile creare link portale cliente." }, { status: 400 });
    }

    const secret = normalizeText(process.env.CLIENT_PORTAL_SIGNING_SECRET)
      ?? normalizeText(process.env.SUPABASE_SERVICE_ROLE_KEY)
      ?? normalizeText(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

    if (!secret) {
      return NextResponse.json({ error: "Configurazione firma portale mancante." }, { status: 500 });
    }

    const token = createClientPortalToken({ leadId: lead.id, email, secret });
    const appBaseUrl = normalizeText(process.env.APP_BASE_URL) ?? new URL(request.url).origin;
    const url = `${appBaseUrl.replace(/\/$/, "")}/portale/lead/${encodeURIComponent(lead.id)}?email=${encodeURIComponent(email)}&t=${encodeURIComponent(token)}`;

    return NextResponse.json({ url }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Errore creazione link portale cliente." }, { status: 500 });
  }
}
