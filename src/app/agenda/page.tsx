"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "cancelled";
type CalendarView = "month" | "week" | "day" | "list";

type Appointment = {
  id: string;
  dealer_id: string | null;
  customer_id: string | null;
  lead_id: string | null;
  vehicle_id: string | null;
  title: string | null;
  description: string | null;
  start_at: string | null;
  end_at: string | null;
  status: AppointmentStatus | null;
  created_at: string | null;
  updated_at: string | null;
  customer?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  } | null;
  lead?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
  vehicle?: {
    id: string;
    brand: string | null;
    model: string | null;
    version: string | null;
  } | null;
};

type CustomerOption = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
};

type LeadOption = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

type VehicleOption = {
  id: string;
  brand: string | null;
  model: string | null;
  version: string | null;
};

type AppointmentDraft = {
  id: string | null;
  customer_id: string;
  lead_id: string;
  vehicle_id: string;
  title: string;
  description: string;
  start_at: string;
  end_at: string;
  status: AppointmentStatus;
};

const VIEW_OPTIONS: Array<{ key: CalendarView; label: string }> = [
  { key: "month", label: "Mensile" },
  { key: "week", label: "Settimanale" },
  { key: "day", label: "Giornaliera" },
  { key: "list", label: "Elenco" },
];

const STATUS_OPTIONS: Array<{ key: "all" | AppointmentStatus; label: string }> = [
  { key: "all", label: "Tutti" },
  { key: "scheduled", label: "Programmato" },
  { key: "confirmed", label: "Confermato" },
  { key: "completed", label: "Concluso" },
  { key: "cancelled", label: "Annullato" },
];

