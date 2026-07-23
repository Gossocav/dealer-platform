import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendAdminNotificationEmail, sendDemoLifecycleEmail } from "@/lib/admin-notification-email";
import { hitRateLimit } from "@/lib/api-rate-limit";

type DemoRequestBody = {
  companyName?: string;
  vatNumber?: string;
  province?: string;
  city?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobilePhone?: string;
  vehicleCount?: string;
  brands?: string;
  managementSoftware?: string;
  notes?: string;
  privacyAccepted?: boolean;
  websiteTrap?: string;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type DemoRequestsColumnRow = {
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
};

type DemoRequestsColumnMeta = {
  dataType: string;
  isNullable: boolean;
  hasDefault: boolean;
};

const DEMO_REQUEST_RATE_LIMIT = {
  windowMs: 15 * 60_000,
  maxRequests: 6,
};

const DUPLICATE_WINDOW_HOURS = 24;
const DEMO_DOCUMENT_BUCKET = "demo-documents";
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function normalizeEmail(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    return null;
  }

  return text;
}

function normalizeInteger(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return null;

  return parsed;
}

function normalizeVatNumber(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, "").trim();
  return text.length > 0 ? text : null;
}

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120) || "document";
}

function inferMimeTypeFromName(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  return null;
}

function resolveDocumentMime(file: File) {
  const fromType = String(file.type ?? "").trim().toLowerCase();
  if (fromType && ALLOWED_MIME_TYPES.has(fromType)) {
    return fromType;
  }

  const fromName = inferMimeTypeFromName(file.name);
  if (fromName && ALLOWED_MIME_TYPES.has(fromName)) {
    return fromName;
  }

  return null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  const cfConnectingIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  return null;
}

function buildMessageDetails(details: Array<[string, string | null]>) {
  const rows = details.filter(([, value]) => value && value.trim().length > 0);
  if (rows.length === 0) {
    return null;
  }

  return rows.map(([label, value]) => `${label}: ${String(value)}`).join("\n");
}

function logSupabaseFailure(requestId: string, phase: string, error: SupabaseErrorLike | null | undefined, extra?: Record<string, unknown>) {
  if (!error) {
    return;
  }

  console.error("demo-request:supabase-failure", {
    requestId,
    phase,
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
    ...(extra ?? {}),
  });
}

function normalizeColumnMap(rows: DemoRequestsColumnRow[] | null | undefined) {
  const map = new Map<string, DemoRequestsColumnMeta>();

  for (const row of rows ?? []) {
    const name = String(row.column_name ?? "").trim();
    if (!name) {
      continue;
    }

    map.set(name, {
      dataType: String(row.data_type ?? "").trim().toLowerCase(),
      isNullable: row.is_nullable !== "NO",
      hasDefault: row.column_default !== null,
    });
  }

  return map;
}

async function resolveDemoRequestsColumns(
  supabaseAdmin: SupabaseClient,
  requestId: string
) {
  const columnsResult = await supabaseAdmin
    .from("information_schema.columns")
    .select("column_name,data_type,is_nullable,column_default")
    .eq("table_schema", "public")
    .eq("table_name", "demo_requests")
    .returns<DemoRequestsColumnRow[]>();

  if (columnsResult.error) {
    logSupabaseFailure(requestId, "schema.columns", columnsResult.error, {
      table: "public.demo_requests",
    });
    return null;
  }

  return normalizeColumnMap(columnsResult.data ?? []);
}

