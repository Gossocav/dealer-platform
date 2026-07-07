import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { hitRateLimit } from "@/lib/api-rate-limit";
import { writeVehicleTimelineEvent } from "@/lib/vehicle-timeline";

type LeadInsertBody = {
  vehicleId?: string;
  vehicle_id?: string;
  first_name?: string;
  last_name?: string;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
};

type ResendResponse = {
  id?: string;
  message?: string;
  name?: string;
  statusCode?: number;
  error?: {
    message?: string;
  };
};

type ResendSuccessResponse = {
  id?: string;
};

class ResendApiError extends Error {
  status: number;
  responseBody: string;

  constructor(message: string, status: number, responseBody: string) {
    super(message);
    this.name = "ResendApiError";
    this.status = status;
    this.responseBody = responseBody;
  }
}

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

const MARKETPLACE_LEAD_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 20,
};

const EMAIL_FROM_ADDRESS = "no-reply@dealerplatform.it";
const EMAIL_FROM_NAME = "Dealer Platform";
const EMAIL_FROM_HEADER = `${EMAIL_FROM_NAME} <${EMAIL_FROM_ADDRESS}>`;
const REQUIRED_FROM_DOMAIN = "dealerplatform.it";

function buildStandardEmailFooterHtml() {
  return `
    <p style="margin:24px 0 12px 0;color:#334155;">--------------------------------</p>
    <p style="margin:0 0 12px 0;color:#334155;">Cordiali saluti,</p>
    <p style="margin:0 0 12px 0;color:#334155;">Supporto Dealer Platform</p>
    <p style="margin:0 0 12px 0;color:#334155;">Questa e un'email automatica.<br />Ti chiediamo di non rispondere a questo messaggio.</p>
    <p style="margin:0 0 12px 0;color:#334155;">Per assistenza:<br /><a href="mailto:support@dealerplatform.it">support@dealerplatform.it</a></p>
    <p style="margin:0;color:#334155;">--------------------------------</p>
  `.trim();
}

