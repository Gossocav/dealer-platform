import { NextResponse } from "next/server";

type SendToClientBody = {
  vehicleId?: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
  publicUrl?: string | null;
  coverImageUrl?: string | null;
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  year?: string | null;
  mileage?: string | null;
  fuel?: string | null;
  transmission?: string | null;
  price?: string | null;
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
    const coverImageUrl = normalizeText(body.coverImageUrl);
    const brand = normalizeText(body.brand) ?? "-";
    const model = normalizeText(body.model) ?? "-";
    const version = normalizeText(body.version) ?? "-";
    const year = normalizeText(body.year) ?? "-";
    const mileage = normalizeText(body.mileage) ?? "-";
    const fuel = normalizeText(body.fuel) ?? "-";
    const transmission = normalizeText(body.transmission) ?? "-";
    const price = normalizeText(body.price) ?? "-";

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
      coverImageUrl,
      brand,
      model,
      version,
      year,
      mileage,
      fuel,
      transmission,
      price,
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
  coverImageUrl,
  brand,
  model,
  version,
  year,
  mileage,
  fuel,
  transmission,
  price,
}: {
  vehicleId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  message: string;
  publicUrl: string | null;
  coverImageUrl: string | null;
  brand: string;
  model: string;
  version: string;
  year: string;
  mileage: string;
  fuel: string;
  transmission: string;
  price: string;
}) {
  const phoneLabel = phone ?? "-";
  const publicUrlBlock = publicUrl
    ? `<div style="margin:24px 0 0 0;"><a href="${escapeHtml(publicUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700;">Visualizza il veicolo</a></div>`
    : "";
  const coverImageBlock = coverImageUrl
    ? `<img src="${escapeHtml(coverImageUrl)}" alt="${escapeHtml(`${brand} ${model}`.trim() || "Veicolo")}" style="display:block;width:100%;height:260px;object-fit:cover;border-radius:18px;" />`
    : `<div style="display:flex;align-items:center;justify-content:center;height:260px;background:#e2e8f0;border-radius:18px;color:#64748b;font-size:14px;">Foto non disponibile</div>`;

  return `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:24px;box-shadow:0 24px 48px -24px rgba(15,23,42,0.35);">
        ${coverImageBlock}
        <div style="padding-top:24px;">
          <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">Veicolo selezionato per te</p>
          <h2 style="margin:0 0 12px 0;color:#0f172a;font-size:28px;line-height:1.2;">${escapeHtml(`${brand} ${model} ${version}`.replace(/\s+/g, " ").trim())}</h2>
          <p style="margin:0 0 16px 0;color:#334155;">Gentile ${escapeHtml(firstName)} ${escapeHtml(lastName)},</p>
          <p style="margin:0 0 20px 0;color:#334155;white-space:pre-wrap;line-height:1.7;">${escapeHtml(message)}</p>
          <table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
            <tr><td style="padding:12px 16px;color:#64748b;font-size:13px;font-weight:700;width:35%;">Marca</td><td style="padding:12px 16px;color:#0f172a;font-size:14px;">${escapeHtml(brand)}</td></tr>
            <tr><td style="padding:12px 16px;color:#64748b;font-size:13px;font-weight:700;">Modello</td><td style="padding:12px 16px;color:#0f172a;font-size:14px;">${escapeHtml(model)}</td></tr>
            <tr><td style="padding:12px 16px;color:#64748b;font-size:13px;font-weight:700;">Versione</td><td style="padding:12px 16px;color:#0f172a;font-size:14px;">${escapeHtml(version)}</td></tr>
            <tr><td style="padding:12px 16px;color:#64748b;font-size:13px;font-weight:700;">Anno</td><td style="padding:12px 16px;color:#0f172a;font-size:14px;">${escapeHtml(year)}</td></tr>
            <tr><td style="padding:12px 16px;color:#64748b;font-size:13px;font-weight:700;">Km</td><td style="padding:12px 16px;color:#0f172a;font-size:14px;">${escapeHtml(mileage)}</td></tr>
            <tr><td style="padding:12px 16px;color:#64748b;font-size:13px;font-weight:700;">Alimentazione</td><td style="padding:12px 16px;color:#0f172a;font-size:14px;">${escapeHtml(fuel)}</td></tr>
            <tr><td style="padding:12px 16px;color:#64748b;font-size:13px;font-weight:700;">Cambio</td><td style="padding:12px 16px;color:#0f172a;font-size:14px;">${escapeHtml(transmission)}</td></tr>
            <tr><td style="padding:12px 16px;color:#64748b;font-size:13px;font-weight:700;">Prezzo</td><td style="padding:12px 16px;color:#0f172a;font-size:14px;font-weight:700;">${escapeHtml(price)}</td></tr>
          </table>
        </div>
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