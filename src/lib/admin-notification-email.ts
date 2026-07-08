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

function resolveFromHeader() {
  const envFromAddress = normalizeEmail(process.env.RESEND_FROM_EMAIL);
  const fromAddress = envFromAddress ?? DEFAULT_EMAIL_FROM_ADDRESS;

  return `${EMAIL_FROM_NAME} <${fromAddress}>`;
}

export function resolveAdminNotificationEmail() {
  const configuredEmail = normalizeEmail(process.env.ADMIN_NOTIFICATION_EMAIL);
  return configuredEmail ?? DEFAULT_ADMIN_NOTIFICATION_EMAIL;
}

export async function sendAdminNotificationEmail(input: { subject: string; html: string }) {
  const resendApiKey = normalizeText(process.env.RESEND_API_KEY);
  const toEmail = resolveAdminNotificationEmail();

  if (!resendApiKey) {
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
