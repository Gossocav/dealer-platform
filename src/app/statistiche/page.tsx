"use client";

import { useEffect, useMemo, useState } from "react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { supabase } from "@/lib/supabaseClient";

type Vehicle = {
  id: string;
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  year?: string | null;
  price?: string | null;
  status?: string | null;
  published?: boolean | null;
  created_at?: string | null;
};

type Lead = {
  id: string;
  vehicle_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type Customer = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  created_at?: string | null;
};

type Appointment = {
  id: string;
  title?: string | null;
  description?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  status?: string | null;
  created_at?: string | null;
};

const formatDate = (timestamp: string | null | undefined) => {
  if (!timestamp) return "-";
  try {
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return timestamp;
  }
};

const parsePrice = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const digits = value.replace(/[€\s.,]/g, "").replace(/[^0-9]/g, "");
  return digits ? Number(digits) : 0;
};

export default function StatistichePage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusMessageType, setStatusMessageType] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setStatusMessage(null);
      const [vehiclesRes, leadsRes, customersRes, appointmentsRes] = await Promise.all([
        supabase
          .from("vehicles")
          .select("id, brand, model, version, year, price, status, published, created_at"),
        supabase
          .from("leads")
          .select("id, vehicle_id, first_name, last_name, email, phone, message, status, created_at"),
        supabase
          .from("customers")
          .select("id, first_name, last_name, company, email, phone, created_at"),
        supabase
          .from("appointments")
          .select("id, title, description, start_at, end_at, status, created_at"),
      ]);

      setLoading(false);

      if (vehiclesRes.error || leadsRes.error || customersRes.error || appointmentsRes.error) {
        const errorMessage = vehiclesRes.error?.message || leadsRes.error?.message || customersRes.error?.message || appointmentsRes.error?.message;
        setStatusMessage(errorMessage || "Errore nel recupero dei dati.");
        setStatusMessageType("error");
        return;
      }

      setVehicles((vehiclesRes.data ?? []) as Vehicle[]);
      setLeads((leadsRes.data ?? []) as Lead[]);
      setCustomers((customersRes.data ?? []) as Customer[]);
      setAppointments((appointmentsRes.data ?? []) as Appointment[]);
    };

    fetchAll();
  }, []);

  const totalVehicles = vehicles.length;
  const publishedVehicles = vehicles.filter((vehicle) => vehicle.published).length;
  const draftVehicles = vehicles.filter((vehicle) => !vehicle.published).length;
  const totalLeads = leads.length;
  const totalCustomers = customers.length;
  const totalAppointments = appointments.length;
  const totalValue = vehicles.reduce((sum, vehicle) => sum + parsePrice(vehicle.price), 0);
  const averagePrice = totalVehicles > 0 ? Math.round(totalValue / totalVehicles) : 0;

  const latestVehicles = useMemo(
    () => vehicles.sort((a, b) => (b.created_at ? new Date(b.created_at).getTime() : 0) - (a.created_at ? new Date(a.created_at).getTime() : 0)).slice(0, 5),
    [vehicles]
  );

  const latestLeads = useMemo(
    () => leads.sort((a, b) => (b.created_at ? new Date(b.created_at).getTime() : 0) - (a.created_at ? new Date(a.created_at).getTime() : 0)).slice(0, 5),
    [leads]
  );

  const latestCustomers = useMemo(
    () => customers.sort((a, b) => (b.created_at ? new Date(b.created_at).getTime() : 0) - (a.created_at ? new Date(a.created_at).getTime() : 0)).slice(0, 5),
    [customers]
  );

  const upcomingAppointments = useMemo(() => {
    return appointments
      .filter((item) => {
        if (!item.start_at) return false;
        const date = new Date(item.start_at);
        return !Number.isNaN(date.getTime()) && date >= new Date();
      })
      .sort((a, b) => {
        const dateA = a.start_at ? new Date(a.start_at).getTime() : 0;
        const dateB = b.start_at ? new Date(b.start_at).getTime() : 0;
        return dateA - dateB;
      })
      .slice(0, 5);
  }, [appointments]);

  const maxGraphValue = Math.max(publishedVehicles, draftVehicles, totalLeads, totalCustomers, totalAppointments, 1);

  return (
    <DealerDashboardShell title="Statistiche" dealerName="Dealer Console" avatarInitials="DC" unreadNotifications={3}>
      <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-10">
        <div className="mx-auto w-full max-w-7xl">
        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/40 sm:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-blue-600">Statistiche</p>
              <h1 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Statistiche</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                Monitora i KPI principali del tuo gestionale con i dati aggiornati in tempo reale.
              </p>
            </div>
            <button className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200">
              Nuovo appuntamento
            </button>
          </div>

          {statusMessage ? (
            <div className={`mt-6 rounded-3xl border px-5 py-4 text-sm ${statusMessageType === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
              {statusMessage}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-700">
              Caricamento statistiche in corso...
            </div>
          ) : null}

          <div className="mt-10 grid gap-6 xl:grid-cols-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Totale veicoli</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900">{totalVehicles}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Veicoli pubblicati</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900">{publishedVehicles}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Bozze</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900">{draftVehicles}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Totale lead</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900">{totalLeads}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Totale clienti</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900">{totalCustomers}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Totale appuntamenti</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900">{totalAppointments}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Valore totale parco auto</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900">€{totalValue.toLocaleString("it-IT")}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Prezzo medio veicoli</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900">€{averagePrice.toLocaleString("it-IT")}</p>
            </div>
          </div>

          <section className="mt-10 rounded-[28px] border border-slate-200 bg-slate-50 p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">Panoramica grafica</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Confronto rapido tra le metriche principali.</p>
              </div>
            </div>

            <div className="mt-8 space-y-6">
              <div>
                <div className="mb-3 flex items-center justify-between gap-4">
                  <p className="text-sm font-medium text-slate-700">Veicoli pubblicati</p>
                  <p className="text-sm font-semibold text-slate-900">{publishedVehicles}</p>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                  <div className={`h-full rounded-full bg-blue-600`} style={{ width: `${(publishedVehicles / maxGraphValue) * 100}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-3 flex items-center justify-between gap-4">
                  <p className="text-sm font-medium text-slate-700">Bozze</p>
                  <p className="text-sm font-semibold text-slate-900">{draftVehicles}</p>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                  <div className={`h-full rounded-full bg-emerald-600`} style={{ width: `${(draftVehicles / maxGraphValue) * 100}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-3 flex items-center justify-between gap-4">
                  <p className="text-sm font-medium text-slate-700">Lead</p>
                  <p className="text-sm font-semibold text-slate-900">{totalLeads}</p>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                  <div className={`h-full rounded-full bg-indigo-600`} style={{ width: `${(totalLeads / maxGraphValue) * 100}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-3 flex items-center justify-between gap-4">
                  <p className="text-sm font-medium text-slate-700">Clienti</p>
                  <p className="text-sm font-semibold text-slate-900">{totalCustomers}</p>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                  <div className={`h-full rounded-full bg-fuchsia-600`} style={{ width: `${(totalCustomers / maxGraphValue) * 100}%` }} />
                </div>
              </div>
            </div>
          </section>

          <div className="mt-10 grid gap-6 xl:grid-cols-2">
            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900">Ultimi 5 veicoli inseriti</h3>
              <div className="mt-6 space-y-4">
                {latestVehicles.length === 0 ? (
                  <p className="text-sm text-slate-500">Nessun veicolo disponibile.</p>
                ) : (
                  latestVehicles.map((vehicle) => (
                    <div key={vehicle.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <p className="font-semibold text-slate-900">{vehicle.brand ?? "-"} {vehicle.model ?? ""} {vehicle.version ?? ""}</p>
                      <p className="text-sm text-slate-600">Anno: {vehicle.year ?? "-"} • Prezzo: €{parsePrice(vehicle.price).toLocaleString("it-IT")}</p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900">Ultimi 5 lead</h3>
              <div className="mt-6 space-y-4">
                {latestLeads.length === 0 ? (
                  <p className="text-sm text-slate-500">Nessun lead disponibile.</p>
                ) : (
                  latestLeads.map((lead) => (
                    <div key={lead.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <p className="font-semibold text-slate-900">{`${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || "-"}</p>
                      <p className="text-sm text-slate-600">{lead.email ?? "-"} • {lead.phone ?? "-"}</p>
                      <p className="mt-1 text-xs text-slate-500">Veicolo: {lead.vehicle_id ?? "-"}</p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900">Ultimi 5 clienti</h3>
              <div className="mt-6 space-y-4">
                {latestCustomers.length === 0 ? (
                  <p className="text-sm text-slate-500">Nessun cliente disponibile.</p>
                ) : (
                  latestCustomers.map((customer) => (
                    <div key={customer.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <p className="font-semibold text-slate-900">
                        {customer.company?.trim() || `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim() || "-"}
                      </p>
                      <p className="text-sm text-slate-600">{customer.email ?? "-"} • {customer.phone ?? "-"}</p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900">Prossimi appuntamenti</h3>
              <div className="mt-6 space-y-4">
                {upcomingAppointments.length === 0 ? (
                  <p className="text-sm text-slate-500">Nessun appuntamento in calendario.</p>
                ) : (
                  upcomingAppointments.map((appointment) => (
                    <div key={appointment.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <p className="font-semibold text-slate-900">{appointment.title ?? "-"}</p>
                      <p className="text-sm text-slate-600">{appointment.description ?? "-"} • {formatDate(appointment.start_at)}</p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
        </div>
      </div>
    </DealerDashboardShell>
  );
}
