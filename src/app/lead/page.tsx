"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type LeadStatus = "nuovo" | "contattato" | "trattativa" | "venduto" | "perso";

type DealerProfile = {
  dealer_id: string | null;
};

type LeadRow = {
  id: string;
  vehicle_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  vehicle: {
    id: string;
    brand: string | null;
    model: string | null;
    version: string | null;
    year: string | null;
    dealer_id: string | null;
  } | null;
};

type LeadRowRaw = Omit<LeadRow, "vehicle"> & {
  vehicle: Array<{
    id: string;
    brand: string | null;
    model: string | null;
    version: string | null;
    year: string | null;
    dealer_id: string | null;
  }> | null;
};

const STATUS_OPTIONS: LeadStatus[] = ["nuovo", "contattato", "trattativa", "venduto", "perso"];

const STATUS_LABELS: Record<LeadStatus, string> = {
  nuovo: "Nuovo",
  contattato: "Contattato",
  trattativa: "Trattativa",
  venduto: "Venduto",
  perso: "Perso",
};

const STATUS_STYLES: Record<LeadStatus, string> = {
  nuovo: "bg-blue-100 text-blue-700",
  contattato: "bg-sky-100 text-sky-700",
  trattativa: "bg-amber-100 text-amber-700",
  venduto: "bg-emerald-100 text-emerald-700",
  perso: "bg-rose-100 text-rose-700",
};

export default function LeadPage() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"all" | LeadStatus>("all");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadLeads = async () => {
      setLoading(true);
      setErrorMessage(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (userError || !user) {
        setLoading(false);
        setErrorMessage(userError?.message || "Utente non autenticato.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("dealer_id")
        .eq("id", user.id)
        .maybeSingle<DealerProfile>();

      if (!mounted) return;

      if (profileError) {
        setLoading(false);
        setErrorMessage(profileError.message || "Errore nel recupero del dealer.");
        return;
      }

      if (!profile?.dealer_id) {
        setLoading(false);
        setErrorMessage("Dealer non associato al profilo utente.");
        return;
      }

      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, vehicle_id, first_name, last_name, email, phone, message, status, created_at, updated_at, vehicle:vehicles!inner(id, brand, model, version, year, dealer_id)"
        )
        .eq("vehicle.dealer_id", profile.dealer_id)
        .order("created_at", { ascending: false });

      if (!mounted) return;

      setLoading(false);

      if (error) {
        setErrorMessage(error.message || "Errore nel recupero dei lead.");
        return;
      }

      const normalized = ((data ?? []) as LeadRowRaw[]).map((row) => ({
        ...row,
        vehicle: Array.isArray(row.vehicle) ? row.vehicle[0] ?? null : null,
        status: normalizeStatus(row.status),
      }));

      setLeads(normalized);
    };

    void loadLeads();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredLeads = useMemo(() => {
    if (filterStatus === "all") return leads;
    return leads.filter((lead) => normalizeStatus(lead.status) === filterStatus);
  }, [filterStatus, leads]);

  const handleStatusChange = async (leadId: string, nextStatus: LeadStatus) => {
    setUpdatingLeadId(leadId);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { error } = await supabase
      .from("leads")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", leadId);

    setUpdatingLeadId(null);

    if (error) {
      setErrorMessage(error.message || "Errore durante l'aggiornamento dello stato.");
      return;
    }

    setLeads((current) => current.map((lead) => (lead.id === leadId ? { ...lead, status: nextStatus } : lead)));
    setSuccessMessage("Stato lead aggiornato correttamente.");
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="px-4 py-6 lg:px-8">
        <div className="mb-6 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-blue-600">Lead</p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900">Gestione richieste concessionario</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Visualizza tutte le richieste ricevute dai veicoli della tua concessionaria e aggiorna lo stato commerciale.
              </p>
            </div>
          </div>
        </div>

        {errorMessage ? <Banner tone="error" text={errorMessage} /> : null}
        {successMessage ? <Banner tone="success" text={successMessage} /> : null}

        <div className="mb-6 rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-700">Filtro stato</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <FilterButton
              active={filterStatus === "all"}
              label="Tutti"
              onClick={() => setFilterStatus("all")}
            />
            {STATUS_OPTIONS.map((status) => (
              <FilterButton
                key={status}
                active={filterStatus === status}
                label={STATUS_LABELS[status]}
                onClick={() => setFilterStatus(status)}
              />
            ))}
          </div>
        </div>

        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-slate-600">
              {filteredLeads.length} lead trovato{filteredLeads.length === 1 ? "" : "i"}, ordinati dal piu recente al piu vecchio.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-3 text-left text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-slate-500">Data richiesta</th>
                  <th className="px-4 py-3 text-slate-500">Nome</th>
                  <th className="px-4 py-3 text-slate-500">Cognome</th>
                  <th className="px-4 py-3 text-slate-500">Email</th>
                  <th className="px-4 py-3 text-slate-500">Telefono</th>
                  <th className="px-4 py-3 text-slate-500">Messaggio</th>
                  <th className="px-4 py-3 text-slate-500">Veicolo richiesto</th>
                  <th className="px-4 py-3 text-slate-500">Stato lead</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      Caricamento lead...
                    </td>
                  </tr>
                ) : filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      Nessun lead disponibile con il filtro selezionato.
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => {
                    const normalizedStatus = normalizeStatus(lead.status);
                    return (
                      <tr key={lead.id} className="rounded-[28px] border border-slate-200 bg-slate-50">
                        <td className="px-4 py-4 text-slate-700">{formatDate(lead.created_at)}</td>
                        <td className="px-4 py-4 text-slate-700">{lead.first_name || "-"}</td>
                        <td className="px-4 py-4 text-slate-700">{lead.last_name || "-"}</td>
                        <td className="px-4 py-4 text-slate-700">{lead.email || "-"}</td>
                        <td className="px-4 py-4 text-slate-700">{lead.phone || "-"}</td>
                        <td className="px-4 py-4 text-slate-700">{lead.message?.trim() || "-"}</td>
                        <td className="px-4 py-4 text-slate-700">{formatVehicleLabel(lead.vehicle)}</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[normalizedStatus]}`}
                            >
                              {STATUS_LABELS[normalizedStatus]}
                            </span>
                            <select
                              value={normalizedStatus}
                              onChange={(event) => void handleStatusChange(lead.id, event.target.value as LeadStatus)}
                              disabled={updatingLeadId === lead.id}
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
                            >
                              {STATUS_OPTIONS.map((status) => (
                                <option key={status} value={status}>
                                  {STATUS_LABELS[status]}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

function normalizeStatus(value: string | null): LeadStatus {
  switch ((value || "").toLowerCase()) {
    case "contattato":
    case "contacted":
      return "contattato";
    case "trattativa":
    case "negotiation":
    case "appointment":
      return "trattativa";
    case "venduto":
    case "won":
      return "venduto";
    case "perso":
    case "lost":
      return "perso";
    case "nuovo":
    case "created":
    default:
      return "nuovo";
  }
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

function formatVehicleLabel(vehicle: LeadRow["vehicle"]) {
  if (!vehicle) return "-";
  return [vehicle.brand, vehicle.model, vehicle.version, vehicle.year].filter(Boolean).join(" ") || vehicle.id;
}

function Banner({ tone, text }: { tone: "error" | "success"; text: string }) {
  return (
    <div
      className={`mb-6 rounded-3xl border px-5 py-4 text-sm ${
        tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-red-200 bg-red-50 text-red-800"
      }`}
    >
      {text}
    </div>
  );
}

function FilterButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-3xl px-5 py-3 text-sm font-semibold transition ${
        active ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );
}
