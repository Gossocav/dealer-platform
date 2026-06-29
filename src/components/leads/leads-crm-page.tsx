"use client";

import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { LeadsKanbanBoard } from "@/components/leads/leads-kanban-board";
import { LeadsKpiGrid } from "@/components/leads/leads-kpi-grid";
import { LeadsTable } from "@/components/leads/leads-table";
import { LeadsToolbar } from "@/components/leads/leads-toolbar";
import { defaultLeadFilters, filterLeads, leadKpis, leadsMock, leadOptionSets } from "@/lib/mock/leads";

type ViewMode = "kanban" | "table";

export function LeadsCrmPage() {
  const [filters, setFilters] = useState(defaultLeadFilters);
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");

  const kpis = useMemo(() => leadKpis(leadsMock), []);
  const optionSets = useMemo(() => leadOptionSets(leadsMock), []);
  const filteredLeads = useMemo(() => filterLeads(leadsMock, filters), [filters]);

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
            {filteredLeads.length} lead in vista corrente
          </div>
        </div>
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

      {viewMode === "kanban" ? <LeadsKanbanBoard items={filteredLeads} /> : <LeadsTable items={filteredLeads} />}
    </DealerDashboardShell>
  );
}
