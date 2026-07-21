type ResendApiPayload = {
  id?: string;
  error?: {
    message?: string;
  };
  message?: string;
};

const DEFAULT_ADMIN_NOTIFICATION_EMAIL = "info@keyplanrental.it";
const DEFAULT_EMAIL_FROM_ADDRESS = "no-reply@dealerplatform.it";
const EMAIL_FROM_NAME = "Dealer Platform";

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function normalizeEmail(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text || !text.includes("@")) {
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

function resolveFromHeader() {
  const envFromAddress = normalizeEmail(process.env.RESEND_FROM_EMAIL);
  const fromAddress = envFromAddress ?? DEFAULT_EMAIL_FROM_ADDRESS;

  return `${EMAIL_FROM_NAME} <${fromAddress}>`;
}

export function resolveAdminNotificationEmail() {
  const configuredEmail = normalizeEmail(process.env.ADMIN_NOTIFICATION_EMAIL);
  return configuredEmail ?? DEFAULT_ADMIN_NOTIFICATION_EMAIL;
}

export async function sendPlatformEmail(input: { toEmail: string; subject: string; html: string }) {
  const resendApiKey = normalizeText(process.env.RESEND_API_KEY);
  const toEmail = normalizeEmail(input.toEmail);

  if (!resendApiKey || !toEmail) {
    return { ok: false, reason: "missing_config" as const };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: resolveFromHeader(),
      to: [toEmail],
      subject: input.subject,
      html: input.html,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as ResendApiPayload;

  if (!response.ok) {
    return {
      ok: false,
      reason: "provider_error" as const,
      status: response.status,
      message: payload?.error?.message || payload?.message || "Resend request failed",
    };
  }

  return {
    ok: true,
    id: payload.id ?? null,
  };
}

export async function sendAdminNotificationEmail(input: { subject: string; html: string }) {
  return sendPlatformEmail({
    toEmail: resolveAdminNotificationEmail(),
    subject: input.subject,
    html: input.html,
  });
}

export async function sendDemoLifecycleEmail(input: {
  toEmail: string;
  kind: "received" | "approved" | "access" | "reminder" | "expired" | "converted" | "revoked";
  dealerName?: string;
  expiresAt?: string | null;
  daysRemaining?: number;
  supportEmail?: string;
}) {
  const toEmail = normalizeEmail(input.toEmail);
  if (!toEmail) {
    return { ok: false, reason: "missing_config" as const };
  }

  const subjectMap = {
    received: "Richiesta Demo ricevuta - Dealer Platform",
    approved: "Demo Dealer Platform attivata",
    access: "Accesso alla tua demo Dealer Platform",
    reminder: "La tua demo Dealer Platform sta per scadere",
    expired: "La tua demo Dealer Platform e scaduta",
    converted: "Il tuo account Dealer Platform e stato attivato",
    revoked: "La tua demo Dealer Platform e stata revocata",
  } as const;

  const bodyMap = {
    received: `
      <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
        <h2 style="margin:0 0 12px;">Richiesta ricevuta</h2>
        <p style="margin:0 0 12px;">Ciao,</p>
        <p style="margin:0 0 12px;">abbiamo ricevuto la tua richiesta di Demo Dealer Platform per <strong>${escapeHtml(input.dealerName ?? "-")}</strong>.</p>
        <p style="margin:0 0 12px;">Il nostro team verifichera i dati inviati e ti contattera per l'attivazione. Tempi stimati: 1-2 giorni lavorativi.</p>
      </div>
    `,
    approved: `
      <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
        <h2 style="margin:0 0 12px;">Demo attivata</h2>
        <p style="margin:0 0 12px;">La tua demo Dealer Platform e stata attivata con successo.</p>
        <p style="margin:0 0 12px;">Concessionaria: <strong>${escapeHtml(input.dealerName ?? "-")}</strong></p>
        <p style="margin:0 0 12px;">Scadenza: <strong>${escapeHtml(input.expiresAt ?? "-")}</strong></p>
      </div>
    `,
    access: `
      <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
        <h2 style="margin:0 0 12px;">Accesso demo pronto</h2>
        <p style="margin:0 0 12px;">Il tuo account demo e pronto. Accedi alla dashboard per esplorare la piattaforma.</p>
      </div>
    `,
    reminder: `
      <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
        <h2 style="margin:0 0 12px;">Demo in scadenza</h2>
        <p style="margin:0 0 12px;">La tua demo Dealer Platform scade tra ${input.daysRemaining ?? 0} giorni.</p>
        <p style="margin:0 0 12px;">Per attivare il piano completo, rispondi a questa email o contatta il supporto.</p>
      </div>
    `,
    expired: `
      <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
        <h2 style="margin:0 0 12px;">Demo scaduta</h2>
        <p style="margin:0 0 12px;">La tua demo Dealer Platform e scaduta e l'accesso in scrittura e stato bloccato.</p>
        <p style="margin:0 0 12px;">Puoi comunque continuare a consultare i dati salvati e richiedere una nuova attivazione.</p>
      </div>
    `,
    converted: `
      <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
        <h2 style="margin:0 0 12px;">Account attivato</h2>
        <p style="margin:0 0 12px;">Il tuo account Dealer Platform e stato attivato definitivamente.</p>
      </div>
    `,
    revoked: `
      <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
        <h2 style="margin:0 0 12px;">Demo revocata</h2>
        <p style="margin:0 0 12px;">La tua demo Dealer Platform e stata revocata. Se ritieni si tratti di un errore, contatta il supporto.</p>
      </div>
    `,
  } as const;

  return sendPlatformEmail({
    toEmail,
    subject: subjectMap[input.kind],
    html: bodyMap[input.kind],
  });
}
