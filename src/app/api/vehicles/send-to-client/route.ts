import { NextResponse } from "next/server";
import { Resend } from "resend";

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
  message?: string;
  error?: {
    message?: string;
  };
};

const REQUIRED_FROM_DOMAIN = "keyplanrental.it";

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

    console.info("Vehicle send-to-client API called", {
      hasVehicleId: Boolean(vehicleId),
      hasFirstName: Boolean(firstName),
      hasLastName: Boolean(lastName),
      hasEmail: Boolean(email),
      hasPublicUrl: Boolean(publicUrl),
    });

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

    const normalizedFromEmail = normalizeEmail(fromEmail);
    if (!normalizedFromEmail || !normalizedFromEmail.includes("@")) {
      console.error("Invalid RESEND_FROM_EMAIL format.", { hasValue: Boolean(fromEmail) });
      return NextResponse.json({ error: "Configurazione mittente email non valida." }, { status: 500 });
    }

    if (!normalizedFromEmail.endsWith(`@${REQUIRED_FROM_DOMAIN}`)) {
      console.error("RESEND_FROM_EMAIL does not match required domain.", {
        fromEmail: normalizedFromEmail,
        requiredDomain: REQUIRED_FROM_DOMAIN,
      });
      return NextResponse.json({ error: `Configurazione mittente non valida: usare dominio ${REQUIRED_FROM_DOMAIN}.` }, { status: 500 });
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

    const resend = new Resend(resendApiKey);

    await sendResendEmail({
      resend,
      fromEmail: normalizedFromEmail,
      to: email,
      subject: "Veicolo selezionato per te",
      html,
    });

    return NextResponse.json({ message: "Veicolo inviato al cliente." }, { status: 200 });
  } catch (error) {
    const details = serializeUnknownError(error);

    console.error(error);
    console.error(details.message);
    console.error(details.stack);

    if (details.httpStatus !== null || details.responseBody !== null) {
      console.error("Resend HTTP status:", details.httpStatus);
      console.error("Resend response body:", details.responseBody);
      console.error("Resend real message:", details.message);
    }

    return NextResponse.json(
      {
        error: details.message,
        status: details.httpStatus,
        responseBody: details.responseBody,
      },
      { status: details.httpStatus ?? 500 }
    );
  }
}

async function sendResendEmail({
  resend,
  fromEmail,
  to,
  subject,
  html,
}: {
  resend: Resend;
  fromEmail: string;
  to: string;
  subject: string;
  html: string;
}) {
  console.info("Executing resend.emails.send", {
    to,
    fromEmail,
    subject,
  });

  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to: [to],
    subject,
    html,
  });

  if (error) {
    const responseBody = safeStringify(error);
    const message = error.message || "Errore sconosciuto da Resend";
    const status = getStatusFromUnknown(error);

    console.error("Resend API returned error.", {
      status,
      responseBody,
      message,
    });

    throw createHttpLikeError(message, status ?? 502, responseBody);
  }

  console.info("resend.emails.send completed", { emailId: data?.id ?? null });
}

function createHttpLikeError(message: string, status: number, responseBody: string) {
  const error = new Error(message) as Error & {
    httpStatus?: number;
    responseBody?: string;
  };

  error.httpStatus = status;
  error.responseBody = responseBody;
  return error;
}

function getStatusFromUnknown(value: unknown) {
  if (!value || typeof value !== "object") return null;

  const candidate = value as { statusCode?: unknown; status?: unknown; httpStatus?: unknown };

  const raw = candidate.statusCode ?? candidate.status ?? candidate.httpStatus;
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function serializeUnknownError(error: unknown): {
  message: string;
  stack: string | null;
  httpStatus: number | null;
  responseBody: string | null;
} {
  if (error instanceof Error) {
    const withMeta = error as Error & {
      httpStatus?: unknown;
      responseBody?: unknown;
    };

    const status = getStatusFromUnknown(withMeta.httpStatus ?? error);
    const body = withMeta.responseBody === undefined || withMeta.responseBody === null ? null : String(withMeta.responseBody);

    return {
      message: error.message || "Errore interno durante l'invio email.",
      stack: error.stack ?? null,
      httpStatus: status,
      responseBody: body,
    };
  }

  return {
    message: "Errore interno durante l'invio email.",
    stack: null,
    httpStatus: null,
    responseBody: safeStringify(error),
  };
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