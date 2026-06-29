"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { LeadsKanbanBoard } from "@/components/leads/leads-kanban-board";
import { LeadsKpiGrid } from "@/components/leads/leads-kpi-grid";
import { LeadsTable } from "@/components/leads/leads-table";
import { LeadsToolbar } from "@/components/leads/leads-toolbar";
import { resolveDealerIdForUser } from "@/lib/dealer-association";
import {
  buildLeadSelectClause,
  defaultLeadFilters,
  detectLeadOptionalColumns,
  filterLeads,
  leadKpis,
  leadOptionSets,
  mapStageToDbStatus,
  toLeadItems,
  vehicleLabelMap,
  type LeadItem,
  type LeadRecord,
  type LeadStage,
  type VehicleOptionRow,
} from "@/lib/leads";
import { supabase } from "@/lib/supabaseClient";

type ViewMode = "kanban" | "table";

export function LeadsCrmPage() {
  const [items, setItems] = useState<LeadItem[]>([]);
  const [filters, setFilters] = useState(defaultLeadFilters);
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingLeadId, setPendingLeadId] = useState<string | null>(null);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message || "Impossibile leggere utente autenticato.");

      const userId = authData.user?.id;
      if (!userId) {
        setItems([]);
        setError("Sessione non valida. Effettua di nuovo il login.");
        return;
      }

      const dealerId = await resolveDealerIdForUser(userId);
      if (!dealerId) {
        setItems([]);
        setError("Concessionaria non associata all'utente.");
        return;
      }

      const { data: dealerVehicles, error: vehiclesError } = await supabase
        .from("vehicles")
        .select("id, brand, model, version, year")
        .eq("dealer_id", dealerId)
        .returns<VehicleOptionRow[]>();

      if (vehiclesError) {
        throw new Error(vehiclesError.message || "Errore caricamento veicoli concessionaria.");
      }

      const vehicleRows = dealerVehicles ?? [];
      const vehicleIds = vehicleRows.map((vehicle) => vehicle.id);
      const vehiclesMap = vehicleLabelMap(vehicleRows);

      const support = await detectLeadOptionalColumns(supabase);
      const selectClause = buildLeadSelectClause(support);

      let query = supabase.from("leads").select(selectClause).order("created_at", { ascending: false });

      if (vehicleIds.length > 0) {
        const ids = vehicleIds.map((id) => `"${id}"`).join(",");
        query = query.or(`dealer_id.eq.${dealerId},vehicle_id.in.(${ids})`);
      } else {
        query = query.eq("dealer_id", dealerId);
      }

      const { data: rawLeads, error: leadsError } = await query.returns<LeadRecord[]>();

      if (leadsError) {
        throw new Error(leadsError.message || "Errore caricamento lead.");
      }

      const normalized = toLeadItems(rawLeads ?? [], vehiclesMap);
      setItems(normalized);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Errore imprevisto nel caricamento lead.";
      setError(message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  const onStageChange = useCallback(
    async (leadId: string, nextStage: LeadStage) => {
      const dbStatus = mapStageToDbStatus(nextStage);
      const previous = items;

      setPendingLeadId(leadId);
      setItems((current) => current.map((lead) => (lead.id === leadId ? { ...lead, stage: nextStage } : lead)));

      const { error: updateError } = await supabase.from("leads").update({ status: dbStatus }).eq("id", leadId);

      if (updateError) {
        setItems(previous);
        setError(updateError.message || "Errore durante aggiornamento stato lead.");
      }

      setPendingLeadId(null);
    },
    [items]
  );

  const kpis = useMemo(() => leadKpis(items), [items]);
  const optionSets = useMemo(() => leadOptionSets(items), [items]);
  const filteredLeads = useMemo(() => filterLeads(items, filters), [items, filters]);

  return (
    <DealerDashboardShell
      title="CRM Lead"
      dealerName="Gossocar Premium Motors"
      avatarInitials="GP"
      unreadNotifications={3}
    >
      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Sales Pipeline</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">CRM Lead</h2>
            <p className="mt-2 text-sm text-slate-600">Gestisci priorita commerciali, follow-up e conversione in un unico flusso.</p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-xl bg-sky-50 px-4 py-2.5 text-sm font-medium text-sky-700">
            <Inbox className="h-4 w-4" />
            {loading ? "Caricamento lead..." : `${filteredLeads.length} lead in vista corrente`}
          </div>
        </div>
        {error ? <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      </section>

      <LeadsKpiGrid items={kpis} />

      <LeadsToolbar
        filters={filters}
        onFiltersChange={setFilters}
        vehicleOptions={optionSets.vehicles}
        sourceOptions={optionSets.sources}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {viewMode === "kanban" ? (
        <LeadsKanbanBoard items={filteredLeads} onStageChange={onStageChange} pendingLeadId={pendingLeadId} />
      ) : (
        <LeadsTable items={filteredLeads} onStageChange={onStageChange} pendingLeadId={pendingLeadId} />
      )}
    </DealerDashboardShell>
  );
}
