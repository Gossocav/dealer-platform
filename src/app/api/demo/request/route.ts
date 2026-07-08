import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendAdminNotificationEmail } from "@/lib/admin-notification-email";

type DemoRequestBody = {
  dealerName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  city?: string;
  vehicleCount?: string;
  message?: string;
};

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

function normalizeInteger(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return null;

  return parsed;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function POST(request: Request) {
  try {
    let body: DemoRequestBody;
    try {
      body = (await request.json()) as DemoRequestBody;
    } catch {
      return NextResponse.json({ error: "Payload non valido." }, { status: 400 });
    }

    const dealerName = normalizeText(body.dealerName);
    const contactName = normalizeText(body.contactName);
    const email = normalizeEmail(body.email);
    const phone = normalizeText(body.phone);
    const city = normalizeText(body.city);
    const vehicleCount = normalizeInteger(body.vehicleCount);
    const message = normalizeText(body.message);

    if (!dealerName || !contactName || !email || !phone || !city || !vehicleCount) {
      return NextResponse.json({ error: "Compila tutti i campi obbligatori." }, { status: 400 });
    }

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

    const demoInsert = await supabaseAdmin
      .from("demo_requests")
      .insert({
        dealership_name: dealerName,
        contact_name: contactName,
        email,
        phone,
        city,
        vehicle_count: vehicleCount,
        message,
        status: "pending",
      });

    if (demoInsert.error) {
      return NextResponse.json({ error: demoInsert.error.message || "Salvataggio richiesta demo non riuscito." }, { status: 500 });
    }

    const notificationResult = await sendAdminNotificationEmail({
      subject: "Nuova richiesta demo",
      html: `
        <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
          <h2 style="margin:0 0 12px;">Richiesta demo ricevuta</h2>
          <p style="margin:0 0 12px;">Un dealer ha richiesto una demo della piattaforma.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:6px 0;font-weight:600;">Concessionaria</td><td style="padding:6px 0;">${escapeHtml(dealerName)}</td></tr>
            <tr><td style="padding:6px 0;font-weight:600;">Referente</td><td style="padding:6px 0;">${escapeHtml(contactName)}</td></tr>
            <tr><td style="padding:6px 0;font-weight:600;">Email</td><td style="padding:6px 0;">${escapeHtml(email)}</td></tr>
            <tr><td style="padding:6px 0;font-weight:600;">Telefono</td><td style="padding:6px 0;">${escapeHtml(phone)}</td></tr>
            <tr><td style="padding:6px 0;font-weight:600;">Citta</td><td style="padding:6px 0;">${escapeHtml(city)}</td></tr>
            <tr><td style="padding:6px 0;font-weight:600;">Numero veicoli indicativo</td><td style="padding:6px 0;">${escapeHtml(String(vehicleCount))}</td></tr>
            <tr><td style="padding:6px 0;font-weight:600;">Messaggio</td><td style="padding:6px 0;">${escapeHtml(message ?? "-")}</td></tr>
          </table>
        </div>
      `.trim(),
    });

    if (!notificationResult.ok) {
      console.error("Demo request admin notification provider error", notificationResult);
    }

    return NextResponse.json({ message: "Richiesta demo inviata. Ti ricontatteremo al più presto." }, { status: 200 });
  } catch (error) {
    console.error("Demo request API unexpected error", error);
    return NextResponse.json({ error: "Errore interno durante l'invio della richiesta demo." }, { status: 500 });
  }
}
