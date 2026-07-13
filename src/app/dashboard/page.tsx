"use client";

import { CalendarCheck2, CalendarClock, Car, CircleX, PhoneCall, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { PanelCard } from "@/components/ui/panel-card";
import { getActiveDealerId } from "@/lib/active-tenant";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { formatLeadDate, leadStageLabels, normalizeLeadStage, type LeadRecord } from "@/lib/leads";
import { supabase } from "@/lib/supabaseClient";

type DashboardMetrics = {
  leadTotali: number;
  leadNuovi: number;
  leadContattati: number;
  appuntamentiProgrammati: number;
  appuntamentiCompletati: number;
  veicoliPubblicati: number;
  veicoliNonPubblicabili: number;
};

type LeadListItem = {
  id: string;
  customer: string;
  vehicle: string;
  status: string;
  createdAt: string;
};

type AppointmentListItem = {
  id: string;
  title: string;
  when: string;
  status: string;
  leadLabel: string;
  vehicleLabel: string;
};

type LeadListRow = Pick<LeadRecord, "id" | "first_name" | "last_name" | "email" | "status" | "created_at"> & {
  vehicle: {
    brand: string | null;
    model: string | null;
    version: string | null;
    year: string | number | null;
  } | Array<{
    brand: string | null;
    model: string | null;
    version: string | null;
    year: string | number | null;
  }> | null;
};

type AppointmentListRow = {
  id: string;
  title: string | null;
  start_at: string | null;
  appointment_date: string | null;
  status: string | null;
  lead: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | Array<{
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  }> | null;
  vehicle: {
    brand: string | null;
    model: string | null;
    version: string | null;
    year: string | number | null;
  } | Array<{
    brand: string | null;
    model: string | null;
    version: string | null;
    year: string | number | null;
  }> | null;
};

const DEFAULT_METRICS: DashboardMetrics = {
  leadTotali: 0,
  leadNuovi: 0,
  leadContattati: 0,
  appuntamentiProgrammati: 0,
  appuntamentiCompletati: 0,
  veicoliPubblicati: 0,
  veicoliNonPubblicabili: 0,
};

function safeName(firstName: string | null, lastName: string | null, email: string | null) {
  const fullName = `${String(firstName ?? "").trim()} ${String(lastName ?? "").trim()}`.trim();
  if (fullName) return fullName;
  const safeEmail = String(email ?? "").trim();
  if (safeEmail) return safeEmail;
  return "Lead senza nome";
}

function safeVehicleLabel(vehicle: LeadListRow["vehicle"] | AppointmentListRow["vehicle"]) {
  const normalized = Array.isArray(vehicle) ? vehicle[0] ?? null : vehicle;
  if (!normalized) return "Veicolo non collegato";
  const label = [normalized.brand, normalized.model, normalized.version, normalized.year]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .join(" ");
  return label || "Veicolo non collegato";
}

function safeAppointmentStatus(value: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "completato" || normalized === "completed") return "Completato";
  if (normalized === "programmato" || normalized === "scheduled" || normalized === "confirmed") return "Programmato";
  if (normalized === "annullato" || normalized === "cancelled") return "Annullato";
  return "Programmato";
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

function formatLeadDateSafe(value: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "-";

  try {
    return formatLeadDate(normalized);
  } catch {
    return normalized;
  }
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics>(DEFAULT_METRICS);
  const [latestLeads, setLatestLeads] = useState<LeadListItem[]>([]);
  const [nextAppointments, setNextAppointments] = useState<AppointmentListItem[]>([]);

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw new Error(authError.message || "Impossibile leggere utente autenticato.");

        const userId = authData.user?.id;
        if (!userId) {
          setError("Sessione non valida. Effettua di nuovo il login.");
          setMetrics(DEFAULT_METRICS);
          setLatestLeads([]);
          setNextAppointments([]);
          return;
        }

        const dealerId = await resolveDealerIdFromTenantSources(supabase, userId, {
          activeDealerId: getActiveDealerId(),
        });

        if (!dealerId) {
          setError("Concessionaria non associata all'utente.");
          setMetrics(DEFAULT_METRICS);
          setLatestLeads([]);
          setNextAppointments([]);
          return;
        }

        const nowIso = new Date().toISOString();

        const [
          leadsTotalCount,
          leadsNewCount,
          leadsContactedCount,
          appointmentsProgramCount,
          appointmentsCompletedCount,
          vehiclesPublishedCount,
          vehiclesNonPublishableCount,
          latestLeadsResult,
          nextAppointmentsResult,
        ] = await Promise.all([
          supabase.from("leads").select("id", { count: "exact", head: true }).eq("dealer_id", dealerId),
          supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("dealer_id", dealerId)
            .in("status", ["nuovo", "created"]),
          supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("dealer_id", dealerId)
            .in("status", ["contattato", "contacted"]),
          supabase
            .from("appointments")
            .select("id", { count: "exact", head: true })
            .eq("dealer_id", dealerId)
            .in("status", ["programmato", "scheduled", "confirmed"]),
          supabase
            .from("appointments")
            .select("id", { count: "exact", head: true })
            .eq("dealer_id", dealerId)
            .in("status", ["completato", "completed"]),
          supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("dealer_id", dealerId).eq("published", true),
          supabase
            .from("vehicles")
            .select("id", { count: "exact", head: true })
            .eq("dealer_id", dealerId)
            .in("status", ["sold", "delivered", "archived", "venduto", "consegnato", "archiviato"]),
          supabase
            .from("leads")
            .select("id, first_name, last_name, email, status, created_at, vehicle:vehicles(brand, model, version, year)")
            .eq("dealer_id", dealerId)
            .order("created_at", { ascending: false })
            .limit(8)
            .returns<LeadListRow[]>(),
          supabase
            .from("appointments")
            .select("id, title, start_at, appointment_date, status, lead:leads(first_name, last_name, email), vehicle:vehicles(brand, model, version, year)")
            .eq("dealer_id", dealerId)
            .gte("start_at", nowIso)
            .order("start_at", { ascending: true })
            .limit(8)
            .returns<AppointmentListRow[]>(),
        ]);

        if (leadsTotalCount.error) throw new Error(leadsTotalCount.error.message || "Errore conteggio lead.");
        if (leadsNewCount.error) throw new Error(leadsNewCount.error.message || "Errore conteggio lead nuovi.");
        if (leadsContactedCount.error) throw new Error(leadsContactedCount.error.message || "Errore conteggio lead contattati.");
        if (appointmentsProgramCount.error) {
          throw new Error(appointmentsProgramCount.error.message || "Errore conteggio appuntamenti programmati.");
        }
        if (appointmentsCompletedCount.error) {
          throw new Error(appointmentsCompletedCount.error.message || "Errore conteggio appuntamenti completati.");
        }
        if (vehiclesPublishedCount.error) throw new Error(vehiclesPublishedCount.error.message || "Errore conteggio veicoli pubblicati.");
        if (vehiclesNonPublishableCount.error) {
          throw new Error(vehiclesNonPublishableCount.error.message || "Errore conteggio veicoli non pubblicabili.");
        }
        if (latestLeadsResult.error) throw new Error(latestLeadsResult.error.message || "Errore lettura ultimi lead.");
        if (nextAppointmentsResult.error) throw new Error(nextAppointmentsResult.error.message || "Errore lettura prossimi appuntamenti.");

        const mappedLeads: LeadListItem[] = (latestLeadsResult.data ?? []).map((lead) => ({
          id: lead.id,
          customer: safeName(lead.first_name, lead.last_name, lead.email),
          vehicle: safeVehicleLabel(lead.vehicle),
          status: normalizeLeadStage(lead.status),
          createdAt: String(lead.created_at ?? ""),
        }));

        const mappedAppointments: AppointmentListItem[] = (nextAppointmentsResult.data ?? []).map((appointment) => {
          const normalizedLead = Array.isArray(appointment.lead) ? appointment.lead[0] ?? null : appointment.lead;

          return {
            id: appointment.id,
            title: String(appointment.title ?? "Appuntamento"),
            when: appointment.start_at ?? appointment.appointment_date ?? "",
            status: safeAppointmentStatus(appointment.status),
            leadLabel: safeName(normalizedLead?.first_name ?? null, normalizedLead?.last_name ?? null, normalizedLead?.email ?? null),
            vehicleLabel: safeVehicleLabel(appointment.vehicle),
          };
        });

        setMetrics({
          leadTotali: leadsTotalCount.count ?? 0,
          leadNuovi: leadsNewCount.count ?? 0,
          leadContattati: leadsContactedCount.count ?? 0,
          appuntamentiProgrammati: appointmentsProgramCount.count ?? 0,
          appuntamentiCompletati: appointmentsCompletedCount.count ?? 0,
          veicoliPubblicati: vehiclesPublishedCount.count ?? 0,
          veicoliNonPubblicabili: vehiclesNonPublishableCount.count ?? 0,
        });
        setLatestLeads(mappedLeads);
        setNextAppointments(mappedAppointments);
      } catch (loadError) {
        setMetrics(DEFAULT_METRICS);
        setLatestLeads([]);
        setNextAppointments([]);
        const message = loadError instanceof Error ? loadError.message : "Errore caricamento dashboard commerciale.";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    const timerId = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  const metricCards = useMemo(
    () => [
      {
        id: "lead-totali",
        label: "Lead totali",
        value: String(metrics.leadTotali),
        delta: "Panoramica commerciale",
        tone: "neutral" as const,
        icon: Users,
      },
      {
        id: "lead-nuovi",
        label: "Lead nuovi",
        value: String(metrics.leadNuovi),
        delta: "Stato Nuovo",
        tone: "neutral" as const,
        icon: UserPlus,
      },
      {
        id: "lead-contattati",
        label: "Lead contattati",
        value: String(metrics.leadContattati),
        delta: "Stato Contattato",
        tone: "positive" as const,
        icon: PhoneCall,
      },
      {
        id: "appt-programmati",
        label: "Appuntamenti programmati",
        value: String(metrics.appuntamentiProgrammati),
        delta: "Agenda operativa",
        tone: "neutral" as const,
        icon: CalendarClock,
      },
      {
        id: "appt-completati",
        label: "Appuntamenti completati",
        value: String(metrics.appuntamentiCompletati),
        delta: "Eseguiti",
        tone: "positive" as const,
        icon: CalendarCheck2,
      },
      {
        id: "veicoli-pubblicati",
        label: "Veicoli pubblicati",
        value: String(metrics.veicoliPubblicati),
        delta: "Visibili online",
        tone: "positive" as const,
        icon: Car,
      },
      {
        id: "veicoli-non-pubblicabili",
        label: "Veicoli non pubblicabili",
        value: String(metrics.veicoliNonPubblicabili),
        delta: "Stato terminale",
        tone: "neutral" as const,
        icon: CircleX,
      },
    ],
    [metrics]
  );

  return (
    <DealerDashboardShell
      title="Dashboard Concessionario"
      dealerName="Dealer Console"
      avatarInitials="DC"
      unreadNotifications={0}
    >
      {error ? <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</section> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((metric) => (
          <MetricCard
            key={metric.id}
            label={metric.label}
            value={metric.value}
            delta={metric.delta}
            tone={metric.tone}
            icon={metric.icon}
          />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <PanelCard title="Ultimi lead ricevuti" subtitle={loading ? "Caricamento in corso" : "Ultimi 8 lead"}>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-slate-500">Cliente</th>
                  <th className="px-3 py-2 text-slate-500">Veicolo</th>
                  <th className="px-3 py-2 text-slate-500">Stato</th>
                  <th className="px-3 py-2 text-slate-500">Data</th>
                </tr>
              </thead>
              <tbody>
                {latestLeads.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-slate-500">
                      {loading ? "Caricamento lead..." : "Nessun lead disponibile."}
                    </td>
                  </tr>
                ) : (
                  latestLeads.map((lead) => (
                    <tr key={lead.id} className="rounded-2xl bg-slate-50 text-slate-700">
                      <td className="rounded-l-2xl px-3 py-3 font-semibold text-slate-900">{lead.customer}</td>
                      <td className="px-3 py-3">{lead.vehicle}</td>
                      <td className="px-3 py-3">{leadStageLabels[lead.status as keyof typeof leadStageLabels] ?? "Nuovo"}</td>
                      <td className="rounded-r-2xl px-3 py-3">{formatLeadDateSafe(lead.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </PanelCard>

        <PanelCard title="Prossimi appuntamenti" subtitle={loading ? "Caricamento in corso" : "Agenda imminente"}>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-slate-500">Titolo</th>
                  <th className="px-3 py-2 text-slate-500">Lead</th>
                  <th className="px-3 py-2 text-slate-500">Veicolo</th>
                  <th className="px-3 py-2 text-slate-500">Stato</th>
                  <th className="px-3 py-2 text-slate-500">Quando</th>
                </tr>
              </thead>
              <tbody>
                {nextAppointments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-slate-500">
                      {loading ? "Caricamento appuntamenti..." : "Nessun appuntamento imminente."}
                    </td>
                  </tr>
                ) : (
                  nextAppointments.map((appointment) => (
                    <tr key={appointment.id} className="rounded-2xl bg-slate-50 text-slate-700">
                      <td className="rounded-l-2xl px-3 py-3 font-semibold text-slate-900">{appointment.title}</td>
                      <td className="px-3 py-3">{appointment.leadLabel}</td>
                      <td className="px-3 py-3">{appointment.vehicleLabel}</td>
                      <td className="px-3 py-3">{appointment.status}</td>
                      <td className="rounded-r-2xl px-3 py-3">{formatDateTime(appointment.when)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </PanelCard>
      </section>
    </DealerDashboardShell>
  );
}
