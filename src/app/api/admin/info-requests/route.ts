import { NextResponse } from "next/server";
import { contestoAmministratore } from "@/lib/admin-api-context";

// Il pannello admin mostra conteggi ed elenchi operativi: una risposta
// riusata dalla cache farebbe vedere dati vecchi (concessionarie gia'
// approvate, richieste demo non ancora comparse) senza alcun segnale.
export const dynamic = "force-dynamic";

type DealerInfoRequestRow = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  message: string;
  created_at: string;
};

const MAX_ROWS = 200;

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

export async function GET(request: Request) {
  const context = await resolveAdminContext(request);

  if (context.error) {
    return context.error;
  }

  const result = await context.supabaseAdmin
    .from("dealer_info_requests")
    .select("id, company_name, contact_name, email, phone, message, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS)
    .returns<DealerInfoRequestRow[]>();

  if (result.error) {
    console.error("admin-info-requests:select-failed", {
      code: result.error.code ?? null,
      message: result.error.message ?? null,
    });

    return NextResponse.json({ error: "Errore lettura richieste informazioni." }, { status: 500 });
  }

  return NextResponse.json({ requests: result.data ?? [] }, { status: 200 });
}
