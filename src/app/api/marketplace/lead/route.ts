import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type LeadInsertBody = {
  vehicle_id?: string;
  first_name?: string;
  last_name?: string;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
};

type ResendResponse = {
  id?: string;
  error?: {
    message?: string;
  };
};

type LeadInsertRow = {
  id: string;
  vehicle_id: string;
  created_at: string;
};

type VehicleRow = {
  id: string;
  dealer_id: string | null;
  brand: string | null;
  model: string | null;
  version: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LeadInsertBody;

    const vehicleId = String(body.vehicle_id ?? "").trim();
    const firstName = String(body.first_name ?? "").trim();
    const lastName = String(body.last_name ?? "").trim();
    const customerEmail = normalizeEmail(body.email);
    const customerPhone = normalizeText(body.phone);
    const customerMessage = normalizeText(body.message);

    if (!vehicleId || !firstName || !lastName) {
      return NextResponse.json({ error: "Dati richiesta non validi." }, { status: 400 });
    }

    if (!customerEmail && !customerPhone) {
      return NextResponse.json({ error: "Inserisci almeno email o telefono." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase env vars for marketplace lead API.");
      return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
    }

    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    // 1) Recupero veicolo (e quindi dealer_id) prima dell'insert lead.
    const { data: vehicleData, error: vehicleError } = await supabase
      .from("vehicles")
      .select("id, dealer_id, brand, model, version")
      .eq("id", vehicleId)
      .maybeSingle<VehicleRow>();

    if (vehicleError || !vehicleData) {
      console.error("Vehicle lookup before lead insert error", vehicleError);
      return NextResponse.json({ error: "Veicolo non trovato." }, { status: 400 });
    }

    if (!vehicleData.dealer_id) {
      console.error("Vehicle has null dealer_id, cannot create marketplace lead.", { vehicleId: vehicleData.id });
      return NextResponse.json({ error: "Veicolo non associato a un concessionario." }, { status: 400 });
    }

    // 2) Salvataggio lead: include dealer_id del veicolo per garantire visibilita dealer-scoped.
    const { data: leadInsertData, error: insertError } = await supabase.from("leads").insert([
      {
        vehicle_id: vehicleId,
        dealer_id: vehicleData.dealer_id,
        first_name: firstName,
        last_name: lastName,
        email: customerEmail,
        phone: customerPhone,
        message: customerMessage,
        source: "marketplace",
      },
    ]).select("id, vehicle_id, created_at").maybeSingle<LeadInsertRow>();

    if (insertError) {
      console.error("Marketplace lead insert error", insertError);
      return NextResponse.json({ error: insertError.message || "Errore durante il salvataggio della richiesta." }, { status: 400 });
    }

    if (!leadInsertData) {
      return NextResponse.json({ error: "Lead salvata ma risposta incompleta dal database." }, { status: 500 });
    }

    const vehicleLabel = [vehicleData.brand, vehicleData.model, vehicleData.version].filter(Boolean).join(" ") || vehicleData.id;

    // 3) Recupero email concessionario da profiles.email via dealer_id.
    let dealerEmail: string | null = null;
    if (vehicleData.dealer_id && supabaseServiceRoleKey) {
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      const { data: profileRows, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("dealer_id", vehicleData.dealer_id)
        .not("email", "is", null)
        .limit(1);

      if (profileError) {
        console.error("Dealer profile email lookup error", profileError);
      } else {
        dealerEmail = normalizeEmail(profileRows?.[0]?.email ?? null);
      }
    } else if (!vehicleData.dealer_id) {
      console.error("Dealer id missing on vehicle, dealer email cannot be resolved.");
    } else {
      console.error("SUPABASE_SERVICE_ROLE_KEY missing: cannot resolve dealer email from profiles.");
    }

    // Best effort email delivery: lead is already saved and must not fail due to email provider errors.
    await sendEmailsBestEffort({
      dealerEmail,
      vehicleLabel,
      vehicleBrand: normalizeText(vehicleData.brand) || "-",
      vehicleModel: normalizeText(vehicleData.model) || "-",
      vehicleVersion: normalizeText(vehicleData.version) || "-",
      firstName,
      lastName,
      customerEmail,
      customerPhone,
      customerMessage,
      requestDateIso: leadInsertData.created_at,
    });

    return NextResponse.json({ message: "Richiesta inviata correttamente." }, { status: 200 });
  } catch (error) {
    console.error("Marketplace lead API unexpected error", error);
    return NextResponse.json({ error: "Errore interno durante l'invio della richiesta." }, { status: 500 });
  }
}

async function sendEmailsBestEffort({
  dealerEmail,
  vehicleLabel,
  vehicleBrand,
  vehicleModel,
  vehicleVersion,
  firstName,
  lastName,
  customerEmail,
  customerPhone,
  customerMessage,
  requestDateIso,
}: {
  dealerEmail: string | null;
  vehicleLabel: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleVersion: string;
  firstName: string;
  lastName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerMessage: string | null;
  requestDateIso: string;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!resendApiKey || !fromEmail) {
    console.error("Email provider env vars missing: set RESEND_API_KEY and RESEND_FROM_EMAIL.");
    return;
  }

  const appBaseUrl = process.env.APP_BASE_URL || "";
  const leadDashboardUrl = appBaseUrl ? `${appBaseUrl.replace(/\/$/, "")}/lead` : "/lead";
  const requestDate = formatDateTime(requestDateIso);
  const customerEmailLabel = customerEmail ?? "-";
  const customerPhoneLabel = customerPhone ?? "-";
  const customerMessageLabel = customerMessage ?? "-";

  if (dealerEmail) {
    const dealerHtml = `
      <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
          <h2 style="margin:0 0 16px 0;color:#0f172a;">Nuova richiesta informazioni</h2>
          <p style="margin:0 0 16px 0;color:#334155;">E stata registrata una nuova richiesta dal marketplace pubblico.</p>
          <table style="width:100%;border-collapse:collapse;color:#0f172a;font-size:14px;">
            <tr><td style="padding:8px 0;font-weight:bold;">Marca</td><td style="padding:8px 0;">${escapeHtml(vehicleBrand)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:bold;">Modello</td><td style="padding:8px 0;">${escapeHtml(vehicleModel)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:bold;">Versione</td><td style="padding:8px 0;">${escapeHtml(vehicleVersion)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:bold;">Nome cliente</td><td style="padding:8px 0;">${escapeHtml(firstName)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:bold;">Cognome cliente</td><td style="padding:8px 0;">${escapeHtml(lastName)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:bold;">Email</td><td style="padding:8px 0;">${escapeHtml(customerEmailLabel)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:bold;">Telefono</td><td style="padding:8px 0;">${escapeHtml(customerPhoneLabel)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:bold;">Messaggio</td><td style="padding:8px 0;">${escapeHtml(customerMessageLabel)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:bold;">Data richiesta</td><td style="padding:8px 0;">${escapeHtml(requestDate)}</td></tr>
          </table>
          <div style="margin-top:24px;">
            <a href="${escapeHtml(leadDashboardUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:8px;font-weight:600;">Apri Dashboard Lead</a>
          </div>
        </div>
      </div>
    `;

    try {
      await sendResendEmail({
        apiKey: resendApiKey,
        fromEmail,
        to: dealerEmail,
        subject: "🚗 Nuova richiesta informazioni",
        html: dealerHtml,
      });
    } catch (error) {
      console.error("Dealer email send error", error);
    }
  } else {
    console.error("Dealer email missing: cannot send dealer notification email.");
  }

  if (customerEmail) {
    const customerHtml = `
      <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
          <h2 style="margin:0 0 16px 0;color:#0f172a;">Abbiamo ricevuto la tua richiesta</h2>
          <p style="margin:0 0 12px 0;color:#334155;">Grazie per averci contattato.</p>
          <p style="margin:0 0 12px 0;color:#334155;">Veicolo richiesto: <strong>${escapeHtml(vehicleLabel)}</strong></p>
          <p style="margin:0 0 12px 0;color:#334155;">La concessionaria prendera in carico la tua richiesta nel piu breve tempo possibile.</p>
          <p style="margin:0 0 12px 0;color:#334155;">Riceverai un contatto direttamente dal venditore.</p>
          <p style="margin:24px 0 0 0;color:#334155;">Cordiali saluti.<br />Dealer Platform</p>
        </div>
      </div>
    `;

    try {
      await sendResendEmail({
        apiKey: resendApiKey,
        fromEmail,
        to: customerEmail,
        subject: "Abbiamo ricevuto la tua richiesta",
        html: customerHtml,
      });
    } catch (error) {
      console.error("Customer confirmation email send error", error);
    }
  } else {
    console.error("Customer email missing: confirmation email skipped.");
  }
}

async function sendResendEmail({
  apiKey,
  fromEmail,
  to,
  subject,
  html,
}: {
  apiKey: string;
  fromEmail: string;
  to: string;
  subject: string;
  html: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ResendResponse | null;
    throw new Error(payload?.error?.message || `Resend request failed with status ${response.status}`);
  }
}

function normalizeEmail(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
