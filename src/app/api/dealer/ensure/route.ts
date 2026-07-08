import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendDealerLifecycleEmail } from "@/lib/dealer-account-emails";
import { sendAdminNotificationEmail } from "@/lib/admin-notification-email";

type EnsureDealerBody = {
  legal_company_name?: string;
  vat_number?: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  whatsapp_phone?: string;
  subscription_plan?: string;
  subscription_status?: string;
};

type SubscriptionPlan = "base" | "pro";
type SubscriptionStatus = "pending_activation" | "pending_payment";

type DealerIdRow = {
  id: string;
};

type DealerCandidateRow = {
  id: string;
  user_id: string | null;
};

type DealerMembershipRow = {
  dealer_id: string | null;
};

class DealerAssociationConflictError extends Error {}

export async function POST(request: Request) {
  try {
    let body: EnsureDealerBody;
    try {
      body = (await request.json()) as EnsureDealerBody;
    } catch {
      return NextResponse.json({ error: "Payload non valido." }, { status: 400 });
    }

    const legalCompanyName = normalizeText(body.legal_company_name);
    const vatNumber = normalizeText(body.vat_number);
    const contactPerson = normalizeText(body.contact_person);
    const email = normalizeEmail(body.email);
    const phone = normalizeText(body.phone);
    const whatsappPhone = normalizeText(body.whatsapp_phone);
    const subscriptionPlan = normalizeSubscriptionPlan(body.subscription_plan);
    const subscriptionStatus = normalizeSubscriptionStatus(body.subscription_status) ?? "pending_activation";

    if (!legalCompanyName || !vatNumber || !contactPerson || !email || !phone || !subscriptionPlan) {
      return NextResponse.json({ error: "Dati registrazione non validi." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
    }

    const authHeader = request.headers.get("authorization");
    const accessToken = extractBearerToken(authHeader);

    if (!accessToken) {
      return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });
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
      return NextResponse.json({ error: "Utente non autenticato." }, { status: 401 });
    }

    const dealerId = await ensureDealerAssociation({
      supabaseAdmin,
      userId: user.id,
      legalCompanyName,
      vatNumber,
      contactPerson,
      email,
      phone,
      whatsappPhone,
      subscriptionPlan,
      subscriptionStatus,
    });

    try {
      const emailResult = await sendDealerLifecycleEmail({
        toEmail: email,
        dealerName: legalCompanyName,
        kind: "request_received",
      });

      if (!emailResult.ok) {
        console.error("Dealer ensure request-received email provider error", emailResult);
      }
    } catch (emailError) {
      console.error("Dealer ensure request-received email failed", emailError);
    }

    try {
      const adminNotificationResult = await sendAdminNotificationEmail({
        subject: "Nuova registrazione dealer in attesa di verifica",
        html: `
          <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
            <h2 style="margin:0 0 12px;">Nuova richiesta dealer</h2>
            <p style="margin:0 0 12px;">E stata inviata una nuova registrazione concessionaria.</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:6px 0;font-weight:600;">Concessionaria</td><td style="padding:6px 0;">${escapeHtml(legalCompanyName)}</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;">Referente</td><td style="padding:6px 0;">${escapeHtml(contactPerson)}</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;">Email</td><td style="padding:6px 0;">${escapeHtml(email)}</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;">Telefono</td><td style="padding:6px 0;">${escapeHtml(phone)}</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;">Piano</td><td style="padding:6px 0;">${escapeHtml(subscriptionPlan)}</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;">Stato abbonamento</td><td style="padding:6px 0;">${escapeHtml(subscriptionStatus)}</td></tr>
            </table>
          </div>
        `.trim(),
      });

      if (!adminNotificationResult.ok) {
        console.error("Dealer ensure admin notification provider error", adminNotificationResult);
      }
    } catch (adminEmailError) {
      console.error("Dealer ensure admin notification failed", adminEmailError);
    }

    await clearContactMetadataBestEffort(supabaseAdmin, user.id, user.user_metadata);

    return NextResponse.json({ dealer_id: dealerId }, { status: 200 });
  } catch (error) {
    if (error instanceof DealerAssociationConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("Dealer ensure API unexpected error", error);
    return NextResponse.json({ error: "Errore interno durante la registrazione concessionaria." }, { status: 500 });
  }
}

type EnsureDealerAssociationInput = {
  supabaseAdmin: SupabaseClient;
  userId: string;
  legalCompanyName: string;
  vatNumber: string;
  contactPerson: string;
  email: string;
  phone: string;
  whatsappPhone: string | null;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
};

async function ensureDealerAssociation({
  supabaseAdmin,
  userId,
  legalCompanyName,
  vatNumber,
  contactPerson,
  email,
  phone,
  whatsappPhone,
  subscriptionPlan,
  subscriptionStatus,
}: EnsureDealerAssociationInput) {
  const membership = await supabaseAdmin
    .from("dealer_users")
    .select("dealer_id")
    .eq("profile_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<DealerMembershipRow>();

  if (membership.error) {
    throw new Error(membership.error.message || "Errore lookup membership dealer.");
  }

  let dealerId = normalizeText(membership.data?.dealer_id);

  if (!dealerId) {
    const byOwner = await supabaseAdmin
      .from("dealers")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle<DealerIdRow>();

    if (byOwner.error) {
      throw new Error(byOwner.error.message || "Errore lookup dealer owner.");
    }

    dealerId = normalizeText(byOwner.data?.id);
  }

  if (!dealerId) {
    const existingDealer = await supabaseAdmin
      .from("dealers")
      .select("id, user_id")
      .eq("email", email)
      .eq("vat_number", vatNumber)
      .limit(1)
      .maybeSingle<DealerCandidateRow>();

    if (existingDealer.error) {
      throw new Error(existingDealer.error.message || "Errore lookup dealer per email e partita IVA.");
    }

    if (existingDealer.data?.id && existingDealer.data.user_id && existingDealer.data.user_id !== userId) {
      throw new DealerAssociationConflictError("Questa concessionaria risulta gia associata a un altro account.");
    }

    dealerId = normalizeText(existingDealer.data?.id);
  }

  if (!dealerId) {
    const createdDealer = await supabaseAdmin
      .from("dealers")
      .insert({
        name: legalCompanyName,
        legal_name: legalCompanyName,
        vat_number: vatNumber,
        contact_person: contactPerson,
        email,
        phone,
        whatsapp_phone: whatsappPhone,
        subscription_plan: subscriptionPlan,
        subscription_status: subscriptionStatus,
        plan: subscriptionPlan,
        status: "pending_review",
      })
      .select("id")
      .maybeSingle<DealerIdRow>();

    if (createdDealer.error || !createdDealer.data?.id) {
      throw new Error(createdDealer.error?.message || "Impossibile creare il record dealer.");
    }

    dealerId = createdDealer.data.id;
  }

  await updateDealer(supabaseAdmin, dealerId, {
    legalCompanyName,
    vatNumber,
    contactPerson,
    email,
    phone,
    whatsappPhone,
    subscriptionPlan,
    subscriptionStatus,
    userId,
  });

  await syncIdentityMembership(supabaseAdmin, {
    userId,
    dealerId,
  });

  return dealerId;
}

async function updateDealer(
  supabaseAdmin: SupabaseClient,
  dealerId: string,
  values: {
    legalCompanyName: string;
    vatNumber: string;
    contactPerson: string;
    email: string;
    phone: string;
    whatsappPhone: string | null;
    subscriptionPlan: SubscriptionPlan;
    subscriptionStatus: SubscriptionStatus;
    userId: string;
  }
) {
  const { legalCompanyName, vatNumber, contactPerson, email, phone, whatsappPhone, subscriptionPlan, subscriptionStatus, userId } = values;

  const { error } = await supabaseAdmin
    .from("dealers")
    .update({
      name: legalCompanyName,
      legal_name: legalCompanyName,
      vat_number: vatNumber,
      contact_person: contactPerson,
      email,
      phone,
      whatsapp_phone: whatsappPhone,
      subscription_plan: subscriptionPlan,
      subscription_status: subscriptionStatus,
      plan: subscriptionPlan,
      status: "pending_review",
      user_id: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dealerId);

  if (error) {
    throw new Error(error.message || "Errore aggiornamento dealer.");
  }
}

async function syncIdentityMembership(
  supabaseAdmin: SupabaseClient,
  input: {
    userId: string;
    dealerId: string;
  }
) {
  const { userId, dealerId } = input;
  const updatedAt = new Date().toISOString();

  const profile = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        id: userId,
        dealer_id: dealerId,
        updated_at: updatedAt,
      },
      { onConflict: "id" }
    );

  if (profile.error) {
    throw new Error(profile.error.message || "Errore upsert profilo utente.");
  }

  const membership = await supabaseAdmin
    .from("dealer_users")
    .upsert(
      {
        dealer_id: dealerId,
        profile_id: userId,
        role: "dealer_member",
          status: "invited",
        updated_at: updatedAt,
      },
      { onConflict: "dealer_id,profile_id" }
    );

  if (membership.error) {
    throw new Error(membership.error.message || "Errore upsert membership dealer utente.");
  }
}

function extractBearerToken(authHeader: string | null) {
  const raw = String(authHeader ?? "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = raw.slice(7).trim();
  return token.length > 0 ? token : null;
}

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function normalizeEmail(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return text.length > 0 ? text : null;
}

function normalizeSubscriptionPlan(value: unknown): SubscriptionPlan | null {
  const text = String(value ?? "").trim().toLowerCase();

  if (text === "base" || text === "pro") {
    return text;
  }

  return null;
}

function normalizeSubscriptionStatus(value: unknown): SubscriptionStatus | null {
  const text = String(value ?? "").trim().toLowerCase();

  if (text === "pending_activation" || text === "pending_payment") {
    return text;
  }

  return null;
}

async function clearContactMetadataBestEffort(
  supabaseAdmin: SupabaseClient,
  userId: string,
  userMetadata: unknown
) {
  const currentMetadata = isRecord(userMetadata) ? { ...userMetadata } : {};

  let changed = false;

  if ("phone" in currentMetadata) {
    delete currentMetadata.phone;
    changed = true;
  }

  if ("whatsapp_phone" in currentMetadata) {
    delete currentMetadata.whatsapp_phone;
    changed = true;
  }

  if (!changed) {
    return;
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: currentMetadata,
  });

  if (error) {
    console.warn("Dealer ensure API could not clear auth contact metadata", error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
