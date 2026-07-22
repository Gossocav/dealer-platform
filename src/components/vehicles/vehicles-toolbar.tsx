import { Funnel, LayoutGrid, Search, SlidersHorizontal, Table2 } from "lucide-react";
import type { VehicleFilters } from "@/lib/vehicles";

type ViewMode = "card" | "table";

type VehiclesToolbarProps = {
  filters: VehicleFilters;
  onFiltersChange: (next: VehicleFilters) => void;
  options: {
    brands: string[];
    models: string[];
    fuelTypes: string[];
    transmissionTypes: string[];
  };
  statusOptions: ReadonlyArray<{ value: string; label: string }>;
  priceBandOptions: ReadonlyArray<{ value: string; label: string }>;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
};

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (next: string) => void;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-300"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function VehiclesToolbar({
  filters,
  onFiltersChange,
  options,
  statusOptions,
  priceBandOptions,
  viewMode,
  onViewModeChange,
}: VehiclesToolbarProps) {
  return (
    <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Ricerca e filtri</h2>
          <p className="text-sm text-slate-500">Trova rapidamente i veicoli e passa tra card e tabella.</p>
        </div>

        <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => onViewModeChange("card")}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              viewMode === "card" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            Card
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("table")}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              viewMode === "table" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Table2 className="h-4 w-4" />
            Tabella
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="md:col-span-2 xl:col-span-4 block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Ricerca istantanea</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={filters.query}
              onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })}
              placeholder="Cerca per marca, modello o versione"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-700 outline-none transition focus:border-blue-300"
            />
          </span>
        </label>

        <SelectField
          label="Marca"
          value={filters.brand}
          options={[{ value: "all", label: "Tutte le marche" }, ...options.brands.map((item) => ({ value: item, label: item }))]}
          onChange={(next) => onFiltersChange({ ...filters, brand: next, model: "all" })}
        />

        <SelectField
          label="Modello"
          value={filters.model}
          options={[{ value: "all", label: "Tutti i modelli" }, ...options.models.map((item) => ({ value: item, label: item }))]}
          onChange={(next) => onFiltersChange({ ...filters, model: next })}
        />

        <SelectField
          label="Alimentazione"
          value={filters.fuel}
          options={[{ value: "all", label: "Tutte" }, ...options.fuelTypes.map((item) => ({ value: item, label: item }))]}
          onChange={(next) => onFiltersChange({ ...filters, fuel: next })}
        />

        <SelectField
          label="Cambio"
          value={filters.transmission}
          options={[
            { value: "all", label: "Tutti" },
            ...options.transmissionTypes.map((item) => ({ value: item, label: item })),
          ]}
          onChange={(next) => onFiltersChange({ ...filters, transmission: next })}
        />

        <SelectField
          label="Stato"
          value={filters.status}
          options={[...statusOptions]}
          onChange={(next) => onFiltersChange({ ...filters, status: next })}
        />

        <SelectField
          label="Fascia prezzo"
          value={filters.priceBand}
          options={[...priceBandOptions]}
          onChange={(next) => onFiltersChange({ ...filters, priceBand: next })}
        />

        <div className="flex items-end gap-2 md:col-span-2 xl:col-span-2">
          <button
            type="button"
            onClick={() =>
              onFiltersChange({
                query: "",
                brand: "all",
                model: "all",
                fuel: "all",
                transmission: "all",
                status: "all",
                priceBand: "all",
              })
            }
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Reset filtri
          </button>
          <div className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-50 px-4 text-sm font-medium text-blue-700">
            <Funnel className="h-4 w-4" />
            Filtri attivi
          </div>
        </div>
      </div>
    </section>
  );
}
