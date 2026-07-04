import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type EnsureDealerBody = {
  legal_company_name?: string;
  vat_number?: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  whatsapp_phone?: string;
};

type UserProfileRow = {
  dealer_id: string | null;
};

type DealerIdRow = {
  id: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as EnsureDealerBody;

    const legalCompanyName = normalizeText(body.legal_company_name);
    const vatNumber = normalizeText(body.vat_number);
    const contactPerson = normalizeText(body.contact_person);
    const email = normalizeEmail(body.email);
    const phone = normalizeText(body.phone);
    const whatsappPhone = normalizeText(body.whatsapp_phone);

    if (!legalCompanyName || !vatNumber || !contactPerson || !email || !phone) {
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
    });

    await clearContactMetadataBestEffort(supabaseAdmin, user.id, user.user_metadata);

    return NextResponse.json({ dealer_id: dealerId }, { status: 200 });
  } catch (error) {
    console.error("Dealer ensure API unexpected error", error);
    return NextResponse.json({ error: "Errore interno durante la registrazione concessionaria." }, { status: 500 });
  }
}

type EnsureDealerAssociationInput = {
  supabaseAdmin: SupabaseClient<any, any, any>;
  userId: string;
  legalCompanyName: string;
  vatNumber: string;
  contactPerson: string;
  email: string;
  phone: string;
  whatsappPhone: string | null;
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
}: EnsureDealerAssociationInput) {
  // 1) Prova associazione nativa dealers.user_id (se presente nello schema).
  const byUserId = await findDealerIdByUserId(supabaseAdmin, userId);
  if (byUserId) {
    await upsertProfile(supabaseAdmin, {
      userId,
      dealerId: byUserId,
    });

    return byUserId;
  }

  // 2) Fallback compatibile: usa profiles.dealer_id se gia presente.
  const { data: profileRow } = await supabaseAdmin
    .from("profiles")
    .select("dealer_id")
    .eq("id", userId)
    .maybeSingle<UserProfileRow>();

  if (profileRow?.dealer_id) {
    await updateDealerBestEffort(supabaseAdmin, profileRow.dealer_id, {
      legalCompanyName,
      vatNumber,
      contactPerson,
      email,
      phone,
      whatsappPhone,
      userId,
    });

    return profileRow.dealer_id;
  }

  // 3) Evita duplicati provando a riusare un dealer esistente per email+vat.
  const { data: existingDealer } = await supabaseAdmin
    .from("dealers")
    .select("id")
    .eq("email", email)
    .eq("vat_number", vatNumber)
    .limit(1)
    .maybeSingle<DealerIdRow>();

  let dealerId = existingDealer?.id ?? null;

  // 4) Se non trovato, crea dealer.
  if (!dealerId) {
    const { data: insertedDealer, error: insertDealerError } = await supabaseAdmin
      .from("dealers")
      .insert({
        name: legalCompanyName,
        legal_name: legalCompanyName,
        vat_number: vatNumber,
        contact_person: contactPerson,
        email,
        phone,
        whatsapp_phone: whatsappPhone,
        status: "active",
      })
      .select("id")
      .maybeSingle<DealerIdRow>();

    if (insertDealerError || !insertedDealer?.id) {
      throw new Error(insertDealerError?.message || "Impossibile creare il record dealer.");
    }

    dealerId = insertedDealer.id;
  }

  await updateDealerBestEffort(supabaseAdmin, dealerId, {
    legalCompanyName,
    vatNumber,
    contactPerson,
    email,
    phone,
    whatsappPhone,
    userId,
  });

  await upsertProfile(supabaseAdmin, {
    userId,
    dealerId,
  });

  return dealerId;
}

async function findDealerIdByUserId(supabaseAdmin: SupabaseClient<any, any, any>, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("dealers")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle<DealerIdRow>();

  if (!error) {
    return data?.id ?? null;
  }

  if (isMissingColumnError(error.message, "user_id")) {
    return null;
  }

  throw new Error(error.message || "Errore lookup dealer per user_id.");
}

async function updateDealerBestEffort(
  supabaseAdmin: SupabaseClient<any, any, any>,
  dealerId: string,
  values: {
    legalCompanyName: string;
    vatNumber: string;
    contactPerson: string;
    email: string;
    phone: string;
    whatsappPhone: string | null;
    userId: string;
  }
) {
  const { legalCompanyName, vatNumber, contactPerson, email, phone, whatsappPhone, userId } = values;

  const { error: updateError } = await supabaseAdmin
    .from("dealers")
    .update({
      name: legalCompanyName,
      legal_name: legalCompanyName,
      vat_number: vatNumber,
      contact_person: contactPerson,
      email,
      phone,
      whatsapp_phone: whatsappPhone,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dealerId);

  if (updateError) {
    throw new Error(updateError.message || "Errore aggiornamento dealer.");
  }

  const { error: userIdError } = await supabaseAdmin
    .from("dealers")
    .update({ user_id: userId, updated_at: new Date().toISOString() })
    .eq("id", dealerId);

  if (userIdError && !isMissingColumnError(userIdError.message, "user_id")) {
    throw new Error(userIdError.message || "Errore associazione user_id del dealer.");
  }
}

async function upsertProfile(
  supabaseAdmin: SupabaseClient<any, any, any>,
  input: {
    userId: string;
    dealerId: string;
  }
) {
  const { userId, dealerId } = input;
  const updatedAt = new Date().toISOString();

  const basePayload: Record<string, unknown> = {
    id: userId,
    dealer_id: dealerId,
    updated_at: updatedAt,
  };

  const attemptedColumns = ["updated_at"];

  for (let index = 0; index <= attemptedColumns.length; index += 1) {
    const payload = { ...basePayload };

    for (let removeIndex = 0; removeIndex < index; removeIndex += 1) {
      delete payload[attemptedColumns[removeIndex]];
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .upsert(payload, { onConflict: "id" });

    if (!error) {
      return;
    }

    const missingColumn = attemptedColumns[index];
    if (!missingColumn || !isMissingColumnError(error.message, missingColumn)) {
      throw new Error(error.message || "Errore upsert profilo utente.");
    }
  }

  throw new Error("Errore upsert profilo utente.");
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

function isMissingColumnError(message: string | undefined, columnName: string) {
  const text = String(message ?? "").toLowerCase();
  return text.includes(columnName.toLowerCase()) && (text.includes("column") || text.includes("schema cache"));
}

async function clearContactMetadataBestEffort(
  supabaseAdmin: SupabaseClient<any, any, any>,
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
