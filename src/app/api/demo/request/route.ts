import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendAdminNotificationEmail } from "@/lib/admin-notification-email";
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
  vehicleCount?: string;
  brands?: string;
  managementSoftware?: string;
  notes?: string;
  privacyAccepted?: boolean;
  websiteTrap?: string;
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

export async function POST(request: Request) {
  let createdRequestId: string | null = null;
  let uploadedObjectPath: string | null = null;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
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
    const vehicleCount = normalizeInteger(body.vehicleCount);
    const brands = normalizeText(body.brands);
    const managementSoftware = normalizeText(body.managementSoftware);
    const notes = normalizeText(body.notes);
    const privacyAccepted = body.privacyAccepted === true;
    const contactName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const cityLabel = [city, provinceCode].filter(Boolean).join(" (").replace(/\($/, "") + (provinceCode ? ")" : "");

    if (!companyName || !contactName || !email || !phone || !city || !provinceCode || !vehicleCount || !brands || !managementSoftware || !notes) {
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
      return NextResponse.json({ error: "Infrastruttura Demo non allineata. Contatta il supporto." }, { status: 500 });
    }

    const bucketList = await supabaseAdmin.storage.listBuckets();
    if (bucketList.error) {
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
      return NextResponse.json({ error: "Errore interno durante l'invio della richiesta demo." }, { status: 500 });
    }

    if ((duplicateCount ?? 0) > 0) {
      return NextResponse.json({ error: "Hai gia inviato una richiesta nelle ultime 24 ore." }, { status: 409 });
    }

    const createdRequest = await supabaseAdmin
      .from("demo_requests")
      .insert({
        dealership_name: companyName,
        company_name: companyName,
        vat_number: vatNumber,
        contact_name: contactName,
        email,
        phone,
        city: cityLabel,
        vehicle_count: vehicleCount,
        message: message || null,
        status: "pending",
      })
      .select("id")
      .single<{ id: string }>();

    if (createdRequest.error || !createdRequest.data?.id) {
      return NextResponse.json({ error: "Salvataggio richiesta demo non riuscito." }, { status: 500 });
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
      await supabaseAdmin.from("demo_requests").delete().eq("id", createdRequestId);
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
      await supabaseAdmin.storage.from(DEMO_DOCUMENT_BUCKET).remove([storagePath]);
      await supabaseAdmin.from("demo_requests").delete().eq("id", createdRequestId);
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
            <tr><td style="padding:6px 0;font-weight:600;">Telefono</td><td style="padding:6px 0;">${escapeHtml(phone)}</td></tr>
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

    return NextResponse.json({ message: "Richiesta Demo inviata" }, { status: 200 });
  } catch (error) {
    console.error("Demo request API unexpected error", error);

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
        await supabaseAdmin.storage.from(DEMO_DOCUMENT_BUCKET).remove([uploadedObjectPath]);
      }

      if (createdRequestId) {
        await supabaseAdmin.from("demo_requests").delete().eq("id", createdRequestId);
      }
    }

    return NextResponse.json({ error: "Errore interno durante l'invio della richiesta demo." }, { status: 500 });
  }
}
