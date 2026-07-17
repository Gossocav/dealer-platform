import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { appointmentStatusLabel, normalizeAppointmentStatus } from "@/lib/appointments";
import { extractPublicNotes, normalizePortalEmail, verifyClientPortalToken } from "@/lib/client-portal";
import { leadStageLabels, normalizeLeadStage } from "@/lib/leads";

type LeadPortalRow = {
  id: string;
  dealer_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  status: string | null;
  internal_notes: string | null;
  created_at: string | null;
  vehicle: {
    id: string | null;
    brand: string | null;
    model: string | null;
    version: string | null;
    year: string | number | null;
  } | Array<{
    id: string | null;
    brand: string | null;
    model: string | null;
    version: string | null;
    year: string | number | null;
  }> | null;
};

type AppointmentPortalRow = {
  id: string;
  title: string | null;
  start_at: string | null;
  status: string | null;
  notes: string | null;
  description: string | null;
};

function normalizeText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeVehicleLabel(vehicle: LeadPortalRow["vehicle"]) {
  const normalized = Array.isArray(vehicle) ? vehicle[0] ?? null : vehicle;
  if (!normalized) return "Veicolo non collegato";
  const label = [normalized.brand, normalized.model, normalized.version, normalized.year]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .join(" ");

  return label || "Veicolo non collegato";
}

function normalizeName(firstName: string | null, lastName: string | null, email: string | null) {
  const fullName = `${String(firstName ?? "").trim()} ${String(lastName ?? "").trim()}`.trim();
  if (fullName) return fullName;
  const safeEmail = String(email ?? "").trim();
  if (safeEmail) return safeEmail;
  return "Cliente";
}

function formatDateTime(value: string | null) {
  if (!value) return "-";

  try {
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export async function GET(request: Request, context: { params: Promise<{ leadId: string }> }) {
  try {
    const params = await context.params;
    const leadId = normalizeText(params.leadId);

    if (!leadId) {
      return NextResponse.json({ error: "leadId non valido." }, { status: 400 });
    }

    const url = new URL(request.url);
    const email = normalizePortalEmail(url.searchParams.get("email"));
    const token = normalizeText(url.searchParams.get("t"));

    if (!email || !token) {
      return NextResponse.json({ error: "Link non valido o incompleto." }, { status: 400 });
    }

    const secret = normalizeText(process.env.CLIENT_PORTAL_SIGNING_SECRET)
      ?? normalizeText(process.env.SUPABASE_SERVICE_ROLE_KEY)
      ?? normalizeText(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

    if (!secret) {
      return NextResponse.json({ error: "Configurazione portale non disponibile." }, { status: 500 });
    }

    const isValid = verifyClientPortalToken({
      leadId,
      email,
      token,
      secret,
    });

    if (!isValid) {
      return NextResponse.json({ error: "Token portale non valido." }, { status: 403 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, dealer_id, first_name, last_name, email, phone, message, status, internal_notes, created_at, vehicle:vehicles(id, brand, model, version, year)")
      .eq("id", leadId)
      .ilike("email", email)
      .maybeSingle<LeadPortalRow>();

    if (leadError) {
      return NextResponse.json({ error: leadError.message || "Errore caricamento dati lead." }, { status: 500 });
    }

    if (!lead?.id) {
      return NextResponse.json({ error: "Lead non trovato." }, { status: 404 });
    }

    const dealerId = normalizeText(lead.dealer_id);
    if (!dealerId) {
      return NextResponse.json({ error: "Lead senza dealer valido." }, { status: 403 });
    }

    const { data: appointments, error: appointmentsError } = await supabase
      .from("appointments")
      .select("id, title, start_at, status, notes, description")
      .eq("dealer_id", dealerId)
      .eq("lead_id", lead.id)
      .order("start_at", { ascending: true })
      .returns<AppointmentPortalRow[]>();

    if (appointmentsError) {
      return NextResponse.json({ error: appointmentsError.message || "Errore caricamento appuntamenti." }, { status: 500 });
    }

    const leadPublicNotes = extractPublicNotes(lead.internal_notes).map((text, index) => ({
      id: `lead-note-${index}`,
      source: "lead",
      text,
      createdAt: lead.created_at,
    }));

    const appointmentPublicNotes = (appointments ?? []).flatMap((appointment) => {
      const fromNotes = extractPublicNotes(appointment.notes).map((text, index) => ({
        id: `${appointment.id}-n-${index}`,
        source: "appointment",
        text,
        createdAt: appointment.start_at,
      }));
      const fromDescription = extractPublicNotes(appointment.description).map((text, index) => ({
        id: `${appointment.id}-d-${index}`,
        source: "appointment",
        text,
        createdAt: appointment.start_at,
      }));

      return [...fromNotes, ...fromDescription];
    });

    const stage = normalizeLeadStage(lead.status);

    return NextResponse.json(
      {
        customer: {
          fullName: normalizeName(lead.first_name, lead.last_name, lead.email),
          email: lead.email,
          phone: lead.phone,
        },
        lead: {
          id: lead.id,
          status: stage,
          statusLabel: leadStageLabels[stage],
          message: lead.message,
          createdAt: lead.created_at,
        },
        vehicle: {
          label: normalizeVehicleLabel(lead.vehicle),
        },
        appointments: (appointments ?? []).map((appointment) => {
          const normalizedStatus = normalizeAppointmentStatus(appointment.status);
          return {
            id: appointment.id,
            title: String(appointment.title ?? "Appuntamento"),
            when: formatDateTime(appointment.start_at),
            status: normalizedStatus,
            statusLabel: appointmentStatusLabel(normalizedStatus),
          };
        }),
        publicNotes: [...leadPublicNotes, ...appointmentPublicNotes]
          .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))),
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "Errore caricamento portale cliente." }, { status: 500 });
  }
}