export async function POST(request: Request) {
  try {
    let body: LeadInsertBody;
    try {
      body = (await request.json()) as LeadInsertBody;
    } catch {
      return NextResponse.json({ error: "Payload non valido." }, { status: 400 });
    }

    const vehicleId = String(body.vehicleId ?? body.vehicle_id ?? "").trim();
    const firstName = String(body.first_name ?? "").trim();
    const lastName = String(body.last_name ?? "").trim();
    const customerEmail = normalizeEmail(body.email);
    const customerPhone = normalizeText(body.phone);
    const customerMessage = normalizeText(body.message);

    const clientIp = getClientIp(request);
    const rateLimitKey = `marketplace-lead:${clientIp || "unknown"}:${vehicleId || "unknown"}`;
    const rateLimit = hitRateLimit(rateLimitKey, MARKETPLACE_LEAD_RATE_LIMIT);

    if (rateLimit.limited) {
      return NextResponse.json({ error: "Troppi tentativi. Riprova tra poco." }, { status: 429 });
    }

    if (!vehicleId || !firstName || !lastName) {
      return NextResponse.json({ error: "Dati richiesta non validi." }, { status: 400 });
    }

    if (!customerEmail && !customerPhone) {
      return NextResponse.json({ error: "Inserisci almeno email o telefono." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase env vars for marketplace lead API.", { errorType: "missing_env" });
      return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
    }

    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseServiceRoleKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY missing: cannot resolve dealer from dealers table.", { errorType: "missing_env" });
      return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
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
      console.error("Vehicle lookup before lead insert error", {
        errorType: vehicleError?.name ?? "db_error",
        vehicleId,
      });
      return NextResponse.json({ error: "Veicolo non trovato." }, { status: 400 });
    }

    if (!vehicleData.dealer_id) {
      console.error("Vehicle has null dealer_id, cannot create marketplace lead.", { vehicleId: vehicleData.id });
      return NextResponse.json({ error: "Richiesta non inviata. Contatta il supporto." }, { status: 400 });
    }

    const { data: dealerData, error: dealerError } = await supabaseAdmin
      .from("dealers")
      .select("id, email")
      .eq("id", vehicleData.dealer_id)
      .maybeSingle<{ id: string; email: string | null }>();

    if (dealerError || !dealerData?.id) {
      console.error("Dealer lookup failed for marketplace lead.", {
        errorType: dealerError?.name ?? "db_error",
        dealerId: vehicleData.dealer_id,
        vehicleId: vehicleData.id,
      });
      return NextResponse.json({ error: "Richiesta non inviata. Contatta il supporto." }, { status: 400 });
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
      console.error("Marketplace lead insert error", {
        errorType: insertError.name ?? "db_error",
        vehicleId,
      });
      return NextResponse.json({ error: "Si è verificato un errore." }, { status: 400 });
    }

    if (!leadInsertData) {
      return NextResponse.json({ error: "Si è verificato un errore." }, { status: 500 });
    }

    await writeVehicleTimelineEvent(supabaseAdmin, {
      dealerId: vehicleData.dealer_id,
      vehicleId: vehicleData.id,
      action: "vehicle.lead_received",
      actorType: "api",
      actorProfileId: null,
      metadata: {
        source: "marketplace",
        leadId: leadInsertData.id,
      },
      after: {
        leadId: leadInsertData.id,
      },
    });

    const vehicleLabel = [vehicleData.brand, vehicleData.model, vehicleData.version].filter(Boolean).join(" ") || vehicleData.id;

    // 3) Recupero email concessionario dai dati pubblici del dealer.
    const dealerEmail = normalizeEmail(dealerData.email ?? null);

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
    console.error("Marketplace lead API unexpected error", {
      errorType: error instanceof Error ? error.name : "unknown_error",
    });
    if (error instanceof Error) {
      console.error("Marketplace lead API unexpected error details", {
        errorType: error.name,
      });
    }
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
  const normalizedFromEmail = normalizeEmail(EMAIL_FROM_ADDRESS);
  const fromEmailLocalPart = normalizedFromEmail?.split("@")[0] ?? null;
  const fromEmailDomain = normalizedFromEmail?.split("@")[1] ?? null;

  if (!resendApiKey) {
    console.error("Email provider env vars missing: set RESEND_API_KEY.", { errorType: "missing_env" });
    return;
  }

  if (!normalizedFromEmail || !fromEmailLocalPart || !fromEmailDomain) {
    console.error("Invalid sender email format for marketplace lead emails.", { errorType: "invalid_config" });
    return;
  }

  if (normalizedFromEmail.startsWith("re_")) {
    console.error("Invalid sender email: looks like an API key, not an email address.", { errorType: "invalid_config" });
    return;
  }

  if (fromEmailDomain !== REQUIRED_FROM_DOMAIN || fromEmailLocalPart !== "no-reply") {
    console.error("Invalid sender email for marketplace lead emails.", { errorType: "invalid_config" });
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
          ${buildStandardEmailFooterHtml()}
        </div>
      </div>
    `;

    try {
      const dealerSend = await sendResendEmail({
        apiKey: resendApiKey,
        fromEmail: EMAIL_FROM_HEADER,
        to: dealerEmail,
        subject: "🚗 Nuova richiesta informazioni",
        html: dealerHtml,
      });
      console.info("Marketplace dealer email sent", { provider: "resend", resendEmailId: dealerSend.id ?? null });
    } catch (error) {
      logEmailSendError("Dealer email send error", error);
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
          <p style="margin:24px 0 12px 0;color:#334155;">Cordiali saluti.<br />Dealer Platform</p>
          ${buildStandardEmailFooterHtml()}
        </div>
      </div>
    `;

    try {
      const customerSend = await sendResendEmail({
        apiKey: resendApiKey,
        fromEmail: EMAIL_FROM_HEADER,
        to: customerEmail,
        subject: "Abbiamo ricevuto la tua richiesta",
        html: customerHtml,
      });
      console.info("Marketplace customer confirmation email sent", { provider: "resend", resendEmailId: customerSend.id ?? null });
    } catch (error) {
      logEmailSendError("Customer confirmation email send error", error);
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

  const responseText = await response.text();

  if (!response.ok) {
    let payload: ResendResponse | null = null;

    try {
      payload = responseText ? (JSON.parse(responseText) as ResendResponse) : null;
    } catch (parseError) {
      console.error("Resend marketplace email error response is not valid JSON", {
        errorType: parseError instanceof Error ? parseError.name : "parse_error",
      });
    }

    const resendMessage = payload?.error?.message || payload?.message || `Resend request failed with status ${response.status}`;
    throw new ResendApiError(resendMessage, response.status, responseText);
  }

  try {
    return (responseText ? (JSON.parse(responseText) as ResendSuccessResponse) : { id: undefined }) as ResendSuccessResponse;
  } catch (parseError) {
    console.error("Resend marketplace success response is not valid JSON", {
      errorType: parseError instanceof Error ? parseError.name : "parse_error",
    });
    return { id: undefined };
  }
}

function logEmailSendError(prefix: string, error: unknown) {
  console.error(prefix, {
    errorType: error instanceof Error ? error.name : "unknown_error",
  });

  if (error instanceof ResendApiError) {
    console.error(`${prefix} status`, error.status);
    console.error(`${prefix} provider`, "resend");
    return;
  }

  if (error instanceof Error) {
    console.error(`${prefix} details`, {
      errorType: error.name,
    });
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

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  const cfConnectingIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  return null;
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
