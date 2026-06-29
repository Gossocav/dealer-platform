import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type EnsureDealerBody = {
  company_name?: string;
  legal_company_name?: string;
  vat_number?: string;
  tax_code?: string;
  contact_person?: string;
  email?: string;
  phone?: string;
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

    const companyName = normalizeText(body.company_name);
    const legalCompanyName = normalizeText(body.legal_company_name);
    const vatNumber = normalizeText(body.vat_number);
    const taxCode = normalizeText(body.tax_code);
    const contactPerson = normalizeText(body.contact_person);
    const email = normalizeEmail(body.email);
    const phone = normalizeText(body.phone);

    if (!companyName || !legalCompanyName || !vatNumber || !taxCode || !contactPerson || !email || !phone) {
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
      companyName,
      legalCompanyName,
      vatNumber,
      taxCode,
      contactPerson,
      email,
      phone,
    });

    return NextResponse.json({ dealer_id: dealerId }, { status: 200 });
  } catch (error) {
    console.error("Dealer ensure API unexpected error", error);
    return NextResponse.json({ error: "Errore interno durante la registrazione concessionaria." }, { status: 500 });
  }
}

type EnsureDealerAssociationInput = {
  supabaseAdmin: SupabaseClient<any, any, any>;
  userId: string;
  companyName: string;
  legalCompanyName: string;
  vatNumber: string;
  taxCode: string;
  contactPerson: string;
  email: string;
  phone: string;
};

async function ensureDealerAssociation({
  supabaseAdmin,
  userId,
  companyName,
  legalCompanyName,
  vatNumber,
  taxCode,
  contactPerson,
  email,
  phone,
}: EnsureDealerAssociationInput) {
  // 1) Prova associazione nativa dealers.user_id (se presente nello schema).
  const byUserId = await findDealerIdByUserId(supabaseAdmin, userId);
  if (byUserId) {
    await upsertProfile(supabaseAdmin, {
      userId,
      dealerId: byUserId,
      contactPerson,
      email,
      phone,
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
      companyName,
      legalCompanyName,
      vatNumber,
      taxCode,
      email,
      phone,
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
        name: companyName,
        legal_name: legalCompanyName,
        vat_number: vatNumber,
        fiscal_code: taxCode,
        email,
        phone,
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
    companyName,
    legalCompanyName,
    vatNumber,
    taxCode,
    email,
    phone,
    userId,
  });

  await upsertProfile(supabaseAdmin, {
    userId,
    dealerId,
    contactPerson,
    email,
    phone,
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
    companyName: string;
    legalCompanyName: string;
    vatNumber: string;
    taxCode: string;
    email: string;
    phone: string;
    userId: string;
  }
) {
  const { companyName, legalCompanyName, vatNumber, taxCode, email, phone, userId } = values;

  const { error: updateError } = await supabaseAdmin
    .from("dealers")
    .update({
      name: companyName,
      legal_name: legalCompanyName,
      vat_number: vatNumber,
      fiscal_code: taxCode,
      email,
      phone,
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
    contactPerson: string;
    email: string;
    phone: string;
  }
) {
  const { userId, dealerId, contactPerson, email, phone } = input;

  const { error } = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        id: userId,
        dealer_id: dealerId,
        contact_name: contactPerson,
        email,
        phone,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  if (error) {
    throw new Error(error.message || "Errore upsert profilo utente.");
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

function isMissingColumnError(message: string | undefined, columnName: string) {
  const text = String(message ?? "").toLowerCase();
  return text.includes(columnName.toLowerCase()) && (text.includes("column") || text.includes("schema cache"));
}
