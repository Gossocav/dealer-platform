import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";
import { contestoAmministratore } from "@/lib/admin-api-context";

// Elenco operativo di account: una risposta riusata dalla cache mostrerebbe
// utenti gia' cancellati come ancora presenti.
export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  role: string | null;
  dealer_id: string | null;
};

type DealerRow = {
  id: string;
  name: string | null;
  legal_name: string | null;
};

export type AdminUserRow = {
  id: string;
  email: string;
  role: string;
  dealerName: string | null;
  createdAt: string;
  emailConfirmed: boolean;
  isAdmin: boolean;
  /** L'account con cui si sta guardando la pagina: non puo' cancellarsi. */
  isSelf: boolean;
};

const PER_PAGE = 1000;

// Chi sta chiamando e' un amministratore? La risposta si decide in un posto
// solo: src/lib/admin-api-context.ts. Fino al 06/09/2026 questa verifica era
// ricopiata a mano qui dentro, e in altri cinque endpoint, ~70 righe l'una:
// finche' restavano uguali non faceva danni, ma il giorno che una copia si
// scostava dalle altre, la schermata che se ne dimenticava era quella che
// lasciava entrare qualcuno.
//
// Resta solo l'adattamento dei nomi, perche' i punti di chiamata di questo
// endpoint leggono `error` e `callerId`.
async function resolveAdminContext(request: Request) {
  const contesto = await contestoAmministratore(request);

  if (contesto.errore) {
    return { error: contesto.errore, supabaseAdmin: null, callerId: null } as const;
  }

  return { error: null, supabaseAdmin: contesto.supabaseAdmin, callerId: contesto.chiamanteId } as const;
}

async function listAccounts(supabaseAdmin: SupabaseClient, callerId: string): Promise<AdminUserRow[]> {
  const accounts: Array<{
    id: string;
    email?: string;
    created_at?: string;
    email_confirmed_at?: string | null;
    app_metadata?: Record<string, unknown>;
  }> = [];

  let page = 1;
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) {
      throw new Error(error.message || "Errore lettura account.");
    }

    const users = data?.users ?? [];
    accounts.push(...users);

    if (users.length < PER_PAGE) break;
    page += 1;
  }

  if (accounts.length === 0) {
    return [];
  }

  const ids = accounts.map((account) => account.id);

  const profiles = await supabaseAdmin
    .from("profiles")
    .select("id, role, dealer_id")
    .in("id", ids);

  if (profiles.error) {
    throw new Error(profiles.error.message || "Errore lettura profili.");
  }

  const profileById = new Map<string, ProfileRow>(
    ((profiles.data ?? []) as ProfileRow[]).map((row) => [row.id, row]),
  );

  const dealerIds = [...new Set(
    (profiles.data ?? [])
      .map((row) => (row as ProfileRow).dealer_id)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  )];

  const dealerById = new Map<string, DealerRow>();
  if (dealerIds.length > 0) {
    const dealers = await supabaseAdmin.from("dealers").select("id, name, legal_name").in("id", dealerIds);

    if (dealers.error) {
      throw new Error(dealers.error.message || "Errore lettura concessionarie.");
    }

    for (const dealer of (dealers.data ?? []) as DealerRow[]) {
      dealerById.set(dealer.id, dealer);
    }
  }

  return accounts
    .map((account) => {
      const profile = profileById.get(account.id);
      const dealer = profile?.dealer_id ? dealerById.get(profile.dealer_id) : undefined;
      const metadataRole = resolveUserRoleFromMetadata(account);
      const role = String(profile?.role ?? metadataRole ?? "").trim() || "senza ruolo";

      return {
        id: account.id,
        email: String(account.email ?? "").trim() || "(senza email)",
        role,
        dealerName: dealer ? (dealer.legal_name?.trim() || dealer.name?.trim() || null) : null,
        createdAt: String(account.created_at ?? ""),
        emailConfirmed: Boolean(account.email_confirmed_at),
        isAdmin: isPlatformAdminRole(role) || isPlatformAdminRole(metadataRole),
        isSelf: account.id === callerId,
      } satisfies AdminUserRow;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function GET(request: Request) {
  const context = await resolveAdminContext(request);
  if (context.error) return context.error;

  try {
    const users = await listAccounts(context.supabaseAdmin, context.callerId);
    return NextResponse.json({ users }, { status: 200 });
  } catch (error) {
    console.error("Admin users API error", error);
    return NextResponse.json({ error: "Impossibile caricare gli account." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const context = await resolveAdminContext(request);
  if (context.error) return context.error;

  let userId = "";
  try {
    const body = (await request.json()) as { userId?: unknown };
    userId = String(body?.userId ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }

  if (!userId) {
    return NextResponse.json({ error: "Account da cancellare non indicato." }, { status: 400 });
  }

  // Cancellarsi da soli significa restare chiusi fuori dal pannello, e per
  // rientrare servirebbe passare dal database.
  if (userId === context.callerId) {
    return NextResponse.json(
      { error: "Non puoi cancellare l'account con cui sei entrato." },
      { status: 400 },
    );
  }

  try {
    const accounts = await listAccounts(context.supabaseAdmin, context.callerId);
    const target = accounts.find((account) => account.id === userId);

    if (!target) {
      return NextResponse.json({ error: "Account non trovato." }, { status: 404 });
    }

    // Senza amministratori nessuno puo' piu' approvare una concessionaria ne'
    // attivare una demo: la piattaforma si blocca a vicenda.
    if (target.isAdmin && accounts.filter((account) => account.isAdmin).length <= 1) {
      return NextResponse.json(
        { error: "È l'ultimo amministratore: creane un altro prima di cancellarlo." },
        { status: 400 },
      );
    }

    const { error } = await context.supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
      return NextResponse.json({ error: error.message || "Errore cancellazione account." }, { status: 500 });
    }

    return NextResponse.json({ deleted: userId, email: target.email }, { status: 200 });
  } catch (error) {
    console.error("Admin users delete error", error);
    return NextResponse.json({ error: "Impossibile cancellare l'account." }, { status: 500 });
  }
}
