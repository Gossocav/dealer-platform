"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Lead = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  vehicle_id: string | null;
  source: string | null;
  status: string | null;
  created_at: string | null;
};

const FILTERS = [
  { key: "all", label: "Tutti" },
  { key: "new", label: "Nuovi" },
  { key: "contacted", label: "Contattati" },
  { key: "appointment", label: "Appuntamento" },
  { key: "negotiation", label: "Trattativa" },
  { key: "sold", label: "Venduto" },
  { key: "lost", label: "Perso" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export default function LeadPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusMessageType, setStatusMessageType] = useState<"success" | "error" | null>(null);

  const fetchLeads = async () => {
    setLoading(true);
    setStatusMessage(null);

    const { data, error } = await supabase
      .from("leads")
      .select("id, customer_name, customer_email, customer_phone, vehicle_id, source, status, created_at")
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      setStatusMessage(error.message || "Errore nel recupero dei lead.");
      setStatusMessageType("error");
      return;
    }

    if (data) {
      setLeads(data as Lead[]);
    }
  };

  useEffect(() => {
    const loadLeads = async () => {
      await fetchLeads();
    };

    loadLeads();
  }, []);

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm("Sei sicuro di voler eliminare questo lead?");
    if (!confirmed) return;

    setLoading(true);
    setStatusMessage(null);

    const { error } = await supabase.from("leads").delete().eq("id", id);

    setLoading(false);

    if (error) {
      setStatusMessage(error.message || "Errore durante l'eliminazione del lead.");
      setStatusMessageType("error");
      return;
    }

    setLeads((current) => current.filter((lead) => lead.id !== id));
    setStatusMessage("Lead eliminato correttamente.");
    setStatusMessageType("success");
  };

  const normalizedSearch = search.trim().toLowerCase();
  const searchTerms = normalizedSearch.split(/\s+/).filter(Boolean);

  const statusMatchesFilter = (status: string | null, filterKey: FilterKey) => {
    const normalizedStatus = status?.toLowerCase() ?? "";

    if (filterKey === "all") return true;
    if (filterKey === "new") return normalizedStatus.includes("nuov") || normalizedStatus.includes("new");
    if (filterKey === "contacted") return normalizedStatus.includes("contatt") || normalizedStatus.includes("contact");
    if (filterKey === "appointment") return normalizedStatus.includes("appunt");
    if (filterKey === "negotiation") return normalizedStatus.includes("tratt");
    if (filterKey === "sold") return normalizedStatus.includes("vend");
    if (filterKey === "lost") return normalizedStatus.includes("pers");
    return true;
  };

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesFilter = statusMatchesFilter(lead.status, filter);
      if (!matchesFilter) return false;

      if (!normalizedSearch) return true;

      const searchable = [
        lead.customer_name,
        lead.customer_email,
        lead.customer_phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchTerms.every((term) => searchable.includes(term));
    });
  }, [leads, normalizedSearch, searchTerms, filter]);

  const formatDate = (timestamp: string | null) => {
    if (!timestamp) return "-";
    try {
      return new Intl.DateTimeFormat("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(timestamp));
    } catch {
      return timestamp;
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="px-4 py-6 lg:px-8">
        <div className="mb-6 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-blue-600">Lead</p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900">Gestione Lead</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Monitora e gestisci tutte le richieste dei clienti in un unico pannello.
              </p>
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
            >
              Nuovo Lead
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
              placeholder="Cerca per nome, cognome, telefono o email"
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
                    filter === item.key
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">Elenco lead</p>
              <p className="mt-2 text-sm text-slate-600">
                {filteredLeads.length} lead trovato{filteredLeads.length === 1 ? "" : "i"}.
              </p>
            </div>
            <div className="rounded-3xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Stato: {FILTERS.find((item) => item.key === filter)?.label}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-3 text-left text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-slate-500">Nome</th>
                  <th className="px-4 py-3 text-slate-500">Telefono</th>
                  <th className="px-4 py-3 text-slate-500">Email</th>
                  <th className="px-4 py-3 text-slate-500">Veicolo</th>
                  <th className="px-4 py-3 text-slate-500">Provenienza</th>
                  <th className="px-4 py-3 text-slate-500">Stato</th>
                  <th className="px-4 py-3 text-slate-500">Data</th>
                  <th className="px-4 py-3 text-slate-500">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      Caricamento in corso...
                    </td>
                  </tr>
                ) : filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      Nessun lead corrispondente.
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => (
                    <tr key={lead.id} className="rounded-[28px] border border-slate-200 bg-slate-50">
                      <td className="px-4 py-4 font-semibold text-slate-900">{lead.customer_name ?? "-"}</td>
                      <td className="px-4 py-4 text-slate-700">{lead.customer_phone ?? "-"}</td>
                      <td className="px-4 py-4 text-slate-700">{lead.customer_email ?? "-"}</td>
                      <td className="px-4 py-4 text-slate-700">{lead.vehicle_id ?? "-"}</td>
                      <td className="px-4 py-4 text-slate-700">{lead.source ?? "-"}</td>
                      <td className="px-4 py-4 text-slate-700">{lead.status ?? "-"}</td>
                      <td className="px-4 py-4 text-slate-700">{formatDate(lead.created_at)}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-3xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                          >
                            Visualizza
                          </button>
                          <button
                            type="button"
                            className="rounded-3xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                          >
                            Modifica
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(lead.id)}
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
        </div>
      </div>
    </main>
  );
}
