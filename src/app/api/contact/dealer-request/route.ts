import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { hitRateLimit } from "@/lib/api-rate-limit";
import { sendAdminNotificationEmail } from "@/lib/admin-notification-email";

type DealerInfoRequestBody = {
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  message?: string;
  planCode?: string;
  websiteTrap?: string;
};

const DEALER_INFO_REQUEST_RATE_LIMIT = {
  windowMs: 15 * 60_000,
  maxRequests: 5,
};

const MAX_MESSAGE_LENGTH = 4000;

/**
 * Il piano da cui arriva la richiesta.
 *
 * Senza, la notifica diceva soltanto "una concessionaria ha inviato una
 * richiesta dalla pagina di registrazione": chi risponde non sapeva se stava
 * guardando il Base da 99 euro o l'Elite da 699, e doveva chiederlo di nuovo a
 * chi aveva gia' scritto.
 *
 * Si accetta solo un codice conosciuto: e' un valore che arriva dal browser, e
 * finisce in una email. Uno sconosciuto si ignora invece di riportarlo.
 */
const PIANI_AMMESSI: Record<string, string> = {
  base: "Base",
  pro: "Pro",
  elite: "Elite",
};

function normalizePlanLabel(value: unknown) {
  const codice = String(value ?? "").trim().toLowerCase();
  return PIANI_AMMESSI[codice] ?? null;
}

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function normalizeEmail(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    return null;
  }

  return text;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const cfConnectingIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfConnectingIp) return cfConnectingIp;

  return null;
}

export async function POST(request: Request) {
  try {
    let body: DealerInfoRequestBody;
    try {
      body = (await request.json()) as DealerInfoRequestBody;
    } catch {
      return NextResponse.json({ error: "Payload non valido." }, { status: 400 });
    }

    // Honeypot: a filled hidden field means a bot, so accept-and-drop rather
    // than reveal the check.
    if (normalizeText(body.websiteTrap)) {
      return NextResponse.json({ message: "Richiesta inviata." }, { status: 200 });
    }

    const clientIp = getClientIp(request) ?? "unknown";
    const rateLimit = hitRateLimit(`dealer-info-request:${clientIp}`, DEALER_INFO_REQUEST_RATE_LIMIT);
    if (rateLimit.limited) {
      return NextResponse.json({ error: "Troppi tentativi. Riprova tra poco." }, { status: 429 });
    }

    const companyName = normalizeText(body.companyName);
    const contactName = normalizeText(body.contactName);
    const email = normalizeEmail(body.email);
    const phone = normalizeText(body.phone);
    const message = normalizeText(body.message);
    const planLabel = normalizePlanLabel(body.planCode);

    if (!companyName || !contactName || !email || !phone || !message) {
      return NextResponse.json({ error: "Compila tutti i campi obbligatori." }, { status: 400 });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: "Messaggio troppo lungo." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("dealer-info-request:missing-env", {
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasServiceRoleKey: Boolean(supabaseServiceRoleKey),
      });

      return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // Persist first: the row is the record of the enquiry, so it must not
    // depend on the email provider succeeding.
    const insert = await supabaseAdmin.from("dealer_info_requests").insert({
      company_name: companyName,
      contact_name: contactName,
      email,
      phone,
      message,
    });

    if (insert.error) {
      console.error("dealer-info-request:insert-failed", {
        code: insert.error.code ?? null,
        message: insert.error.message ?? null,
      });

      return NextResponse.json(
        { error: "Invio non riuscito. Scrivici direttamente a info@keyauto.it." },
        { status: 500 }
      );
    }

    // Notification is best effort now that the request is stored: a provider
    // failure (Resend warm-up cap) must not tell the dealer their enquiry was
    // lost, because it wasn't -- it is visible in the admin area.
    const notification = await sendAdminNotificationEmail({
      subject: planLabel ? `Richiesta informazioni sul Piano ${planLabel} da ${companyName}` : `Richiesta informazioni da ${companyName}`,
      html: `
        <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
          <h2 style="margin:0 0 12px;">Richiesta informazioni da una concessionaria</h2>
          <p style="margin:0 0 12px;">${
            planLabel
              ? `Una concessionaria ha inviato una richiesta dalla pagina del <strong>Piano ${escapeHtml(planLabel)}</strong>.`
              : "Una concessionaria ha inviato una richiesta dalla pagina di registrazione."
          }</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:6px 0;font-weight:600;">Concessionaria</td><td style="padding:6px 0;">${escapeHtml(companyName)}</td></tr>
            <tr><td style="padding:6px 0;font-weight:600;">Referente</td><td style="padding:6px 0;">${escapeHtml(contactName)}</td></tr>
            <tr><td style="padding:6px 0;font-weight:600;">Email</td><td style="padding:6px 0;">${escapeHtml(email)}</td></tr>
            <tr><td style="padding:6px 0;font-weight:600;">Telefono</td><td style="padding:6px 0;">${escapeHtml(phone ?? "-")}</td></tr>
            ${planLabel ? `<tr><td style="padding:6px 0;font-weight:600;">Piano</td><td style="padding:6px 0;">${escapeHtml(planLabel)}</td></tr>` : ""}
          </table>
          <p style="margin:16px 0 6px;font-weight:600;">Messaggio</p>
          <p style="margin:0;white-space:pre-wrap;">${escapeHtml(message)}</p>
        </div>
      `.trim(),
    });

    if (!notification.ok) {
      console.error("dealer-info-request:notification-failed", {
        reason: notification.reason ?? null,
      });
    }

    return NextResponse.json({ message: "Richiesta inviata. Ti risponderemo al piu presto." }, { status: 200 });
  } catch (error) {
    console.error("dealer-info-request:unexpected-error", {
      errorType: error instanceof Error ? error.name : "unknown_error",
    });

    return NextResponse.json({ error: "Errore interno durante l'invio della richiesta." }, { status: 500 });
  }
}