const EMPTY_DRAFT: AppointmentDraft = {
  id: null,
  customer_id: "",
  lead_id: "",
  vehicle_id: "",
  title: "",
  description: "",
  start_at: "",
  end_at: "",
  status: "scheduled",
};

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export default function AgendaPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);

  const [view, setView] = useState<CalendarView>("month");
  const [filterStatus, setFilterStatus] = useState<(typeof STATUS_OPTIONS)[number]["key"]>("all");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusMessageType, setStatusMessageType] = useState<"success" | "error" | null>(null);

  const [cursorDate, setCursorDate] = useState(new Date());
  const [draft, setDraft] = useState<AppointmentDraft>(EMPTY_DRAFT);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setStatusMessage(null);

    const [appointmentsRes, customersRes, leadsRes, vehiclesRes] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, dealer_id, customer_id, lead_id, vehicle_id, title, description, start_at, end_at, status, created_at, updated_at, customer:customers(id, first_name, last_name, company), lead:leads(id, first_name, last_name, email), vehicle:vehicles(id, brand, model, version)")
        .order("start_at", { ascending: true }),
      supabase
        .from("customers")
        .select("id, first_name, last_name, company")
        .order("created_at", { ascending: false }),
      supabase
        .from("leads")
        .select("id, first_name, last_name, email")
        .order("created_at", { ascending: false }),
      supabase
        .from("vehicles")
        .select("id, brand, model, version")
        .order("created_at", { ascending: false }),
    ]);

    setLoading(false);

    if (appointmentsRes.error || customersRes.error || leadsRes.error || vehiclesRes.error) {
      const message =
        appointmentsRes.error?.message ||
        customersRes.error?.message ||
        leadsRes.error?.message ||
        vehiclesRes.error?.message ||
        "Errore nel recupero agenda.";
      setStatusMessage(message);
      setStatusMessageType("error");
      return;
    }

    setAppointments((appointmentsRes.data ?? []) as unknown as Appointment[]);
    setCustomers((customersRes.data ?? []) as CustomerOption[]);
    setLeads((leadsRes.data ?? []) as LeadOption[]);
    setVehicles((vehiclesRes.data ?? []) as VehicleOption[]);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchData();
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("agenda-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
        void fetchData();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const normalizedSearch = search.trim().toLowerCase();
  const searchTerms = normalizedSearch.split(/\s+/).filter(Boolean);

  const filteredAppointments = useMemo(() => {
    return appointments.filter((item) => {
      const statusValue = item.status ?? "scheduled";
      if (filterStatus !== "all" && statusValue !== filterStatus) return false;

      if (!normalizedSearch) return true;

      const searchable = [
        item.title,
        item.description,
        formatCustomer(item.customer),
        formatLead(item.lead),
        formatVehicle(item.vehicle),
        item.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchTerms.every((term) => searchable.includes(term));
    });
  }, [appointments, filterStatus, normalizedSearch, searchTerms]);

  const appointmentsByDay = useMemo(() => {
    return filteredAppointments.reduce<Record<string, Appointment[]>>((acc, item) => {
      const key = dayKeyFromIso(item.start_at);
      if (!key) return acc;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [filteredAppointments]);

  const monthDays = useMemo(() => buildMonthGrid(cursorDate), [cursorDate]);
  const weekDays = useMemo(() => buildWeekDays(cursorDate), [cursorDate]);
  const dayAppointments = useMemo(() => {
    const key = dayKey(cursorDate);
    return (appointmentsByDay[key] ?? []).sort((a, b) => dateValue(a.start_at) - dateValue(b.start_at));
  }, [appointmentsByDay, cursorDate]);

  const todayAppointments = useMemo(() => {
    const key = dayKey(new Date());
    return (appointmentsByDay[key] ?? []).sort((a, b) => dateValue(a.start_at) - dateValue(b.start_at));
  }, [appointmentsByDay]);

  const openCreateModal = () => {
    const defaultStart = roundToNextHour(new Date());
    const defaultEnd = new Date(defaultStart.getTime() + 60 * 60 * 1000);

    setDraft({
      ...EMPTY_DRAFT,
      start_at: toDateTimeLocal(defaultStart),
      end_at: toDateTimeLocal(defaultEnd),
    });
    setIsModalOpen(true);
  };

  const openEditModal = (appointment: Appointment) => {
    setDraft({
      id: appointment.id,
      customer_id: appointment.customer_id ?? "",
      lead_id: appointment.lead_id ?? "",
      vehicle_id: appointment.vehicle_id ?? "",
      title: appointment.title ?? "",
      description: appointment.description ?? "",
      start_at: toDateTimeLocal(new Date(appointment.start_at ?? new Date())),
      end_at: toDateTimeLocal(new Date(appointment.end_at ?? appointment.start_at ?? new Date())),
      status: normalizeStatus(appointment.status),
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm("Sei sicuro di voler eliminare questo appuntamento?");
    if (!confirmed) return;

    setLoading(true);
    setStatusMessage(null);

    const { data, error } = await supabase.from("appointments").delete().eq("id", id).select("id");

    setLoading(false);

    if (error) {
      setStatusMessage(error.message || "Errore durante l'eliminazione appuntamento.");
      setStatusMessageType("error");
      return;
    }

    if (!data || data.length === 0) {
      setStatusMessage("Nessun appuntamento eliminato: ID non trovato o non autorizzato.");
      setStatusMessageType("error");
      return;
    }

    setStatusMessage("Appuntamento eliminato correttamente.");
    setStatusMessageType("success");
    setAppointments((current) => current.filter((item) => item.id !== id));
  };

  const handleSave = async () => {
    if (!draft.title.trim()) {
      setStatusMessage("Inserisci il titolo dell'appuntamento.");
      setStatusMessageType("error");
      return;
    }

    if (!draft.start_at) {
      setStatusMessage("Inserisci data/ora di inizio.");
      setStatusMessageType("error");
      return;
    }

    const startAt = new Date(draft.start_at).toISOString();
    const endAt = draft.end_at ? new Date(draft.end_at).toISOString() : new Date(new Date(draft.start_at).getTime() + 60 * 60 * 1000).toISOString();

    if (new Date(endAt).getTime() < new Date(startAt).getTime()) {
      setStatusMessage("La fine non può essere precedente all'inizio.");
      setStatusMessageType("error");
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    const payload = {
      customer_id: nullableId(draft.customer_id),
      lead_id: nullableId(draft.lead_id),
      vehicle_id: nullableId(draft.vehicle_id),
      title: draft.title.trim(),
      description: nullableText(draft.description),
      start_at: startAt,
      end_at: endAt,
      status: draft.status,
      updated_at: new Date().toISOString(),
    };

    const query = draft.id
      ? supabase.from("appointments").update(payload).eq("id", draft.id).select("id").maybeSingle()
      : supabase.from("appointments").insert(payload).select("id").maybeSingle();

    const { error } = await query;

    setSaving(false);

    if (error) {
      setStatusMessage(error.message || "Errore durante il salvataggio appuntamento.");
      setStatusMessageType("error");
      return;
    }

    setStatusMessage(draft.id ? "Appuntamento aggiornato con successo." : "Appuntamento creato con successo.");
    setStatusMessageType("success");
    setIsModalOpen(false);
    setDraft(EMPTY_DRAFT);
    await fetchData();
  };

  const goPrev = () => {
    setCursorDate((current) => {
      const next = new Date(current);
      if (view === "month") next.setMonth(current.getMonth() - 1);
      else if (view === "week") next.setDate(current.getDate() - 7);
      else next.setDate(current.getDate() - 1);
      return next;
    });
  };

  const goNext = () => {
    setCursorDate((current) => {
      const next = new Date(current);
      if (view === "month") next.setMonth(current.getMonth() + 1);
      else if (view === "week") next.setDate(current.getDate() + 7);
      else next.setDate(current.getDate() + 1);
      return next;
    });
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="px-4 py-6 lg:px-8">
        <div className="mb-6 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-blue-600">Agenda</p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900">Modulo Agenda</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                Calendario mensile, vista settimanale, giornaliera ed elenco appuntamenti con collegamenti a cliente, lead e veicolo.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
            >
              Nuovo appuntamento
            </button>
          </div>
        </div>

        {statusMessage ? (
          <div
            className={`mb-6 rounded-3xl border px-5 py-4 text-sm ${
              statusMessageType === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {statusMessage}
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
            <label className="block text-sm font-medium text-slate-700">Ricerca</label>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cerca per titolo, descrizione, cliente, lead o veicolo"
              className="mt-3 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
          </div>
          <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-700">Filtri stato</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setFilterStatus(option.key)}
                  className={`rounded-3xl px-5 py-3 text-sm font-semibold transition ${
                    filterStatus === option.key
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {VIEW_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setView(option.key)}
                  className={`rounded-3xl px-5 py-3 text-sm font-semibold transition ${
                    view === option.key
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={goPrev} className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200">◀</button>
              <div className="rounded-2xl bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">{formatCursorLabel(cursorDate, view)}</div>
              <button type="button" onClick={goNext} className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200">▶</button>
            </div>
          </div>
        </div>

        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Appuntamenti di oggi</h2>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">{todayAppointments.length}</span>
            </div>
            {todayAppointments.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Nessun appuntamento previsto per oggi.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {todayAppointments.slice(0, 4).map((item) => (
                  <li key={item.id} className={`rounded-xl border px-3 py-2 text-sm ${statusClass(item.status)}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{item.title ?? "Appuntamento"}</span>
                      <span className="text-xs">{formatHour(item.start_at)} - {formatHour(item.end_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {view === "month" ? (
            <MonthView
              monthDays={monthDays}
              appointmentsByDay={appointmentsByDay}
              cursorDate={cursorDate}
              onDaySelect={(date) => {
                setCursorDate(date);
                setView("day");
              }}
              onEdit={openEditModal}
              onDelete={handleDelete}
            />
          ) : null}

          {view === "week" ? (
            <WeekView
              weekDays={weekDays}
              appointmentsByDay={appointmentsByDay}
              onEdit={openEditModal}
              onDelete={handleDelete}
            />
          ) : null}

          {view === "day" ? (
            <DayView
              day={cursorDate}
              appointments={dayAppointments}
              onEdit={openEditModal}
              onDelete={handleDelete}
            />
          ) : null}

          {view === "list" ? (
            <ListView appointments={filteredAppointments} loading={loading} onEdit={openEditModal} onDelete={handleDelete} />
          ) : null}
        </section>
      </div>

      {isModalOpen ? (
        <Modal title={draft.id ? "Modifica appuntamento" : "Nuovo appuntamento"} onClose={() => setIsModalOpen(false)}>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Titolo" value={draft.title} onChange={(value) => setDraft((current) => ({ ...current, title: value }))} />
            <Select
              label="Stato"
              value={draft.status}
              onChange={(value) => setDraft((current) => ({ ...current, status: value as AppointmentStatus }))}
              options={STATUS_OPTIONS.filter((option) => option.key !== "all").map((option) => ({ value: option.key, label: option.label }))}
            />
            <Input
              label="Inizio"
              type="datetime-local"
              value={draft.start_at}
              onChange={(value) => setDraft((current) => ({ ...current, start_at: value }))}
            />
            <Input
              label="Fine"
              type="datetime-local"
              value={draft.end_at}
              onChange={(value) => setDraft((current) => ({ ...current, end_at: value }))}
            />
            <Select
              label="Cliente"
              value={draft.customer_id}
              onChange={(value) => setDraft((current) => ({ ...current, customer_id: value }))}
              options={[{ value: "", label: "Nessun cliente" }, ...customers.map((item) => ({ value: item.id, label: formatCustomer(item) }))]}
            />
            <Select
              label="Lead"
              value={draft.lead_id}
              onChange={(value) => setDraft((current) => ({ ...current, lead_id: value }))}
              options={[{ value: "", label: "Nessun lead" }, ...leads.map((item) => ({ value: item.id, label: formatLead(item) }))]}
            />
            <Select
              label="Veicolo"
              value={draft.vehicle_id}
              onChange={(value) => setDraft((current) => ({ ...current, vehicle_id: value }))}
              options={[{ value: "", label: "Nessun veicolo" }, ...vehicles.map((item) => ({ value: item.id, label: formatVehicle(item) }))]}
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700">Descrizione</label>
            <textarea
              rows={4}
              value={draft.description}
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="rounded-3xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Salvataggio..." : "Salva appuntamento"}
            </button>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

function MonthView({
  monthDays,
  appointmentsByDay,
  cursorDate,
  onDaySelect,
  onEdit,
  onDelete,
}: {
  monthDays: Date[];
  appointmentsByDay: Record<string, Appointment[]>;
  cursorDate: Date;
  onDaySelect: (date: Date) => void;
  onEdit: (appointment: Appointment) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-7 gap-2">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="rounded-2xl bg-slate-100 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {monthDays.map((day) => {
          const key = dayKey(day);
          const items = (appointmentsByDay[key] ?? []).sort((a, b) => dateValue(a.start_at) - dateValue(b.start_at));
          const isCurrentMonth = day.getMonth() === cursorDate.getMonth();

          return (
            <div key={key} className={`rounded-2xl border p-3 ${isCurrentMonth ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-slate-100/70"}`}>
              <button
                type="button"
                onClick={() => onDaySelect(day)}
                className="mb-2 text-sm font-semibold text-slate-800 hover:text-blue-700"
              >
                {day.getDate()}
              </button>
              <div className="space-y-2">
                {items.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onEdit(item)}
                    className={`flex w-full flex-col rounded-xl border px-2 py-1 text-left text-xs ${statusClass(item.status)}`}
                  >
                    <span className="font-semibold">{formatHour(item.start_at)}</span>
                    <span className="truncate">{item.title ?? "Appuntamento"}</span>
                  </button>
                ))}
                {items.length > 3 ? <p className="text-[11px] text-slate-500">+{items.length - 3} altri</p> : null}
                {items.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onDelete(items[0].id)}
                    className="text-[11px] font-semibold text-red-600 hover:text-red-700"
                  >
                    Elimina ultimo selezionato
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({
  weekDays,
  appointmentsByDay,
  onEdit,
  onDelete,
}: {
  weekDays: Date[];
  appointmentsByDay: Record<string, Appointment[]>;
  onEdit: (appointment: Appointment) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-7">
      {weekDays.map((day) => {
        const key = dayKey(day);
        const items = (appointmentsByDay[key] ?? []).sort((a, b) => dateValue(a.start_at) - dateValue(b.start_at));
        return (
          <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{WEEKDAY_LABELS[day.getDay() === 0 ? 6 : day.getDay() - 1]}</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{day.getDate()}</p>
            <div className="mt-3 space-y-2">
              {items.length === 0 ? <p className="text-xs text-slate-500">Nessun appuntamento</p> : null}
              {items.map((item) => (
                <div key={item.id} className={`rounded-xl border px-2 py-2 text-xs ${statusClass(item.status)}`}>
                  <button type="button" onClick={() => onEdit(item)} className="w-full text-left">
                    <p className="font-semibold">{item.title ?? "Appuntamento"}</p>
                    <p className="mt-1">{formatHour(item.start_at)} - {formatHour(item.end_at)}</p>
                  </button>
                  <button type="button" onClick={() => onDelete(item.id)} className="mt-1 font-semibold text-red-600 hover:text-red-700">
                    Elimina
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayView({
  day,
  appointments,
  onEdit,
  onDelete,
}: {
  day: Date;
  appointments: Appointment[];
  onEdit: (appointment: Appointment) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900">{new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(day)}</h2>
      <div className="mt-4 space-y-3">
        {appointments.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">Nessun appuntamento per il giorno selezionato.</p> : null}
        {appointments.map((item) => (
          <div key={item.id} className={`rounded-2xl border p-4 ${statusClass(item.status)}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">{item.title ?? "Appuntamento"}</p>
              <span className="text-xs font-semibold uppercase">{item.status ?? "scheduled"}</span>
            </div>
            <p className="mt-2 text-sm">{formatHour(item.start_at)} - {formatHour(item.end_at)}</p>
            <p className="mt-1 text-xs">Cliente: {formatCustomer(item.customer)}</p>
            <p className="mt-1 text-xs">Lead: {formatLead(item.lead)}</p>
            <p className="mt-1 text-xs">Veicolo: {formatVehicle(item.vehicle)}</p>
            {item.description ? <p className="mt-2 text-sm">{item.description}</p> : null}
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => onEdit(item)} className="rounded-2xl bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white">Modifica</button>
              <button type="button" onClick={() => onDelete(item.id)} className="rounded-2xl bg-red-100 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-200">Elimina</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListView({
  appointments,
  loading,
  onEdit,
  onDelete,
}: {
  appointments: Appointment[];
  loading: boolean;
  onEdit: (appointment: Appointment) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-y-3 text-left text-sm">
        <thead>
          <tr>
            <th className="px-4 py-3 text-slate-500">Titolo</th>
            <th className="px-4 py-3 text-slate-500">Inizio</th>
            <th className="px-4 py-3 text-slate-500">Fine</th>
            <th className="px-4 py-3 text-slate-500">Stato</th>
            <th className="px-4 py-3 text-slate-500">Cliente</th>
            <th className="px-4 py-3 text-slate-500">Lead</th>
            <th className="px-4 py-3 text-slate-500">Veicolo</th>
            <th className="px-4 py-3 text-slate-500">Azioni</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-slate-500">Caricamento...</td>
            </tr>
          ) : appointments.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-slate-500">Nessun appuntamento disponibile.</td>
            </tr>
          ) : (
            appointments.map((item) => (
              <tr key={item.id} className="rounded-[28px] border border-slate-200 bg-slate-50">
                <td className="px-4 py-4 font-semibold text-slate-900">{item.title ?? "-"}</td>
                <td className="px-4 py-4 text-slate-700">{formatDateTime(item.start_at)}</td>
                <td className="px-4 py-4 text-slate-700">{formatDateTime(item.end_at)}</td>
                <td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusPillClass(item.status)}`}>{item.status ?? "scheduled"}</span></td>
                <td className="px-4 py-4 text-slate-700">{formatCustomer(item.customer)}</td>
                <td className="px-4 py-4 text-slate-700">{formatLead(item.lead)}</td>
                <td className="px-4 py-4 text-slate-700">{formatVehicle(item.vehicle)}</td>
                <td className="px-4 py-4">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => onEdit(item)} className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">Modifica</button>
                    <button type="button" onClick={() => onDelete(item.id)} className="rounded-2xl bg-red-100 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-200">Elimina</button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[32px] border border-slate-200 bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">Chiudi</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label>
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label>
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function normalizeStatus(status: string | null | undefined): AppointmentStatus {
  const value = String(status ?? "scheduled").trim().toLowerCase();
  if (value === "confirmed" || value === "confermato") return "confirmed";
  if (value === "completed" || value === "concluso") return "completed";
  if (value === "cancelled" || value === "annullato") return "cancelled";
  return "scheduled";
}

function statusClass(status: string | null | undefined) {
  const value = normalizeStatus(status);
  if (value === "confirmed") return "border-blue-200 bg-blue-50 text-blue-900";
  if (value === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (value === "cancelled") return "border-rose-200 bg-rose-50 text-rose-900";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function statusPillClass(status: string | null | undefined) {
  const value = normalizeStatus(status);
  if (value === "confirmed") return "bg-blue-100 text-blue-700";
  if (value === "completed") return "bg-emerald-100 text-emerald-700";
  if (value === "cancelled") return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-700";
}

function formatCustomer(customer: Appointment["customer"] | CustomerOption | null | undefined) {
  if (!customer) return "-";
  if (customer.company?.trim()) return customer.company;
  const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
  return fullName || "-";
}

function formatLead(lead: Appointment["lead"] | LeadOption | null | undefined) {
  if (!lead) return "-";
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim();
  return fullName || lead.email || "-";
}

function formatVehicle(vehicle: Appointment["vehicle"] | VehicleOption | null | undefined) {
  if (!vehicle) return "-";
  return [vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(" ") || "-";
}

function nullableId(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildMonthGrid(date: Date) {
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = startOfWeek(firstOfMonth);
  const grid: Date[] = [];
  for (let index = 0; index < 42; index += 1) {
    const next = new Date(start);
    next.setDate(start.getDate() + index);
    grid.push(next);
  }
  return grid;
}

function buildWeekDays(date: Date) {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }).map((_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + diff);
  return next;
}

function dayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dayKeyFromIso(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return dayKey(date);
}

function dateValue(value: string | null | undefined) {
  if (!value) return 0;
  const date = new Date(value).getTime();
  return Number.isNaN(date) ? 0 : date;
}

function formatDateTime(value: string | null | undefined) {
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

function formatHour(value: string | null | undefined) {
  if (!value) return "--:--";
  try {
    return new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "--:--";
  }
}

function toDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function roundToNextHour(date: Date) {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next;
}

function formatCursorLabel(date: Date, view: CalendarView) {
  if (view === "month") {
    return new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(date);
  }

  if (view === "week") {
    const start = startOfWeek(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `${new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit" }).format(start)} - ${new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(end)}`;
  }

  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}
