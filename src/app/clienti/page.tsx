"use client";

import { useEffect, useMemo, useState } from "react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { supabase } from "@/lib/supabaseClient";
import { demoAccessMessageFromUnknown } from "@/lib/demo-access";

type Customer = {
  id: string;
  dealer_id: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  vat_number: string | null;
  tax_code: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  zip_code: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type Lead = {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  vehicle?: Array<{
    id: string;
    brand: string | null;
    model: string | null;
    version: string | null;
  }> | null;
};

type Vehicle = {
  id: string;
  customer_id: string | null;
  brand: string | null;
  model: string | null;
  version: string | null;
  year: string | null;
  price: string | null;
  status: string | null;
  published: boolean | null;
  created_at: string | null;
};

type Appointment = {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  title: string | null;
  description: string | null;
  start_at: string | null;
  end_at: string | null;
  status: string | null;
  created_at: string | null;
};

type CustomerDraft = {
  first_name: string;
  last_name: string;
  company: string;
  vat_number: string;
  tax_code: string;
  email: string;
  phone: string;
  mobile: string;
  address: string;
  city: string;
  province: string;
  zip_code: string;
  notes: string;
};

type ActivityEvent = {
  id: string;
  title: string;
  description: string;
  date: string | null;
  badgeClassName: string;
};

const FILTERS = [
  { key: "all", label: "Tutti" },
  { key: "private", label: "Privati" },
  { key: "company", label: "Aziende" },
  { key: "with_leads", label: "Con lead" },
  { key: "with_appointments", label: "Con appuntamenti" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const EMPTY_DRAFT: CustomerDraft = {
  first_name: "",
  last_name: "",
  company: "",
  vat_number: "",
  tax_code: "",
  email: "",
  phone: "",
  mobile: "",
  address: "",
  city: "",
  province: "",
  zip_code: "",
  notes: "",
};

export default function ClientiPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusMessageType, setStatusMessageType] = useState<"success" | "error" | null>(null);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [draft, setDraft] = useState<CustomerDraft>(EMPTY_DRAFT);

  const fetchAll = async () => {
    setLoading(true);
    setStatusMessage(null);

    const [customersRes, leadsRes, vehiclesRes, appointmentsRes] = await Promise.all([
      supabase
        .from("customers")
        .select("id, dealer_id, first_name, last_name, company, vat_number, tax_code, email, phone, mobile, address, city, province, zip_code, notes, created_at, updated_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("leads")
        .select("id, customer_id, vehicle_id, first_name, last_name, email, phone, status, created_at, updated_at, vehicle:vehicles(id, brand, model, version)")
        .order("created_at", { ascending: false }),
      supabase
        .from("vehicles")
        .select("id, customer_id, brand, model, version, year, price, status, published, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("appointments")
        .select("id, customer_id, vehicle_id, title, description, start_at, end_at, status, created_at")
        .order("start_at", { ascending: false }),
    ]);

    setLoading(false);

    if (customersRes.error || leadsRes.error || vehiclesRes.error || appointmentsRes.error) {
      const nextError =
        customersRes.error?.message ||
        leadsRes.error?.message ||
        vehiclesRes.error?.message ||
        appointmentsRes.error?.message ||
        "Errore nel recupero dati CRM clienti.";
      setStatusMessage(nextError);
      setStatusMessageType("error");
      return;
    }

    setCustomers((customersRes.data ?? []) as Customer[]);
    setLeads((leadsRes.data ?? []) as unknown as Lead[]);
    setVehicles((vehiclesRes.data ?? []) as Vehicle[]);
    setAppointments((appointmentsRes.data ?? []) as Appointment[]);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchAll();
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void fetchAll();
      }, 150);
    };

    const channel = supabase
      .channel("crm-customers-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicles" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, scheduleRefresh)
      .subscribe();

    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      void supabase.removeChannel(channel);
    };
  }, []);

  const leadsByCustomer = useMemo(() => groupBy(leads, (item) => item.customer_id), [leads]);
  const vehiclesByCustomer = useMemo(() => groupBy(vehicles, (item) => item.customer_id), [vehicles]);
  const appointmentsByCustomer = useMemo(() => groupBy(appointments, (item) => item.customer_id), [appointments]);

  const normalizedSearch = search.trim().toLowerCase();
  const searchTerms = normalizedSearch.split(/\s+/).filter(Boolean);

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const linkedLeads = leadsByCustomer[customer.id] ?? [];
      const linkedAppointments = appointmentsByCustomer[customer.id] ?? [];
      const isCompany = Boolean(customer.company?.trim());
      const isPrivate = !isCompany;

      if (filter === "private" && !isPrivate) return false;
      if (filter === "company" && !isCompany) return false;
      if (filter === "with_leads" && linkedLeads.length === 0) return false;
      if (filter === "with_appointments" && linkedAppointments.length === 0) return false;

      if (!normalizedSearch) return true;

      const searchable = [
        customer.first_name,
        customer.last_name,
        customer.company,
        customer.email,
        customer.phone,
        customer.mobile,
        customer.city,
        customer.province,
        customer.vat_number,
        customer.tax_code,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchTerms.every((term) => searchable.includes(term));
    });
  }, [appointmentsByCustomer, customers, filter, leadsByCustomer, normalizedSearch, searchTerms]);

  const metrics = useMemo(() => {
    return {
      total: customers.length,
      privati: customers.filter((c) => !c.company).length,
      aziende: customers.filter((c) => !!c.company).length,
      conLead: customers.filter((c) => (leadsByCustomer[c.id] ?? []).length > 0).length,
      conVeicoli: customers.filter((c) => (vehiclesByCustomer[c.id] ?? []).length > 0).length,
      conAppuntamenti: customers.filter((c) => (appointmentsByCustomer[c.id] ?? []).length > 0).length,
    };
  }, [appointmentsByCustomer, customers, leadsByCustomer, vehiclesByCustomer]);

  const selectedLeads = useMemo(() => {
    if (!selectedCustomer) return [] as Lead[];
    return leadsByCustomer[selectedCustomer.id] ?? [];
  }, [leadsByCustomer, selectedCustomer]);

  const selectedVehicles = useMemo(() => {
    if (!selectedCustomer) return [] as Vehicle[];
    return vehiclesByCustomer[selectedCustomer.id] ?? [];
  }, [selectedCustomer, vehiclesByCustomer]);

  const selectedAppointments = useMemo(() => {
    if (!selectedCustomer) return [] as Appointment[];
    return appointmentsByCustomer[selectedCustomer.id] ?? [];
  }, [appointmentsByCustomer, selectedCustomer]);

  const selectCustomer = (customer: Customer | null) => {
    setSelectedCustomer(customer);
    setDraft(customer ? toCustomerDraft(customer) : EMPTY_DRAFT);
  };

  const timeline = useMemo(() => {
    if (!selectedCustomer) return [] as ActivityEvent[];

    const events: ActivityEvent[] = [
      {
        id: `customer-created-${selectedCustomer.id}`,
        title: "Cliente creato",
        description: `${formatCustomerName(selectedCustomer)} inserito nel CRM`,
        date: selectedCustomer.created_at,
        badgeClassName: "bg-blue-100 text-blue-700",
      },
    ];

    if (selectedCustomer.updated_at && selectedCustomer.updated_at !== selectedCustomer.created_at) {
      events.push({
        id: `customer-updated-${selectedCustomer.id}`,
        title: "Anagrafica aggiornata",
        description: "Dati cliente modificati",
        date: selectedCustomer.updated_at,
        badgeClassName: "bg-slate-200 text-slate-700",
      });
    }

    selectedLeads.forEach((lead) => {
      events.push({
        id: `lead-${lead.id}`,
        title: "Lead collegato",
        description: `${formatLeadName(lead)} (${formatLeadStatus(lead.status)})`,
        date: lead.updated_at ?? lead.created_at,
        badgeClassName: "bg-indigo-100 text-indigo-700",
      });
    });

    selectedVehicles.forEach((vehicle) => {
      events.push({
        id: `vehicle-${vehicle.id}`,
        title: "Veicolo acquistato",
        description: `${formatVehicleLabel(vehicle)} - ${formatCurrency(vehicle.price)}`,
        date: vehicle.created_at,
        badgeClassName: "bg-emerald-100 text-emerald-700",
      });
    });

    selectedAppointments.forEach((appointment) => {
      events.push({
        id: `appointment-${appointment.id}`,
        title: "Appuntamento",
        description: `${appointment.title ?? "Attività"} (${appointment.status ?? "-"})`,
        date: appointment.start_at ?? appointment.created_at,
        badgeClassName: "bg-amber-100 text-amber-700",
      });
    });

    if (selectedCustomer.notes?.trim()) {
      events.push({
        id: `note-${selectedCustomer.id}`,
        title: "Note",
        description: selectedCustomer.notes,
        date: selectedCustomer.updated_at ?? selectedCustomer.created_at,
        badgeClassName: "bg-violet-100 text-violet-700",
      });
    }

    return events.sort((a, b) => dateValue(b.date) - dateValue(a.date));
  }, [selectedAppointments, selectedCustomer, selectedLeads, selectedVehicles]);

  const handleSave = async () => {
    if (!selectedCustomer) return;
    if (!draft.first_name.trim() && !draft.last_name.trim() && !draft.company.trim()) {
      setStatusMessage("Inserisci almeno nome/cognome o ragione sociale.");
      setStatusMessageType("error");
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    const payload = {
      first_name: nullable(draft.first_name),
      last_name: nullable(draft.last_name),
      company: nullable(draft.company),
      vat_number: nullable(draft.vat_number),
      tax_code: nullable(draft.tax_code),
      email: nullable(draft.email),
      phone: nullable(draft.phone),
      mobile: nullable(draft.mobile),
      address: nullable(draft.address),
      city: nullable(draft.city),
      province: nullable(draft.province),
      zip_code: nullable(draft.zip_code),
      notes: nullable(draft.notes),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("customers")
      .update(payload)
      .eq("id", selectedCustomer.id)
      .select("id, dealer_id, first_name, last_name, company, vat_number, tax_code, email, phone, mobile, address, city, province, zip_code, notes, created_at, updated_at")
      .maybeSingle();

    setSaving(false);

    if (error) {
      setStatusMessage(demoAccessMessageFromUnknown(error, error.message || "Errore durante il salvataggio cliente."));
      setStatusMessageType("error");
      return;
    }

    if (!data) {
      setStatusMessage("Nessun cliente aggiornato: ID non trovato o non autorizzato.");
      setStatusMessageType("error");
      return;
    }

    const updated = data as Customer;
    setCustomers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    selectCustomer(updated);
    setStatusMessage("Cliente aggiornato con successo.");
    setStatusMessageType("success");
  };

  const handleDelete = async (customerId: string) => {
    const confirmed = window.confirm("Sei sicuro di voler eliminare questo cliente?");
    if (!confirmed) return;

    setLoading(true);
    setStatusMessage(null);

    const { data, error } = await supabase.from("customers").delete().eq("id", customerId).select("id");

    setLoading(false);

    if (error) {
      setStatusMessage(error.message || "Errore durante l'eliminazione del cliente.");
      setStatusMessageType("error");
      return;
    }

    if (!data || data.length === 0) {
      setStatusMessage("Nessun cliente eliminato: ID non trovato o non autorizzato.");
      setStatusMessageType("error");
      return;
    }

    setCustomers((current) => current.filter((item) => item.id !== customerId));
    if (selectedCustomer?.id === customerId) {
      selectCustomer(null);
    }

    setStatusMessage("Cliente eliminato correttamente.");
    setStatusMessageType("success");
  };

  return (
    <DealerDashboardShell title="Clienti" dealerName="Dealer Console" avatarInitials="DC" unreadNotifications={3}>
      <div className="min-h-screen bg-slate-100 text-slate-900">
        <div className="px-4 py-6 lg:px-8">
        <div className="mb-6 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-blue-600">Clienti</p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900">Modulo CRM Clienti</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Elenco, ricerca, filtri, dettaglio, modifica, eliminazione e cronologia attività in stile coerente con Veicoli e Lead.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void fetchAll()}
              className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
            >
              Aggiorna elenco
            </button>
          </div>
        </div>

        {statusMessage ? (
          <div
            className={`mb-6 rounded-3xl border px-5 py-4 text-sm ${
              statusMessageType === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {statusMessage}
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 xl:grid-cols-6">
          <MetricCard label="Totale clienti" value={metrics.total} helper="Anagrafiche" />
          <MetricCard label="Privati" value={metrics.privati} helper="Persone" />
          <MetricCard label="Aziende" value={metrics.aziende} helper="Ragioni sociali" />
          <MetricCard label="Con lead" value={metrics.conLead} helper="Lead collegati" />
          <MetricCard label="Con veicoli" value={metrics.conVeicoli} helper="Acquisti" />
          <MetricCard label="Con appuntamenti" value={metrics.conAppuntamenti} helper="Attività" />
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
            <label className="block text-sm font-medium text-slate-700">Ricerca</label>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cerca per nome, azienda, email, telefono, P.IVA, CF"
              className="mt-3 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
          </div>
          <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-700">Filtri</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {FILTERS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  className={`rounded-3xl px-5 py-3 text-sm font-semibold transition ${
                    filter === item.key ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
          <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500">Elenco clienti</p>
                <p className="mt-2 text-sm text-slate-600">{filteredCustomers.length} clienti filtrati.</p>
              </div>
              <div className="rounded-3xl bg-slate-50 px-4 py-3 text-sm text-slate-700">Filtro: {FILTERS.find((f) => f.key === filter)?.label}</div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-3 text-left text-sm">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-slate-500">Cliente</th>
                    <th className="px-4 py-3 text-slate-500">Contatti</th>
                    <th className="px-4 py-3 text-slate-500">Lead</th>
                    <th className="px-4 py-3 text-slate-500">Veicoli</th>
                    <th className="px-4 py-3 text-slate-500">Appuntamenti</th>
                    <th className="px-4 py-3 text-slate-500">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">Caricamento...</td>
                    </tr>
                  ) : filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">Nessun cliente.</td>
                    </tr>
                  ) : (
                    filteredCustomers.map((customer) => (
                      <tr key={customer.id} className="rounded-[28px] border border-slate-200 bg-slate-50">
                        <td className="px-4 py-4">
                          <p className="font-semibold text-slate-900">{formatCustomerName(customer)}</p>
                          <p className="mt-1 text-xs text-slate-500">{customer.company ? "Azienda" : "Privato"}</p>
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          <p>{customer.email ?? "-"}</p>
                          <p className="text-xs text-slate-500">{customer.mobile ?? customer.phone ?? "-"}</p>
                        </td>
                        <td className="px-4 py-4 text-slate-700">{(leadsByCustomer[customer.id] ?? []).length}</td>
                        <td className="px-4 py-4 text-slate-700">{(vehiclesByCustomer[customer.id] ?? []).length}</td>
                        <td className="px-4 py-4 text-slate-700">{(appointmentsByCustomer[customer.id] ?? []).length}</td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => selectCustomer(customer)}
                              className="rounded-3xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                            >
                              Dettaglio
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(customer.id)}
                              className="rounded-3xl bg-red-100 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-200"
                            >
                              Elimina
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            {!selectedCustomer ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                Seleziona un cliente per visualizzare dettaglio, modifica e cronologia.
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.35em] text-blue-600">Dettaglio cliente</p>
                  <h2 className="mt-3 text-2xl font-semibold text-slate-900">{formatCustomerName(selectedCustomer)}</h2>
                </div>

                <Panel title="Informazioni">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextInput label="Nome" value={draft.first_name} onChange={(v) => setDraft((c) => ({ ...c, first_name: v }))} />
                    <TextInput label="Cognome" value={draft.last_name} onChange={(v) => setDraft((c) => ({ ...c, last_name: v }))} />
                    <TextInput label="Azienda" value={draft.company} onChange={(v) => setDraft((c) => ({ ...c, company: v }))} />
                    <TextInput label="Partita IVA" value={draft.vat_number} onChange={(v) => setDraft((c) => ({ ...c, vat_number: v }))} />
                    <TextInput label="Codice fiscale" value={draft.tax_code} onChange={(v) => setDraft((c) => ({ ...c, tax_code: v }))} />
                    <TextInput label="Email" value={draft.email} onChange={(v) => setDraft((c) => ({ ...c, email: v }))} />
                    <TextInput label="Telefono" value={draft.phone} onChange={(v) => setDraft((c) => ({ ...c, phone: v }))} />
                    <TextInput label="Cellulare" value={draft.mobile} onChange={(v) => setDraft((c) => ({ ...c, mobile: v }))} />
                    <TextInput label="Indirizzo" value={draft.address} onChange={(v) => setDraft((c) => ({ ...c, address: v }))} />
                    <TextInput label="Citta" value={draft.city} onChange={(v) => setDraft((c) => ({ ...c, city: v }))} />
                    <TextInput label="Provincia" value={draft.province} onChange={(v) => setDraft((c) => ({ ...c, province: v }))} />
                    <TextInput label="CAP" value={draft.zip_code} onChange={(v) => setDraft((c) => ({ ...c, zip_code: v }))} />
                  </div>
                </Panel>

                <Panel title="Lead collegati">
                  {selectedLeads.length === 0 ? (
                    <EmptyBox text="Nessun lead collegato." />
                  ) : (
                    <ul className="space-y-2">
                      {selectedLeads.map((lead) => (
                        <li key={lead.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <p className="text-sm font-semibold text-slate-900">{formatLeadName(lead)}</p>
                          <p className="mt-1 text-xs text-slate-600">
                            {formatLeadStatus(lead.status)} - {formatDate(lead.created_at)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">Veicolo: {formatLeadVehicle(lead)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <Panel title="Veicoli acquistati">
                  {selectedVehicles.length === 0 ? (
                    <EmptyBox text="Nessun veicolo collegato." />
                  ) : (
                    <ul className="space-y-2">
                      {selectedVehicles.map((vehicle) => (
                        <li key={vehicle.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <p className="text-sm font-semibold text-slate-900">{formatVehicleLabel(vehicle)}</p>
                          <p className="mt-1 text-xs text-slate-600">
                            {formatVehicleStatus(vehicle)} - {formatCurrency(vehicle.price)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <Panel title="Appuntamenti">
                  {selectedAppointments.length === 0 ? (
                    <EmptyBox text="Nessun appuntamento collegato." />
                  ) : (
                    <ul className="space-y-2">
                      {selectedAppointments.map((item) => (
                        <li key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <p className="text-sm font-semibold text-slate-900">{item.title ?? "Appuntamento"}</p>
                          <p className="mt-1 text-xs text-slate-600">
                            {formatDate(item.start_at)} - {item.status ?? "-"}
                          </p>
                          {item.description ? <p className="mt-1 text-xs text-slate-500">{item.description}</p> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <Panel title="Note">
                  <textarea
                    rows={4}
                    value={draft.notes}
                    onChange={(event) => setDraft((c) => ({ ...c, notes: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  />
                </Panel>

                <Panel title="Cronologia attività">
                  {timeline.length === 0 ? (
                    <EmptyBox text="Nessuna attività disponibile." />
                  ) : (
                    <ul className="space-y-2">
                      {timeline.map((event) => (
                        <li key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${event.badgeClassName}`}>{event.title}</span>
                            <span className="text-xs text-slate-500">{formatDate(event.date)}</span>
                          </div>
                          <p className="mt-2 text-sm text-slate-700">{event.description}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Salvataggio..." : "Salva modifiche"}
                  </button>
                  <button
                    type="button"
                    onClick={() => selectCustomer(null)}
                    className="inline-flex items-center justify-center rounded-3xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                  >
                    Chiudi dettaglio
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
        </div>
      </div>
    </DealerDashboardShell>
  );
}

function MetricCard({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{helper}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-3 text-sm font-semibold text-slate-700">{title}</p>
      {children}
    </section>
  );
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
  return (
    <label>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function EmptyBox({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">{text}</p>;
}

function groupBy<T>(items: T[], getKey: (item: T) => string | null) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = getKey(item);
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toCustomerDraft(customer: Customer): CustomerDraft {
  return {
    first_name: customer.first_name ?? "",
    last_name: customer.last_name ?? "",
    company: customer.company ?? "",
    vat_number: customer.vat_number ?? "",
    tax_code: customer.tax_code ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    mobile: customer.mobile ?? "",
    address: customer.address ?? "",
    city: customer.city ?? "",
    province: customer.province ?? "",
    zip_code: customer.zip_code ?? "",
    notes: customer.notes ?? "",
  };
}

function formatCustomerName(customer: Customer) {
  if (customer.company?.trim()) return customer.company;
  const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
  return fullName || "Cliente";
}

function formatLeadName(lead: Lead) {
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim();
  return fullName || lead.email || lead.phone || "Lead";
}

function formatLeadStatus(status: string | null) {
  const normalized = String(status ?? "created").trim().toLowerCase();
  const map: Record<string, string> = {
    created: "Creato",
    contacted: "Contattato",
    appointment: "Appuntamento",
    negotiation: "Trattativa",
    won: "Vinto",
    lost: "Perso",
  };
  return map[normalized] ?? normalized;
}

function formatLeadVehicle(lead: Lead) {
  const linked = Array.isArray(lead.vehicle) ? lead.vehicle[0] : lead.vehicle ?? null;
  if (!linked) return lead.vehicle_id ?? "-";
  return [linked.brand, linked.model, linked.version].filter(Boolean).join(" ") || linked.id;
}

function formatVehicleLabel(vehicle: Vehicle) {
  return [vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(" ") || "Veicolo";
}

function formatVehicleStatus(vehicle: Vehicle) {
  const normalized = String(vehicle.status ?? "").trim().toLowerCase();
  if (normalized === "sold" || normalized === "venduto") return "Venduto";
  if (vehicle.published || normalized === "published" || normalized === "pubblicato") return "Pubblicato";
  return "Bozza";
}

function formatCurrency(value: string | number | null | undefined) {
  const amount = parsePrice(value);
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount);
}

function parsePrice(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const digits = value.replace(/[€\s,.]/g, "").replace(/[^0-9]/g, "");
  return digits ? Number(digits) : 0;
}

function formatDate(value: string | null) {
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

function dateValue(value: string | null) {
  if (!value) return 0;
  const v = new Date(value).getTime();
  return Number.isNaN(v) ? 0 : v;
}
