import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";

type ProfileRoleRow = {
  role: string | null;
};

type OverviewStats = {
  dealersRegistered: number;
  dealersPendingApproval: number;
  dealersApproved: number;
  vehiclesPublished: number;
  leadsReceived: number;
  usersRegistered: number;
};

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

async function countAuthUsers(supabaseAdmin: SupabaseClient) {
  const perPage = 1000;
  let page = 1;
  let total = 0;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message || "Errore conteggio utenti auth.");
    }

    const users = data?.users ?? [];
    total += users.length;

    if (users.length < perPage) {
      break;
    }

    page += 1;
  }

  return total;
}

function extractCount(value: number | null) {
  return Number.isFinite(value) && typeof value === "number" ? value : 0;
}

export async function GET(request: Request) {
  const context = await resolveAdminContext(request);

  if (context.error) {
    return context.error;
  }

  if (!context.supabaseAdmin) {
    return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
  }

  try {
    const [
      dealersRegistered,
      dealersPendingApproval,
      dealersApproved,
      vehiclesPublished,
      leadsReceived,
      profilesCount,
      authUsersCount,
    ] = await Promise.all([
      context.supabaseAdmin.from("dealers").select("id", { count: "exact", head: true }),
      context.supabaseAdmin.from("dealers").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
      context.supabaseAdmin.from("dealers").select("id", { count: "exact", head: true }).eq("status", "approved"),
      context.supabaseAdmin.from("vehicles").select("id", { count: "exact", head: true }).eq("published", true),
      context.supabaseAdmin.from("leads").select("id", { count: "exact", head: true }),
      context.supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      countAuthUsers(context.supabaseAdmin),
    ]);

    if (dealersRegistered.error) throw new Error(dealersRegistered.error.message || "Errore conteggio dealer registrati.");
    if (dealersPendingApproval.error) throw new Error(dealersPendingApproval.error.message || "Errore conteggio dealer in verifica.");
    if (dealersApproved.error) throw new Error(dealersApproved.error.message || "Errore conteggio dealer approvati.");
    if (vehiclesPublished.error) throw new Error(vehiclesPublished.error.message || "Errore conteggio veicoli pubblicati.");
    if (leadsReceived.error) throw new Error(leadsReceived.error.message || "Errore conteggio lead ricevuti.");
    if (profilesCount.error) throw new Error(profilesCount.error.message || "Errore conteggio profili registrati.");

    const stats: OverviewStats = {
      dealersRegistered: extractCount(dealersRegistered.count),
      dealersPendingApproval: extractCount(dealersPendingApproval.count),
      dealersApproved: extractCount(dealersApproved.count),
      vehiclesPublished: extractCount(vehiclesPublished.count),
      leadsReceived: extractCount(leadsReceived.count),
      usersRegistered: Math.max(extractCount(profilesCount.count), authUsersCount),
    };

    return NextResponse.json({ stats }, { status: 200 });
  } catch (error) {
    console.error("Admin overview API error", error);
    return NextResponse.json({ error: "Impossibile caricare le metriche admin.", stats: {
      dealersRegistered: 0,
      dealersPendingApproval: 0,
      dealersApproved: 0,
      vehiclesPublished: 0,
      leadsReceived: 0,
      usersRegistered: 0,
    } }, { status: 500 });
  }
}
