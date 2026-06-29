"use client";

import Link from "next/link";
import { CarFront, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { VehiclesCardGrid } from "@/components/vehicles/vehicles-card-grid";
import { VehiclesKpiGrid } from "@/components/vehicles/vehicles-kpi-grid";
import { VehiclesTable } from "@/components/vehicles/vehicles-table";
import { VehiclesToolbar } from "@/components/vehicles/vehicles-toolbar";
import {
  defaultVehicleFilters,
  filterVehicles,
  priceBandOptions,
  statusOptions,
  vehicleKpis,
  vehicleOptionSets,
  vehiclesInventoryMock,
} from "@/lib/mock/vehicles";

type ViewMode = "card" | "table";

export function VehiclesManagementPage() {
  const [filters, setFilters] = useState(defaultVehicleFilters);
  const [viewMode, setViewMode] = useState<ViewMode>("card");

  const optionSets = useMemo(() => vehicleOptionSets(vehiclesInventoryMock), []);
  const filteredVehicles = useMemo(() => filterVehicles(vehiclesInventoryMock, filters), [filters]);
  const kpis = useMemo(() => vehicleKpis(vehiclesInventoryMock), []);

  return (
    <DealerDashboardShell
      title="Gestione Veicoli"
      dealerName="Gossocar Premium Motors"
      avatarInitials="GP"
      unreadNotifications={3}
    >
      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Inventory Hub</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Gestisci il tuo parco auto</h2>
            <p className="mt-2 text-sm text-slate-600">
              Ricerca istantanea, filtri evoluti e doppia vista per un controllo operativo completo.
            </p>
          </div>

          <Link
            href="/veicoli/nuovo"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" /> Nuovo Veicolo
          </Link>
        </div>
      </section>

      <VehiclesKpiGrid items={kpis} />

      <VehiclesToolbar
        filters={filters}
        onFiltersChange={setFilters}
        options={optionSets}
        statusOptions={statusOptions}
        priceBandOptions={priceBandOptions}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <section className="dashboard-fade-up rounded-3xl border border-dashed border-slate-300 bg-white/70 px-4 py-3 text-sm text-slate-600">
        <span className="inline-flex items-center gap-2">
          <CarFront className="h-4 w-4 text-sky-600" />
          {filteredVehicles.length} veicoli trovati con i filtri correnti.
        </span>
      </section>

      {viewMode === "card" ? <VehiclesCardGrid items={filteredVehicles} /> : <VehiclesTable items={filteredVehicles} />}
    </DealerDashboardShell>
  );
}
