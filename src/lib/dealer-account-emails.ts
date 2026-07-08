type DealerEmailKind = "request_received" | "approved" | "rejected" | "suspended" | "reactivated";

type SendDealerEmailInput = {
  toEmail: string;
  dealerName: string;
  kind: DealerEmailKind;
};

type ResendApiPayload = {
  id?: string;
  error?: {
    message?: string;
  };
  message?: string;
};

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

function resolveDealerName(value: string) {
  const normalized = normalizeText(value);
  return normalized ?? "Concessionaria";
}

function resolveAppBaseUrl() {
  return normalizeText(process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || null) ?? "";
}

function buildStandardEmailFooterHtml() {
  return `
    <p style="margin: 0 0 12px;">--------------------------------</p>
    <p style="margin: 0 0 12px;">Cordiali saluti,</p>
    <p style="margin: 0 0 12px;">Supporto Dealer Platform</p>
    <p style="margin: 0 0 12px;">Questa e un'email automatica.<br />Ti chiediamo di non rispondere a questo messaggio.</p>
    <p style="margin: 0 0 12px;">Per assistenza:<br /><a href="mailto:support@dealerplatform.it">support@dealerplatform.it</a></p>
    <p style="margin: 0;">--------------------------------</p>
  `.trim();
}

function buildEmailContent(input: { kind: DealerEmailKind; dealerName: string }) {
  const dealerName = resolveDealerName(input.dealerName);
  const appBaseUrl = resolveAppBaseUrl().replace(/\/$/, "");
  const loginUrl = appBaseUrl ? `${appBaseUrl}/login` : "";

  if (input.kind === "request_received") {
    return {
      subject: "Richiesta ricevuta - Account concessionaria in verifica",
      html: `
        <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
          <h2 style="margin: 0 0 12px;">Richiesta ricevuta</h2>
          <p style="margin: 0 0 12px;">Ciao,</p>
          <p style="margin: 0 0 12px;">
            abbiamo ricevuto la richiesta di registrazione per la concessionaria <strong>${dealerName}</strong>.
          </p>
          <p style="margin: 0 0 12px;">
            Il tuo account e attualmente in verifica. I tempi stimati di approvazione sono di <strong>1-2 giorni lavorativi</strong>.
          </p>
          <p style="margin: 0 0 12px;">Ti aggiorneremo via email appena la verifica sara completata.</p>
          ${buildStandardEmailFooterHtml()}
        </div>
      `.trim(),
    };
  }

  if (input.kind === "approved") {
    return {
      subject: "Account approvato - Accesso alla piattaforma disponibile",
      html: `
        <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
          <h2 style="margin: 0 0 12px;">Account approvato</h2>
          <p style="margin: 0 0 12px;">Ciao,</p>
          <p style="margin: 0 0 12px;">
            la richiesta per la concessionaria <strong>${dealerName}</strong> e stata approvata.
          </p>
          <p style="margin: 0 0 12px;">
            Da questo momento puoi accedere alla piattaforma e utilizzare tutte le funzioni operative abilitate.
          </p>
          ${loginUrl ? `<p style="margin: 0 0 12px;"><a href="${loginUrl}">Accedi alla piattaforma</a></p>` : ""}
          ${buildStandardEmailFooterHtml()}
        </div>
      `.trim(),
    };
  }

  if (input.kind === "suspended") {
    return {
      subject: "Account sospeso - Accesso temporaneamente non disponibile",
      html: `
        <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
          <h2 style="margin: 0 0 12px;">Account sospeso</h2>
          <p style="margin: 0 0 12px;">Ciao,</p>
          <p style="margin: 0 0 12px;">
            l'account della concessionaria <strong>${dealerName}</strong> e stato temporaneamente sospeso.
          </p>
          <p style="margin: 0 0 12px;">
            Per assistenza o chiarimenti, contatta il supporto all'indirizzo <a href="mailto:support@dealerplatform.it">support@dealerplatform.it</a>.
          </p>
          ${buildStandardEmailFooterHtml()}
        </div>
      `.trim(),
    };
  }

  if (input.kind === "reactivated") {
    return {
      subject: "Account riattivato - Accesso nuovamente disponibile",
      html: `
        <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
          <h2 style="margin: 0 0 12px;">Account riattivato</h2>
          <p style="margin: 0 0 12px;">Ciao,</p>
          <p style="margin: 0 0 12px;">
            l'account della concessionaria <strong>${dealerName}</strong> e stato riattivato.
          </p>
          ${loginUrl ? `<p style="margin: 0 0 12px;"><a href="${loginUrl}">Accedi alla piattaforma</a></p>` : ""}
          ${buildStandardEmailFooterHtml()}
        </div>
      `.trim(),
    };
  }

  return {
    subject: "Esito registrazione account concessionaria",
    html: `
      <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
        <h2 style="margin: 0 0 12px;">Registrazione non approvata</h2>
        <p style="margin: 0 0 12px;">Ciao,</p>
        <p style="margin: 0 0 12px;">
          la richiesta di registrazione per la concessionaria <strong>${dealerName}</strong> non e stata approvata.
        </p>
        <p style="margin: 0;">
          Per ulteriori informazioni o per richiedere supporto puoi contattare il team di assistenza.
        </p>
        ${buildStandardEmailFooterHtml()}
      </div>
    `.trim(),
  };
}

export async function sendDealerLifecycleEmail(input: SendDealerEmailInput) {
  const resendApiKey = normalizeText(process.env.RESEND_API_KEY);
  const toEmail = normalizeEmail(input.toEmail);

  if (!resendApiKey || !toEmail) {
    return { ok: false, reason: "missing_config" as const };
  }

  const content = buildEmailContent({
    kind: input.kind,
    dealerName: input.dealerName,
  });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: resolveFromHeader(),
      to: [toEmail],
      subject: content.subject,
      html: content.html,
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
