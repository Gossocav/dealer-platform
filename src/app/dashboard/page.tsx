"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Vehicle = {
  id: string;
  brand: string | null;
  model: string | null;
  price: string | null;
  status: string | null;
  published: boolean | null;
  created_at: string | null;
};

type Lead = {
  id: string;
  vehicle_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  created_at: string | null;
  vehicle?: Array<{
    id: string;
    brand: string | null;
    model: string | null;
    version: string | null;
  }> | null;
};

type Appointment = {
  id: string;
  title: string | null;
  description: string | null;
  start_at: string | null;
  end_at: string | null;
  status: string | null;
  customer?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  } | null;
};

type Profile = {
  dealer_id: string | null;
};

const DAY_COUNT = 30;

export default function DashboardPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Caricamento dashboard...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      setLoading(true);
      setErrorMessage(null);
      setLoadingMessage("Caricamento dashboard...");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (userError) {
        setLoading(false);
        setErrorMessage(userError.message || "Errore nel recupero dell'utente autenticato.");
        return;
      }

      if (!user) {
        setLoading(false);
        setErrorMessage("Utente non autenticato.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("dealer_id")
        .eq("id", user.id)
        .maybeSingle<Profile>();

      if (!isMounted) return;

      if (profileError) {
        setLoading(false);
        setErrorMessage(profileError.message || "Errore nel recupero del profilo dealer.");
        return;
      }

      const currentDealerId = profile?.dealer_id ?? null;
      if (!currentDealerId) {
        setLoading(false);
        setErrorMessage("dealer_id non trovato nel profilo utente.");
        return;
      }

      const [vehiclesRes, leadsRes, appointmentsRes] = await Promise.all([
        supabase
          .from("vehicles")
          .select("id, brand, model, price, status, published, created_at")
          .eq("dealer_id", currentDealerId)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("leads")
          .select("id, vehicle_id, first_name, last_name, status, created_at, vehicle:vehicles(id, brand, model, version)")
          .eq("dealer_id", currentDealerId)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("appointments")
          .select("id, title, description, start_at, end_at, status, customer:customers(id, first_name, last_name, company)")
          .eq("dealer_id", currentDealerId)
          .order("start_at", { ascending: true })
          .limit(500),
      ]);

      if (!isMounted) return;

      setLoading(false);

      if (vehiclesRes.error || leadsRes.error || appointmentsRes.error) {
        const nextError = vehiclesRes.error?.message || leadsRes.error?.message || appointmentsRes.error?.message || "Errore nel recupero dei dati.";
        setErrorMessage(nextError);
        return;
      }

      setVehicles((vehiclesRes.data ?? []) as Vehicle[]);
      setLeads((leadsRes.data ?? []) as unknown as Lead[]);
      setAppointments((appointmentsRes.data ?? []) as unknown as Appointment[]);
    };

    void loadDashboard();

    const vehiclesChannel = supabase
      .channel("dashboard-vehicles")
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicles" }, () => {
        void loadDashboard();
      })
      .subscribe();

    const leadsChannel = supabase
      .channel("dashboard-leads")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        void loadDashboard();
      })
      .subscribe();

    const appointmentsChannel = supabase
      .channel("dashboard-appointments")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
        void loadDashboard();
      })
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(vehiclesChannel);
      void supabase.removeChannel(leadsChannel);
      void supabase.removeChannel(appointmentsChannel);
    };
  }, []);

  const vehicleStats = useMemo(() => {
    const published = vehicles.filter((vehicle) => isPublished(vehicle)).length;
    const sold = vehicles.filter((vehicle) => normalizeStatus(vehicle.status) === "sold").length;
    const drafts = vehicles.filter((vehicle) => !isPublished(vehicle) && normalizeStatus(vehicle.status) !== "sold").length;
    return { total: vehicles.length, published, sold, drafts };
  }, [vehicles]);

  const leadStats = useMemo(() => {
    const created = leads.filter((lead) => normalizeStatus(lead.status) === "created" || !lead.status).length;
    const contacted = leads.filter((lead) => normalizeStatus(lead.status) === "contacted").length;
    const appointment = leads.filter((lead) => normalizeStatus(lead.status) === "appointment").length;
    const negotiation = leads.filter((lead) => normalizeStatus(lead.status) === "negotiation").length;
    const won = leads.filter((lead) => normalizeStatus(lead.status) === "won").length;
    return { created, contacted, appointment, negotiation, won };
  }, [leads]);

  const totalCustomers = leads.reduce((accumulator, lead) => {
    const contactKey = [lead.first_name, lead.last_name, lead.email, lead.phone].filter(Boolean).join("|");
    return contactKey ? accumulator.add(contactKey) : accumulator;
  }, new Set<string>()).size;

  const days = useMemo(() => buildLastDays(DAY_COUNT), []);
  const leadSeries = useMemo(() => buildDailyCount(leads, days), [leads, days]);
  const publishedVehicleSeries = useMemo(() => buildDailyPublishedVehicleCount(vehicles, days), [vehicles, days]);
  const conversionSeries = useMemo(() => buildConversionSeries(leads), [leads]);

  const latestLeads = useMemo(
    () => [...leads].sort((a, b) => dateValue(b.created_at) - dateValue(a.created_at)).slice(0, 5),
    [leads]
  );
  const latestVehicles = useMemo(
    () => [...vehicles].sort((a, b) => dateValue(b.created_at) - dateValue(a.created_at)).slice(0, 5),
    [vehicles]
  );

  const totalValue = vehicles.reduce((sum, vehicle) => sum + parsePrice(vehicle.price), 0);
  const todayAppointments = useMemo(() => {
    const today = dayKey(new Date());
    return appointments.filter((item) => dayKeyFromTimestamp(item.start_at) === today);
  }, [appointments]);

  const hasNoData = !loading && !errorMessage && vehicles.length === 0 && leads.length === 0 && appointments.length === 0;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/40 sm:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-blue-600">Dealer Hub</p>
              <h1 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Dashboard Manageriale</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                KPI, grafici e liste operative sono sempre filtrati sul dealer autenticato e aggiornati in tempo reale.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/veicoli/nuovo" className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700">
                Nuovo veicolo
              </Link>
              <Link href="/lead" className="inline-flex items-center justify-center rounded-3xl bg-slate-100 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-200">
                Gestisci lead
              </Link>
            </div>
          </div>
        </header>

        {loading ? (
          <Banner tone="info" text={loadingMessage} />
        ) : null}

        {errorMessage ? <Banner tone="error" text={errorMessage} /> : null}

        {hasNoData ? <Banner tone="empty" text="Nessun dato disponibile per questo dealer." /> : null}

        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-7">
          <StatCard label="Veicoli Totali" value={vehicleStats.total} helper="Archivio dealer" />
          <StatCard label="Veicoli Pubblicati" value={vehicleStats.published} helper="Online" />
          <StatCard label="Veicoli Venduti" value={vehicleStats.sold} helper="Stato sold" />
          <StatCard label="Lead Nuovi" value={leadStats.created} helper="Richieste nuove" />
          <StatCard label="Lead Contattati" value={leadStats.contacted} helper="Follow-up avviati" />
          <StatCard label="Appuntamenti" value={todayAppointments.length} helper="Oggi" />
          <StatCard label="Clienti" value={totalCustomers} helper="Clienti attivi" />
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <ChartCard title="Lead ricevuti negli ultimi 30 giorni" subtitle="Volume giornaliero delle richieste">
            <MiniBarChart labels={days} values={leadSeries} accentClassName="bg-indigo-600" emptyLabel="Nessun lead negli ultimi 30 giorni." />
          </ChartCard>

          <ChartCard title="Veicoli pubblicati negli ultimi 30 giorni" subtitle="Nuove pubblicazioni giornaliere">
            <MiniBarChart labels={days} values={publishedVehicleSeries} accentClassName="bg-blue-600" emptyLabel="Nessun veicolo pubblicato negli ultimi 30 giorni." />
          </ChartCard>

          <ChartCard title="Conversione Lead" subtitle="Funnel di avanzamento">
            <ConversionChart series={conversionSeries} />
          </ChartCard>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Panel title="Ultimi Lead" subtitle="Richieste più recenti sul dealer corrente">
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-3 text-left text-sm">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-slate-500">Nome</th>
                    <th className="px-4 py-3 text-slate-500">Veicolo</th>
                    <th className="px-4 py-3 text-slate-500">Stato</th>
                    <th className="px-4 py-3 text-slate-500">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <EmptyRow colSpan={4} text="Caricamento lead..." />
                  ) : latestLeads.length === 0 ? (
                    <EmptyRow colSpan={4} text="Nessun lead disponibile." />
                  ) : (
                    latestLeads.map((lead) => (
                      <tr key={lead.id} className="rounded-[28px] border border-slate-200 bg-slate-50">
                        <td className="px-4 py-4 font-semibold text-slate-900">{formatLeadName(lead.first_name, lead.last_name)}</td>
                        <td className="px-4 py-4 text-slate-700">{formatLeadVehicle(lead)}</td>
                        <td className="px-4 py-4 text-slate-700">{formatLeadStatus(lead.status)}</td>
                        <td className="px-4 py-4 text-slate-700">{formatShortDate(lead.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Ultimi Veicoli" subtitle="Annunci recenti del dealer corrente">
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-3 text-left text-sm">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-slate-500">Marca</th>
                    <th className="px-4 py-3 text-slate-500">Modello</th>
                    <th className="px-4 py-3 text-slate-500">Prezzo</th>
                    <th className="px-4 py-3 text-slate-500">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <EmptyRow colSpan={4} text="Caricamento veicoli..." />
                  ) : latestVehicles.length === 0 ? (
                    <EmptyRow colSpan={4} text="Nessun veicolo disponibile." />
                  ) : (
                    latestVehicles.map((vehicle) => (
                      <tr key={vehicle.id} className="rounded-[28px] border border-slate-200 bg-slate-50">
                        <td className="px-4 py-4 font-semibold text-slate-900">{vehicle.brand ?? "-"}</td>
                        <td className="px-4 py-4 text-slate-700">{vehicle.model ?? "-"}</td>
                        <td className="px-4 py-4 text-slate-700">{formatCurrency(vehicle.price)}</td>
                        <td className="px-4 py-4 text-slate-700">{formatVehicleStatus(vehicle)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>

        <section>
          <Panel title="Appuntamenti di oggi" subtitle="Agenda operativa della giornata corrente">
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-3 text-left text-sm">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-slate-500">Ora</th>
                    <th className="px-4 py-3 text-slate-500">Titolo</th>
                    <th className="px-4 py-3 text-slate-500">Cliente</th>
                    <th className="px-4 py-3 text-slate-500">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <EmptyRow colSpan={4} text="Caricamento appuntamenti..." />
                  ) : todayAppointments.length === 0 ? (
                    <EmptyRow colSpan={4} text="Nessun appuntamento per oggi." />
                  ) : (
                    todayAppointments.map((appointment) => (
                      <tr key={appointment.id} className="rounded-[28px] border border-slate-200 bg-slate-50">
                        <td className="px-4 py-4 text-slate-700">{formatHour(appointment.start_at)} - {formatHour(appointment.end_at)}</td>
                        <td className="px-4 py-4 font-semibold text-slate-900">{appointment.title ?? "-"}</td>
                        <td className="px-4 py-4 text-slate-700">{formatCustomerNameFromAppointment(appointment.customer)}</td>
                        <td className="px-4 py-4 text-slate-700">{formatAppointmentStatus(appointment.status)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_1fr_0.9fr]">
          <Panel title="Valore stock" subtitle="Stima basata sui prezzi presenti">
            <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm font-medium text-slate-500">Valore totale parco auto</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900">{formatCurrency(totalValue.toString())}</p>
              <p className="mt-2 text-sm text-slate-500">Dati filtrati per dealer autenticato.</p>
            </div>
          </Panel>

          <Panel title="Accessi rapidi" subtitle="Navigazione veloce">
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <QuickLink href="/veicoli" label="Elenco veicoli" />
              <QuickLink href="/veicoli/nuovo" label="Nuovo veicolo" />
              <QuickLink href="/lead" label="Gestione lead" />
              <QuickLink href="/statistiche" label="Statistiche" />
            </div>
          </Panel>

          <Panel title="Aggiornamento" subtitle="Stato sincronizzazione">
            <div className="mt-6 space-y-3 rounded-[28px] border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
              <p>{loading ? "Sincronizzazione in corso..." : "Dati aggiornati in tempo reale tramite Supabase."}</p>
              <p>Veicoli e lead sono ricaricati automaticamente a ogni modifica rilevante.</p>
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-4 text-3xl font-semibold text-slate-900">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{helper}</p>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function MiniBarChart({ labels, values, accentClassName, emptyLabel }: { labels: string[]; values: number[]; accentClassName: string; emptyLabel: string }) {
  const maxValue = Math.max(...values, 1);
  const isEmpty = values.every((value) => value === 0);

  if (isEmpty) {
    return <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-sm text-slate-500">{emptyLabel}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-10 gap-2">
        {values.map((value, index) => {
          const height = Math.max(8, Math.round((value / maxValue) * 100));
          return (
            <div key={labels[index]} className="flex flex-col items-center gap-2">
              <div className="flex h-40 w-full items-end rounded-2xl bg-slate-100 px-1">
                <div className={`w-full rounded-2xl ${accentClassName}`} style={{ height: `${height}%` }} />
              </div>
              <span className="text-[10px] text-slate-500">{labels[index]}</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <span>Ultimi 30 giorni</span>
        <span>Filtrato per dealer autenticato</span>
      </div>
    </div>
  );
}

function ConversionChart({ series }: { series: Array<{ label: string; value: number; className: string }> }) {
  const maxValue = Math.max(...series.map((item) => item.value), 1);

  if (series.every((item) => item.value === 0)) {
    return <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-sm text-slate-500">Nessun dato di conversione disponibile.</div>;
  }

  return (
    <div className="space-y-4">
      {series.map((item) => (
        <div key={item.label}>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">{item.label}</span>
            <span className="font-semibold text-slate-900">{item.value}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-200">
            <div className={`h-full rounded-full ${item.className}`} style={{ width: `${(item.value / maxValue) * 100}%` }} />
          </div>
        </div>
      ))}
      <div className="text-xs text-slate-500">Funnel lead su base dealer autenticato.</div>
    </div>
  );
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-slate-500">
        {text}
      </td>
    </tr>
  );
}

function Banner({ tone, text }: { tone: "info" | "error" | "empty"; text: string }) {
  const classes =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : tone === "empty"
        ? "border-slate-200 bg-slate-100 text-slate-700"
        : "border-blue-200 bg-blue-50 text-blue-800";

  return <div className={`rounded-3xl border px-5 py-4 text-sm ${classes}`}>{text}</div>;
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">
      {label}
    </Link>
  );
}

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function isPublished(vehicle: Vehicle) {
  return vehicle.published === true || normalizeStatus(vehicle.status) === "published";
}

function formatVehicleStatus(vehicle: Vehicle) {
  const normalized = normalizeStatus(vehicle.status);
  if (normalized === "sold") return "Venduto";
  if (isPublished(vehicle)) return "Pubblicato";
  return "Bozza";
}

function formatLeadStatus(status: string | null) {
  const normalized = normalizeStatus(status) || "created";
  return {
    created: "Nuovo",
    contacted: "Contattato",
    appointment: "Appuntamento",
    negotiation: "Trattativa",
    won: "Vinto",
    lost: "Perso",
  }[normalized] ?? normalized;
}

function formatLeadName(firstName: string | null, lastName: string | null) {
  return `${firstName ?? ""} ${lastName ?? ""}`.trim() || "-";
}

function formatLeadVehicle(lead: Lead) {
  const linkedVehicle = Array.isArray(lead.vehicle) ? lead.vehicle[0] : lead.vehicle ?? null;
  if (!linkedVehicle) {
    return lead.vehicle_id ?? "-";
  }
  return [linkedVehicle.brand, linkedVehicle.model, linkedVehicle.version].filter(Boolean).join(" ") || linkedVehicle.id;
}

function formatShortDate(value: string | null) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatHour(value: string | null) {
  if (!value) return "--:--";
  try {
    return new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "--:--";
  }
}

function formatCustomerNameFromAppointment(
  customer: { id: string; first_name: string | null; last_name: string | null; company: string | null } | null | undefined
) {
  if (!customer) return "-";
  if (customer.company?.trim()) return customer.company;
  const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
  return fullName || "-";
}

function formatAppointmentStatus(status: string | null) {
  const normalized = normalizeStatus(status) || "scheduled";
  return {
    scheduled: "Programmato",
    confirmed: "Confermato",
    completed: "Concluso",
    cancelled: "Annullato",
    programmato: "Programmato",
    confermato: "Confermato",
    concluso: "Concluso",
    annullato: "Annullato",
  }[normalized] ?? normalized;
}

function buildLastDays(count: number) {
  const days: string[] = [];
  const today = new Date();

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    days.push(dayKey(date));
  }

  return days;
}

function dayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function dayKeyFromTimestamp(timestamp: string | null) {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return dayKey(date);
}

function buildDailyCount(items: Lead[], days: string[]) {
  return days.map((day) => items.filter((item) => dayKeyFromTimestamp(item.created_at) === day).length);
}

function buildDailyPublishedVehicleCount(items: Vehicle[], days: string[]) {
  return days.map((day) =>
    items.filter((item) => dayKeyFromTimestamp(item.created_at) === day && isPublished(item)).length
  );
}

function buildConversionSeries(leads: Lead[]) {
  const created = leads.filter((lead) => normalizeStatus(lead.status) === "created" || !lead.status).length;
  const contacted = leads.filter((lead) => normalizeStatus(lead.status) === "contacted").length;
  const appointment = leads.filter((lead) => normalizeStatus(lead.status) === "appointment").length;
  const won = leads.filter((lead) => normalizeStatus(lead.status) === "won").length;

  return [
    { label: "Creati", value: created, className: "bg-blue-600" },
    { label: "Contattati", value: contacted, className: "bg-sky-600" },
    { label: "Appuntamenti", value: appointment, className: "bg-violet-600" },
    { label: "Vinti", value: won, className: "bg-emerald-600" },
  ];
}

function parsePrice(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const digits = value.replace(/[€\s,.]/g, "").replace(/[^0-9]/g, "");
  return digits ? Number(digits) : 0;
}

function formatCurrency(value: string | number | null | undefined) {
  const amount = parsePrice(value);
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount);
}

function dateValue(value: string | null) {
  if (!value) return 0;
  return new Date(value).getTime();
}
