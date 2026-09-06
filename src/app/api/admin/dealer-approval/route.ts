import { NextResponse } from "next/server";
import { consumaFreno } from "@/lib/api-rate-limit";
import { sendDealerLifecycleEmail } from "@/lib/dealer-account-emails";
import { contestoAmministratore } from "@/lib/admin-api-context";

// Il pannello admin mostra conteggi ed elenchi operativi: una risposta
// riusata dalla cache farebbe vedere dati vecchi (concessionarie gia'
// approvate, richieste demo non ancora comparse) senza alcun segnale.
export const dynamic = "force-dynamic";

type DealerApprovalAction = "approve" | "reject";

type DealerApprovalRequestBody = {
  dealerId?: string;
  action?: DealerApprovalAction;
};

type DealerListRow = {
  id: string;
  legal_name: string | null;
  name: string | null;
  vat_number: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  created_at: string | null;
};

type DealerEmailTargetRow = {
  legal_name: string | null;
  name: string | null;
  email: string | null;
};

const ADMIN_DEALER_APPROVAL_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 10,
} as const;

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
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
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}

// Chi sta chiamando e' un amministratore? La risposta si decide in un posto
// solo: src/lib/admin-api-context.ts. Fino al 06/09/2026 questa verifica era
// ricopiata a mano qui dentro, e in altri cinque endpoint, ~70 righe l'una:
// finche' restavano uguali non faceva danni, ma il giorno che una copia si
// scostava dalle altre, la schermata che se ne dimenticava era quella che
// lasciava entrare qualcuno.
//
// Resta solo l'adattamento dei nomi, perche' i punti di chiamata di questo
// endpoint leggono `error` e `userId`.
async function resolveAdminContext(request: Request) {
  const contesto = await contestoAmministratore(request);

  if (contesto.errore) {
    return { error: contesto.errore, supabaseAdmin: null, userId: null } as const;
  }

  return { error: null, supabaseAdmin: contesto.supabaseAdmin, userId: contesto.chiamanteId } as const;
}

export async function GET(request: Request) {
  const context = await resolveAdminContext(request);

  if (context.error) {
    return context.error;
  }

  if (!context.supabaseAdmin) {
    return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
  }

  const dealers = await context.supabaseAdmin
    .from("dealers")
    .select("id, legal_name, name, vat_number, contact_person, email, phone, status, created_at")
    .eq("status", "pending_review")
    .order("created_at", { ascending: true })
    .returns<DealerListRow[]>();

  if (dealers.error) {
    return NextResponse.json({ error: dealers.error.message || "Errore caricamento dealer in verifica." }, { status: 500 });
  }

  return NextResponse.json({ dealers: dealers.data ?? [] }, { status: 200 });
}

export async function POST(request: Request) {
  const context = await resolveAdminContext(request);

  if (context.error) {
    return context.error;
  }

  if (!context.supabaseAdmin) {
    return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
  }

  let body: DealerApprovalRequestBody;
  try {
    body = (await request.json()) as DealerApprovalRequestBody;
  } catch {
    return NextResponse.json({ error: "Payload non valido." }, { status: 400 });
  }

  const dealerId = normalizeText(body.dealerId);
  const action = body.action;

  if (!dealerId || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Dati richiesta non validi." }, { status: 400 });
  }

  const clientIp = resolveClientIp(request);
  const rateLimitKey = `admin-mutate:dealer-approval:${action}:${context.userId}:${clientIp}`;
  const rateLimit = await consumaFreno(rateLimitKey, ADMIN_DEALER_APPROVAL_RATE_LIMIT);
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

  const dealerStatus = action === "approve" ? "approved" : "rejected";
  const membershipStatus = action === "approve" ? "active" : "disabled";

  const dealerTarget = await context.supabaseAdmin
    .from("dealers")
    .select("legal_name, name, email")
    .eq("id", dealerId)
    .maybeSingle<DealerEmailTargetRow>();

  if (dealerTarget.error) {
    return NextResponse.json({ error: dealerTarget.error.message || "Errore caricamento dati dealer." }, { status: 500 });
  }

  const dealerUpdate = await context.supabaseAdmin
    .from("dealers")
    .update({
      status: dealerStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dealerId);

  if (dealerUpdate.error) {
    return NextResponse.json({ error: dealerUpdate.error.message || "Errore aggiornamento stato dealer." }, { status: 500 });
  }

  const membershipUpdate = await context.supabaseAdmin
    .from("dealer_users")
    .update({
      status: membershipStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("dealer_id", dealerId);

  if (membershipUpdate.error) {
    return NextResponse.json({ error: membershipUpdate.error.message || "Errore aggiornamento membership dealer." }, { status: 500 });
  }

  const targetEmail = normalizeText(dealerTarget.data?.email);
  const dealerName = normalizeText(dealerTarget.data?.legal_name) || normalizeText(dealerTarget.data?.name) || "Concessionaria";

  if (targetEmail) {
    try {
      await sendDealerLifecycleEmail({
        toEmail: targetEmail,
        dealerName,
        kind: action === "approve" ? "approved" : "rejected",
      });
    } catch (emailError) {
      console.error("Dealer approval lifecycle email failed", emailError);
    }
  }

  return NextResponse.json(
    {
      dealerId,
      dealerStatus,
      membershipStatus,
    },
    { status: 200 }
  );
}
