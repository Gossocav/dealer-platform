import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { contestoAmministratore } from "@/lib/admin-api-context";

// Il pannello admin mostra conteggi ed elenchi operativi: una risposta
// riusata dalla cache farebbe vedere dati vecchi (concessionarie gia'
// approvate, richieste demo non ancora comparse) senza alcun segnale.
export const dynamic = "force-dynamic";

type OverviewStats = {
  dealersRegistered: number;
  dealersPendingApproval: number;
  dealersApproved: number;
  vehiclesPublished: number;
  leadsReceived: number;
  usersRegistered: number;
  demoRequestsToHandle: number;
  infoRequestsReceived: number;
};

// Una richiesta demo resta lavoro aperto finche' non viene attivata o
// rifiutata: "contacted" significa che l'admin ha scritto, non che ha chiuso.
const DEMO_REQUEST_OPEN_STATUSES = ["pending", "contacted"] as const;

// Chi sta chiamando e' un amministratore? La risposta si decide in un posto
// solo: src/lib/admin-api-context.ts. Fino al 06/09/2026 questa verifica era
// ricopiata a mano qui dentro, e in altri cinque endpoint, ~70 righe l'una:
// finche' restavano uguali non faceva danni, ma il giorno che una copia si
// scostava dalle altre, la schermata che se ne dimenticava era quella che
// lasciava entrare qualcuno.
//
// Resta solo l'adattamento dei nomi, perche' i punti di chiamata di questo
// endpoint leggono `error`.
async function resolveAdminContext(request: Request) {
  const contesto = await contestoAmministratore(request);

  if (contesto.errore) {
    return { error: contesto.errore, supabaseAdmin: null } as const;
  }

  return { error: null, supabaseAdmin: contesto.supabaseAdmin } as const;
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
      demoRequestsToHandle,
      infoRequestsReceived,
      authUsersCount,
    ] = await Promise.all([
      context.supabaseAdmin.from("dealers").select("id", { count: "exact", head: true }),
      context.supabaseAdmin.from("dealers").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
      context.supabaseAdmin.from("dealers").select("id", { count: "exact", head: true }).eq("status", "approved"),
      context.supabaseAdmin.from("vehicles").select("id", { count: "exact", head: true }).eq("published", true),
      context.supabaseAdmin.from("leads").select("id", { count: "exact", head: true }),
      context.supabaseAdmin
        .from("demo_requests")
        .select("id", { count: "exact", head: true })
        .in("status", DEMO_REQUEST_OPEN_STATUSES),
      context.supabaseAdmin.from("dealer_info_requests").select("id", { count: "exact", head: true }),
      countAuthUsers(context.supabaseAdmin),
    ]);

    if (dealersRegistered.error) throw new Error(dealersRegistered.error.message || "Errore conteggio dealer registrati.");
    if (dealersPendingApproval.error) throw new Error(dealersPendingApproval.error.message || "Errore conteggio dealer in verifica.");
    if (dealersApproved.error) throw new Error(dealersApproved.error.message || "Errore conteggio dealer approvati.");
    if (vehiclesPublished.error) throw new Error(vehiclesPublished.error.message || "Errore conteggio veicoli pubblicati.");
    if (leadsReceived.error) throw new Error(leadsReceived.error.message || "Errore conteggio lead ricevuti.");
    if (demoRequestsToHandle.error) throw new Error(demoRequestsToHandle.error.message || "Errore conteggio richieste demo.");
    if (infoRequestsReceived.error) throw new Error(infoRequestsReceived.error.message || "Errore conteggio richieste informazioni.");

    const stats: OverviewStats = {
      dealersRegistered: extractCount(dealersRegistered.count),
      dealersPendingApproval: extractCount(dealersPendingApproval.count),
      dealersApproved: extractCount(dealersApproved.count),
      vehiclesPublished: extractCount(vehiclesPublished.count),
      leadsReceived: extractCount(leadsReceived.count),
      // Gli account di accesso, non i profili. Prima qui c'era il maggiore
      // fra i due: con un profilo rimasto senza account il riquadro mostrava
      // 3 utenti a fronte di 1 solo accesso esistente, e il numero non
      // scendeva mai cancellando qualcuno.
      usersRegistered: authUsersCount,
      demoRequestsToHandle: extractCount(demoRequestsToHandle.count),
      infoRequestsReceived: extractCount(infoRequestsReceived.count),
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
      demoRequestsToHandle: 0,
      infoRequestsReceived: 0,
    } }, { status: 500 });
  }
}