function buildDemoRequestInsertPayload(params: {
  columns: Map<string, DemoRequestsColumnMeta> | null;
  companyName: string;
  contactName: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string;
  mobilePhone: string;
  city: string;
  provinceCode: string;
  vatNumber: string;
  vehicleCount: number;
  brands: string;
  managementSoftware: string;
  notes: string;
  privacyAccepted: boolean;
  message: string | null;
}) {
  const {
    columns,
    companyName,
    contactName,
    firstName,
    lastName,
    email,
    phone,
    mobilePhone,
    city,
    provinceCode,
    vatNumber,
    vehicleCount,
    brands,
    managementSoftware,
    notes,
    privacyAccepted,
    message,
  } = params;

  const fallbackColumns = new Set([
    "dealership_name",
    "company_name",
    "contact_name",
    "email",
    "phone",
    "mobile_phone",
    "city",
    "vehicle_count",
    "message",
    "status",
    "vat_number",
    "chamber_document_path",
    "chamber_document_name",
    "chamber_document_mime_type",
    "chamber_document_size",
    "created_at",
    "updated_at",
  ]);

  const hasColumn = (name: string) => (columns ? columns.has(name) : fallbackColumns.has(name));
  const getColumn = (name: string) => (columns ? columns.get(name) : null);

  const payload: Record<string, unknown> = {
    status: "pending",
  };

  if (hasColumn("dealership_name")) payload.dealership_name = companyName;
  if (hasColumn("company_name")) payload.company_name = companyName;
  if (hasColumn("contact_name")) payload.contact_name = contactName;
  if (hasColumn("first_name") && firstName) payload.first_name = firstName;
  if (hasColumn("last_name") && lastName) payload.last_name = lastName;
  if (hasColumn("email")) payload.email = email;
  if (hasColumn("phone")) payload.phone = phone;
  if (hasColumn("mobile_phone")) payload.mobile_phone = mobilePhone;

  if (hasColumn("city")) {
    payload.city = city;
  }

  if (hasColumn("province")) {
    payload.province = provinceCode;
  }

  if (hasColumn("vat_number")) {
    payload.vat_number = vatNumber;
  }

  if (hasColumn("vehicle_count")) {
    const vehicleCountType = getColumn("vehicle_count")?.dataType ?? "";
    const shouldSendNumeric =
      vehicleCountType.includes("int") ||
      vehicleCountType.includes("numeric") ||
      vehicleCountType.includes("double") ||
      vehicleCountType.includes("real");

    payload.vehicle_count = shouldSendNumeric ? vehicleCount : String(vehicleCount);
  }

  if (hasColumn("brands")) {
    payload.brands = brands;
  }

  if (hasColumn("management_software")) {
    payload.management_software = managementSoftware;
  }

  if (hasColumn("notes")) {
    payload.notes = notes;
  }

  if (hasColumn("privacy_accepted")) {
    payload.privacy_accepted = privacyAccepted;
  }

  if (hasColumn("message")) {
    payload.message = message || null;
  }

  return payload;
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let createdRequestId: string | null = null;
  let uploadedObjectPath: string | null = null;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("demo-request:missing-env", {
        requestId,
        phase: "env.validation",
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasServiceRoleKey: Boolean(supabaseServiceRoleKey),
      });

      return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const contentType = String(request.headers.get("content-type") ?? "").toLowerCase();

    let body: DemoRequestBody = {};
    let chamberDocument: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const documentEntry = formData.get("chamberDocument");

      body = {
        companyName: String(formData.get("companyName") ?? ""),
        vatNumber: String(formData.get("vatNumber") ?? ""),
        province: String(formData.get("province") ?? ""),
        city: String(formData.get("city") ?? ""),
        firstName: String(formData.get("firstName") ?? ""),
        lastName: String(formData.get("lastName") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        mobilePhone: String(formData.get("mobilePhone") ?? ""),
        vehicleCount: String(formData.get("vehicleCount") ?? ""),
        brands: String(formData.get("brands") ?? ""),
        managementSoftware: String(formData.get("managementSoftware") ?? ""),
        notes: String(formData.get("notes") ?? ""),
        privacyAccepted: String(formData.get("privacyAccepted") ?? "").toLowerCase() === "true",
        websiteTrap: String(formData.get("websiteTrap") ?? ""),
      };

      chamberDocument = documentEntry instanceof File ? documentEntry : null;
    } else {
      try {
        body = (await request.json()) as DemoRequestBody;
      } catch {
        return NextResponse.json({ error: "Payload non valido." }, { status: 400 });
      }
    }

    const honeypot = normalizeText(body.websiteTrap);
    if (honeypot) {
      return NextResponse.json({ message: "Richiesta demo inviata. Ti ricontatteremo al piu presto." }, { status: 200 });
    }

    const clientIp = getClientIp(request) ?? "unknown";
    const rateLimit = hitRateLimit(`demo-request:${clientIp}`, DEMO_REQUEST_RATE_LIMIT);
    if (rateLimit.limited) {
      return NextResponse.json({ error: "Troppi tentativi. Riprova tra poco." }, { status: 429 });
    }

    const companyName = normalizeText(body.companyName);
    const vatNumber = normalizeVatNumber(body.vatNumber);
    const provinceCode = normalizeText(body.province);
    const city = normalizeText(body.city);
    const firstName = normalizeText(body.firstName);
    const lastName = normalizeText(body.lastName);
    const email = normalizeEmail(body.email);
    const phone = normalizeText(body.phone);
    const mobilePhone = normalizeText(body.mobilePhone);
    const vehicleCount = normalizeInteger(body.vehicleCount);
    const brands = normalizeText(body.brands);
    const managementSoftware = normalizeText(body.managementSoftware);
    const notes = normalizeText(body.notes);
    const privacyAccepted = body.privacyAccepted === true;
    const contactName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const cityLabel = [city, provinceCode].filter(Boolean).join(" (").replace(/\($/, "") + (provinceCode ? ")" : "");

    if (!companyName || !contactName || !email || !phone || !mobilePhone || !city || !provinceCode || !vehicleCount || !brands || !managementSoftware || !notes) {
      return NextResponse.json({ error: "Compila tutti i campi obbligatori." }, { status: 400 });
    }

    if (!vatNumber || !/^\d{11}$/.test(vatNumber)) {
      return NextResponse.json({ error: "Partita IVA non valida." }, { status: 400 });
    }

    if (!privacyAccepted) {
      return NextResponse.json({ error: "Devi accettare l'informativa privacy." }, { status: 400 });
    }

    if (!chamberDocument) {
      return NextResponse.json({ error: "Carica la visura camerale." }, { status: 400 });
    }

    const documentMimeType = resolveDocumentMime(chamberDocument);
    if (!documentMimeType) {
      return NextResponse.json({ error: "Formato file non valido. Sono ammessi PDF, JPG, JPEG, PNG." }, { status: 400 });
    }

    if (chamberDocument.size <= 0 || chamberDocument.size > MAX_DOCUMENT_BYTES) {
      return NextResponse.json({ error: "Dimensione file non valida. Massimo 5 MB." }, { status: 400 });
    }

    const schemaCheck = await supabaseAdmin
      .from("demo_requests")
      .select("id, vat_number, chamber_document_path, chamber_document_name, chamber_document_mime_type, chamber_document_size")
      .limit(1);

    if (schemaCheck.error) {
      logSupabaseFailure(requestId, "schema.compatibility_check", schemaCheck.error, {
        table: "public.demo_requests",
      });
      return NextResponse.json({ error: "Infrastruttura Demo non allineata. Contatta il supporto." }, { status: 500 });
    }

    const demoRequestsColumns = await resolveDemoRequestsColumns(supabaseAdmin, requestId);

    const bucketList = await supabaseAdmin.storage.listBuckets();
    if (bucketList.error) {
      logSupabaseFailure(requestId, "storage.list_buckets", bucketList.error as SupabaseErrorLike, {
        bucket: DEMO_DOCUMENT_BUCKET,
      });
      return NextResponse.json({ error: "Impossibile verificare il bucket documenti." }, { status: 500 });
    }

    const demoBucket = (bucketList.data ?? []).find((bucket) => bucket.name === DEMO_DOCUMENT_BUCKET);
    if (!demoBucket) {
      return NextResponse.json({ error: "Bucket documenti non configurato." }, { status: 500 });
    }

    if (demoBucket.public) {
      return NextResponse.json({ error: "Bucket documenti non sicuro: deve essere privato." }, { status: 500 });
    }

    const message = buildMessageDetails([
      ["Marchi trattati", brands],
      ["Gestionale utilizzato", managementSoftware],
      ["Note", notes],
    ]);

    const duplicateThreshold = new Date(Date.now() - DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const { count: duplicateCount, error: duplicateCheckError } = await supabaseAdmin
      .from("demo_requests")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", duplicateThreshold);

    if (duplicateCheckError) {
      logSupabaseFailure(requestId, "demo_requests.duplicate_check", duplicateCheckError, {
        table: "public.demo_requests",
      });
      return NextResponse.json({ error: "Errore interno durante l'invio della richiesta demo." }, { status: 500 });
    }

    if ((duplicateCount ?? 0) > 0) {
      return NextResponse.json({ error: "Hai gia inviato una richiesta nelle ultime 24 ore." }, { status: 409 });
    }

    const createdRequestPayload = buildDemoRequestInsertPayload({
      columns: demoRequestsColumns,
      companyName,
      contactName,
      firstName,
      lastName,
      email,
      phone,
      mobilePhone,
      city,
      provinceCode,
      vatNumber,
      vehicleCount,
      brands,
      managementSoftware,
      notes,
      privacyAccepted,
      message,
    });

    let payloadForInsert: Record<string, unknown> = { ...createdRequestPayload };
    let createdRequest:
      | {
          data: { id: string } | null;
          error: SupabaseErrorLike | null;
        }
      | null = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const attemptResult = await supabaseAdmin
        .from("demo_requests")
        .insert(payloadForInsert)
        .select("id")
        .single<{ id: string }>();

      createdRequest = {
        data: attemptResult.data,
        error: attemptResult.error,
      };

      if (!attemptResult.error && attemptResult.data?.id) {
        break;
      }

      logSupabaseFailure(requestId, "demo_requests.insert", attemptResult.error, {
        table: "public.demo_requests",
        attempt,
        payloadColumns: Object.keys(payloadForInsert).sort(),
      });

      const messageText = String(attemptResult.error?.message ?? "");
      const missingColumnMatch = attemptResult.error?.code === "PGRST204"
        ? messageText.match(/Could not find the '([^']+)' column/)
        : null;

      const missingColumn = missingColumnMatch?.[1];
      if (!missingColumn || !(missingColumn in payloadForInsert)) {
        break;
      }

      const nextPayload = { ...payloadForInsert };
      delete nextPayload[missingColumn];
      payloadForInsert = nextPayload;

      console.warn("demo-request:insert-retry-without-column", {
        requestId,
        phase: "demo_requests.insert",
        attempt,
        removedColumn: missingColumn,
      });
    }

    if (!createdRequest?.data?.id) {
      return NextResponse.json({ error: "Impossibile registrare la richiesta demo. Riprova tra pochi minuti." }, { status: 500 });
    }

    createdRequestId = createdRequest.data.id;

    const safeFileName = sanitizeFileName(chamberDocument.name);
    const randomToken = crypto.randomUUID();
    const storagePath = `${createdRequestId}/${randomToken}-${safeFileName}`;
    const documentBytes = Buffer.from(await chamberDocument.arrayBuffer());

    const uploaded = await supabaseAdmin.storage.from(DEMO_DOCUMENT_BUCKET).upload(storagePath, documentBytes, {
      contentType: documentMimeType,
      upsert: false,
    });

    if (uploaded.error) {
      logSupabaseFailure(requestId, "storage.upload", uploaded.error as SupabaseErrorLike, {
        bucket: DEMO_DOCUMENT_BUCKET,
      });

      const cleanupRequest = await supabaseAdmin.from("demo_requests").delete().eq("id", createdRequestId);
      if (cleanupRequest.error) {
        logSupabaseFailure(requestId, "cleanup.delete_request_after_upload_failure", cleanupRequest.error, {
          table: "public.demo_requests",
          createdRequestId,
        });
      }

      return NextResponse.json({ error: "Upload visura non riuscito. Riprova tra pochi minuti." }, { status: 500 });
    }

    uploadedObjectPath = storagePath;

    const requestUpdate = await supabaseAdmin
      .from("demo_requests")
      .update({
        chamber_document_path: storagePath,
        chamber_document_name: safeFileName,
        chamber_document_mime_type: documentMimeType,
        chamber_document_size: chamberDocument.size,
        updated_at: new Date().toISOString(),
      })
      .eq("id", createdRequestId);

    if (requestUpdate.error) {
      logSupabaseFailure(requestId, "demo_requests.update_document_metadata", requestUpdate.error, {
        table: "public.demo_requests",
        createdRequestId,
      });

      const cleanupStorage = await supabaseAdmin.storage.from(DEMO_DOCUMENT_BUCKET).remove([storagePath]);
      if (cleanupStorage.error) {
        logSupabaseFailure(requestId, "cleanup.remove_file_after_metadata_failure", cleanupStorage.error as SupabaseErrorLike, {
          bucket: DEMO_DOCUMENT_BUCKET,
          objectPath: storagePath,
        });
      }

      const cleanupRequest = await supabaseAdmin.from("demo_requests").delete().eq("id", createdRequestId);
      if (cleanupRequest.error) {
        logSupabaseFailure(requestId, "cleanup.delete_request_after_metadata_failure", cleanupRequest.error, {
          table: "public.demo_requests",
          createdRequestId,
        });
      }

      return NextResponse.json({ error: "Errore durante il collegamento del documento alla richiesta." }, { status: 500 });
    }

    const notificationResult = await sendAdminNotificationEmail({
      subject: "Nuova richiesta demo",
      html: `
        <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
          <h2 style="margin:0 0 12px;">Richiesta demo ricevuta</h2>
          <p style="margin:0 0 12px;">Un dealer ha richiesto una demo della piattaforma.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:6px 0;font-weight:600;">Concessionaria</td><td style="padding:6px 0;">${escapeHtml(companyName)}</td></tr>
            <tr><td style="padding:6px 0;font-weight:600;">Referente</td><td style="padding:6px 0;">${escapeHtml(contactName)}</td></tr>
            <tr><td style="padding:6px 0;font-weight:600;">Email</td><td style="padding:6px 0;">${escapeHtml(email)}</td></tr>
            <tr><td style="padding:6px 0;font-weight:600;">Telefono fisso</td><td style="padding:6px 0;">${escapeHtml(phone)}</td></tr>
            <tr><td style="padding:6px 0;font-weight:600;">Cellulare</td><td style="padding:6px 0;">${escapeHtml(mobilePhone)}</td></tr>
            <tr><td style="padding:6px 0;font-weight:600;">Partita IVA</td><td style="padding:6px 0;">${escapeHtml(vatNumber)}</td></tr>
            <tr><td style="padding:6px 0;font-weight:600;">Citta</td><td style="padding:6px 0;">${escapeHtml(cityLabel)}</td></tr>
            <tr><td style="padding:6px 0;font-weight:600;">Numero veicoli indicativo</td><td style="padding:6px 0;">${escapeHtml(String(vehicleCount))}</td></tr>
            <tr><td style="padding:6px 0;font-weight:600;">Visura</td><td style="padding:6px 0;">${escapeHtml(safeFileName)} (${escapeHtml(String(chamberDocument.size))} bytes)</td></tr>
            <tr><td style="padding:6px 0;font-weight:600;">Messaggio</td><td style="padding:6px 0;">${escapeHtml(message ?? "-")}</td></tr>
          </table>
        </div>
      `.trim(),
    });

    if (!notificationResult.ok) {
      console.error("Demo request admin notification provider error", notificationResult);
    }

    const dealerConfirmationResult = await sendDemoLifecycleEmail({
      toEmail: email,
      kind: "received",
      dealerName: companyName,
    });

    if (!dealerConfirmationResult.ok) {
      console.error("Demo request dealer confirmation provider error", dealerConfirmationResult);
    }

    return NextResponse.json({ message: "Richiesta Demo inviata" }, { status: 200 });
  } catch (error) {
    console.error("demo-request:unexpected-error", {
      requestId,
      phase: "handler.unhandled_exception",
      error,
    });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseServiceRoleKey && (createdRequestId || uploadedObjectPath)) {
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      if (uploadedObjectPath) {
        const cleanupStorage = await supabaseAdmin.storage.from(DEMO_DOCUMENT_BUCKET).remove([uploadedObjectPath]);
        if (cleanupStorage.error) {
          logSupabaseFailure(requestId, "cleanup.remove_file_after_exception", cleanupStorage.error as SupabaseErrorLike, {
            bucket: DEMO_DOCUMENT_BUCKET,
            objectPath: uploadedObjectPath,
          });
        }
      }

      if (createdRequestId) {
        const cleanupRequest = await supabaseAdmin.from("demo_requests").delete().eq("id", createdRequestId);
        if (cleanupRequest.error) {
          logSupabaseFailure(requestId, "cleanup.delete_request_after_exception", cleanupRequest.error, {
            table: "public.demo_requests",
            createdRequestId,
          });
        }
      }
    }

    return NextResponse.json({ error: "Errore interno durante l'invio della richiesta demo." }, { status: 500 });
  }
}
