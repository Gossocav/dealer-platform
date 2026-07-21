import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { resolveDealerIdFromTenantSources } from "../../../../lib/dealer-id-resolution";

type MessageRow = {
  id: string;
  dealer_id: string;
  thread_id: string;
  status: string;
  subject: string;
  reply_to_email: string | null;
  to_recipients: unknown;
  body_text: string | null;
  body_html: string | null;
};

type ResendApiPayload = {
  id?: string;
  error?: { message?: string };
  message?: string;
};

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function extractBearerToken(authHeader: string | null) {
  const raw = String(authHeader ?? "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = raw.slice(7).trim();
  return token.length > 0 ? token : null;
}

function extractRecipients(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildMessageHtml(bodyText: string, replyToEmail: string | null) {
  const escapedBody = escapeHtml(bodyText).replace(/\n/g, "<br />");

  return `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;max-width:600px;">
      <div>${escapedBody}</div>
      <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0;" />
      <p style="font-size:12px;color:#64748b;margin:0;">
        Messaggio inviato tramite Dealer Platform per conto della concessionaria.
        ${replyToEmail ? `Per rispondere direttamente scrivi a <a href="mailto:${escapeHtml(replyToEmail)}">${escapeHtml(replyToEmail)}</a>.` : ""}
      </p>
    </div>
  `.trim();
}

async function resolveDealerContext(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return {
      error: NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 }),
      supabaseAdmin: null,
      dealerId: null,
    } as const;
  }

  const accessToken = extractBearerToken(request.headers.get("authorization"));

  if (!accessToken) {
    return {
      error: NextResponse.json({ error: "Sessione non valida." }, { status: 401 }),
      supabaseAdmin: null,
      dealerId: null,
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
      dealerId: null,
    } as const;
  }

  let dealerId: string | null = null;

  try {
    dealerId = await resolveDealerIdFromTenantSources(supabaseAdmin, user.id);
  } catch (error) {
    return {
      error: NextResponse.json(
        { error: error instanceof Error ? error.message : "Errore risoluzione concessionaria." },
        { status: 500 }
      ),
      supabaseAdmin: null,
      dealerId: null,
    } as const;
  }

  if (!dealerId) {
    return {
      error: NextResponse.json({ error: "Nessuna concessionaria associata a questo account." }, { status: 403 }),
      supabaseAdmin: null,
      dealerId: null,
    } as const;
  }

  return {
    error: null,
    supabaseAdmin,
    dealerId,
  } as const;
}

export async function POST(request: Request) {
  const context = await resolveDealerContext(request);

  if (context.error) {
    return context.error;
  }

  let body: { messageId?: string } = {};

  try {
    body = (await request.json()) as { messageId?: string };
  } catch {
    return NextResponse.json({ error: "Payload non valido." }, { status: 400 });
  }

  const messageId = normalizeText(body.messageId);

  if (!messageId) {
    return NextResponse.json({ error: "messageId mancante." }, { status: 400 });
  }

  const message = await context.supabaseAdmin
    .from("email_messages")
    .select("id, dealer_id, thread_id, status, subject, reply_to_email, to_recipients, body_text, body_html")
    .eq("id", messageId)
    .eq("dealer_id", context.dealerId)
    .maybeSingle<MessageRow>();

  if (message.error) {
    return NextResponse.json({ error: message.error.message || "Errore lettura messaggio." }, { status: 500 });
  }

  if (!message.data) {
    return NextResponse.json({ error: "Messaggio non trovato." }, { status: 404 });
  }

  if (message.data.status !== "draft") {
    return NextResponse.json({ error: "Il messaggio non e in stato bozza." }, { status: 409 });
  }

  const toRecipients = extractRecipients(message.data.to_recipients);

  if (toRecipients.length === 0) {
    return NextResponse.json({ error: "Nessun destinatario valido." }, { status: 400 });
  }

  const resendApiKey = normalizeText(process.env.RESEND_API_KEY);
  const fromEmail = normalizeText(process.env.RESEND_FROM_EMAIL) ?? "no-reply@dealerplatform.it";

  if (!resendApiKey) {
    return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
  }

  const now = new Date().toISOString();

  const htmlBody = message.data.body_html || (message.data.body_text ? buildMessageHtml(message.data.body_text, message.data.reply_to_email) : null);

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: `Dealer Platform <${fromEmail}>`,
      to: toRecipients,
      ...(message.data.reply_to_email ? { reply_to: message.data.reply_to_email } : {}),
      subject: message.data.subject,
      ...(htmlBody ? { html: htmlBody } : {}),
      ...(message.data.body_text ? { text: message.data.body_text } : {}),
    }),
  });

  const resendPayload = (await resendResponse.json().catch(() => ({}))) as ResendApiPayload;

  if (!resendResponse.ok) {
    const errorMessage = resendPayload?.error?.message || resendPayload?.message || "Invio email non riuscito.";

    await context.supabaseAdmin
      .from("email_messages")
      .update({ status: "failed", failed_at: now, error_message: errorMessage })
      .eq("id", messageId);

    await context.supabaseAdmin.from("email_delivery_events").insert({
      dealer_id: context.dealerId,
      message_id: messageId,
      event_type: "failed",
      event_source: "application",
      event_status: String(resendResponse.status),
      idempotency_hash: crypto.randomUUID(),
      payload_json: resendPayload ?? {},
    });

    return NextResponse.json({ error: errorMessage }, { status: 502 });
  }

  await context.supabaseAdmin
    .from("email_messages")
    .update({
      status: "sent",
      sent_at: now,
      from_email: fromEmail,
      from_name: "Dealer Platform",
      body_html: htmlBody,
      provider: "resend",
      provider_message_id: resendPayload?.id ?? null,
    })
    .eq("id", messageId);

  await context.supabaseAdmin.from("email_threads").update({ last_message_at: now }).eq("id", message.data.thread_id);

  await context.supabaseAdmin.from("email_delivery_events").insert({
    dealer_id: context.dealerId,
    message_id: messageId,
    event_type: "sent",
    event_source: "application",
    idempotency_hash: crypto.randomUUID(),
    payload_json: resendPayload ?? {},
  });

  return NextResponse.json({ status: "sent", sentAt: now }, { status: 200 });
}
