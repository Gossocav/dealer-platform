import { NextResponse } from "next/server";

type SendToClientBody = {
  vehicleId?: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
  publicUrl?: string | null;
};

type ResendResponse = {
  error?: {
    message?: string;
  };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendToClientBody;

    const vehicleId = normalizeText(body.vehicleId);
    const firstName = normalizeText(body.firstName);
    const lastName = normalizeText(body.lastName);
    const email = normalizeEmail(body.email);
    const phone = normalizeText(body.phone);
    const message = normalizeText(body.message);
    const publicUrl = normalizeText(body.publicUrl);

    if (!vehicleId || !firstName || !lastName) {
      return NextResponse.json({ error: "Dati richiesta non validi." }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: "Inserisci un indirizzo email valido per l'invio." }, { status: 400 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;

    if (!resendApiKey || !fromEmail) {
      return NextResponse.json({ error: "Configurazione email mancante. Imposta RESEND_API_KEY e RESEND_FROM_EMAIL." }, { status: 500 });
    }

    const html = buildCustomerEmailHtml({
      vehicleId,
      firstName,
      lastName,
      email,
      phone,
      message: message ?? "",
      publicUrl,
    });

    await sendResendEmail({
      apiKey: resendApiKey,
      fromEmail,
      to: email,
      subject: "Veicolo selezionato per te",
      html,
    });

    return NextResponse.json({ message: "Veicolo inviato al cliente." }, { status: 200 });
  } catch (error) {
    console.error("Vehicle send-to-client API unexpected error", error);
    return NextResponse.json({ error: "Errore interno durante l'invio email." }, { status: 500 });
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

function buildCustomerEmailHtml({
  vehicleId,
  firstName,
  lastName,
  email,
  phone,
  message,
  publicUrl,
}: {
  vehicleId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  message: string;
  publicUrl: string | null;
}) {
  const phoneLabel = phone ?? "-";
  const publicUrlBlock = publicUrl ? `<p style="margin:16px 0 0 0;"><a href="${escapeHtml(publicUrl)}" style="color:#2563eb;text-decoration:none;font-weight:600;">Apri annuncio veicolo</a></p>` : "";

  return `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
        <h2 style="margin:0 0 16px 0;color:#0f172a;">Veicolo selezionato per te</h2>
        <p style="margin:0 0 12px 0;color:#334155;">Gentile ${escapeHtml(firstName)} ${escapeHtml(lastName)},</p>
        <p style="margin:0 0 16px 0;color:#334155;white-space:pre-wrap;">${escapeHtml(message)}</p>
        ${publicUrlBlock}
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="margin:0 0 8px 0;color:#64748b;font-size:13px;">Riferimento veicolo: ${escapeHtml(vehicleId)}</p>
        <p style="margin:0 0 8px 0;color:#64748b;font-size:13px;">Email destinatario: ${escapeHtml(email)}</p>
        <p style="margin:0;color:#64748b;font-size:13px;">Telefono destinatario: ${escapeHtml(phoneLabel)}</p>
      </div>
    </div>
  `;
}

function normalizeText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeEmail(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
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