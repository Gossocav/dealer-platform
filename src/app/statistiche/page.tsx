"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { resolveDealerIdForCurrentUser } from "@/lib/active-tenant";
import { supabase } from "@/lib/supabaseClient";
import { formatRegistrationLabel } from "@/lib/vehicles";

type Vehicle = {
  id: string;
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  registration_date?: string | null;
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

  // I totali si contano nel database, non contando le righe scaricate.
  //
  // Prima la pagina scaricava *tutte* le righe di quattro tabelle e ne
  // misurava la lunghezza. Ma il database ne restituisce al massimo mille per
  // richiesta: superata quella soglia i numeri smettevano di crescere, senza
  // nessun errore e senza nessun avviso. Una concessionaria con 1.400 lead ne
  // avrebbe letti 1.000 per sempre.
  //
  // I veicoli restano scaricati per intero, e va bene: il piano piu' alto ne
  // consente 300, quindi il tetto non li tocca -- e servono comunque interi
  // per il prezzo medio.
  const [totals, setTotals] = useState({ leads: 0, customers: 0, appointments: 0 });

  useEffect(() => {
    let attivo = true;

    const fetchAll = async () => {
      setLoading(true);
      setStatusMessage(null);

      const adesso = new Date().toISOString();

      // Ogni interrogazione dice di quale concessionaria sono i dati che
      // chiede. La protezione del database lo garantisce comunque, ma una
      // pagina che chiede "i lead" invece dei "miei lead" e' scritta male: se
      // un domani quella protezione venisse allentata, sarebbe questa riga a
      // fare la differenza.
      const dealerId = await resolveDealerIdForCurrentUser(supabase);

      if (!attivo) return;

      if (!dealerId) {
        setLoading(false);
        setStatusMessage("Concessionaria non associata all'utente.");
        return;
      }

      const [vehiclesRes, leadsCount, customersCount, appointmentsCount, latestLeadsRes, latestCustomersRes, upcomingRes] =
        await Promise.all([
          supabase
            .from("vehicles")
            .select("id, brand, model, version, registration_date, year, price, status, published, created_at")
            .eq("dealer_id", dealerId)
            .order("created_at", { ascending: false }),
          supabase.from("leads").select("id", { count: "exact", head: true }).eq("dealer_id", dealerId),
          supabase.from("customers").select("id", { count: "exact", head: true }).eq("dealer_id", dealerId),
          supabase.from("appointments").select("id", { count: "exact", head: true }).eq("dealer_id", dealerId),
          // Gli ultimi cinque li sceglie il database: ordinare a mano un
          // elenco gia' troncato dava "gli ultimi cinque fra i primi mille",
          // che non sono gli ultimi cinque.
          supabase
            .from("leads")
            .select("id, vehicle_id, first_name, last_name, email, phone, message, status, created_at")
            .eq("dealer_id", dealerId)
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("customers")
            .select("id, first_name, last_name, company, email, phone, created_at")
            .eq("dealer_id", dealerId)
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("appointments")
            .select("id, title, description, start_at, end_at, status, created_at")
            .eq("dealer_id", dealerId)
            .gte("start_at", adesso)
            .order("start_at", { ascending: true })
            .limit(5),
        ]);

      if (!attivo) return;

      setLoading(false);

      const primoErrore =
        vehiclesRes.error ??
        leadsCount.error ??
        customersCount.error ??
        appointmentsCount.error ??
        latestLeadsRes.error ??
        latestCustomersRes.error ??
        upcomingRes.error;

      if (primoErrore) {
        setStatusMessage(primoErrore.message || "Errore nel recupero dei dati.");
        setStatusMessageType("error");
        return;
      }

      setVehicles((vehiclesRes.data ?? []) as Vehicle[]);
      setLeads((latestLeadsRes.data ?? []) as Lead[]);
      setCustomers((latestCustomersRes.data ?? []) as Customer[]);
      setAppointments((upcomingRes.data ?? []) as Appointment[]);
      setTotals({
        leads: leadsCount.count ?? 0,
        customers: customersCount.count ?? 0,
        appointments: appointmentsCount.count ?? 0,
      });
    };

    void fetchAll();

    return () => {
      attivo = false;
    };
  }, []);

  const totalVehicles = vehicles.length;
  const publishedVehicles = vehicles.filter((vehicle) => vehicle.published).length;
  const draftVehicles = vehicles.filter((vehicle) => !vehicle.published).length;
  const totalLeads = totals.leads;
  const totalCustomers = totals.customers;
  const totalAppointments = totals.appointments;
  const totalValue = vehicles.reduce((sum, vehicle) => sum + parsePrice(vehicle.price), 0);
  const averagePrice = totalVehicles > 0 ? Math.round(totalValue / totalVehicles) : 0;

  // I veicoli arrivano gia' ordinati dal database. Qui prima c'era .sort(),
  // che riordina l'elenco *sul posto*: modificava lo stato di React invece di
  // ricavarne una copia.
  const latestVehicles = useMemo(() => vehicles.slice(0, 5), [vehicles]);

  // Lead e clienti arrivano gia' come "ultimi cinque", scelti dal database.
  const latestLeads = leads;

  const latestCustomers = customers;

  // Gia' filtrati e ordinati dal database: solo quelli non ancora passati, dal
  // piu' vicino. Prima si scaricava tutta l'agenda per tenerne cinque.
  const upcomingAppointments = appointments;

  const maxGraphValue = Math.max(publishedVehicles, draftVehicles, totalLeads, totalCustomers, totalAppointments, 1);

  return (
    <DealerDashboardShell title="Statistiche">
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
            {/* Era un bottone senza niente collegato: si poteva premere e non
                succedeva nulla. Ora porta dove gli appuntamenti si creano
                davvero. */}
            <Link
              href="/agenda"
              className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
            >
              Nuovo appuntamento
            </Link>
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
                      <p className="text-sm text-slate-600">Immatricolazione: {formatRegistrationLabel({ registration_date: vehicle.registration_date, year: vehicle.year }) ?? "-"} • Prezzo: €{parsePrice(vehicle.price).toLocaleString("it-IT")}</p>
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
