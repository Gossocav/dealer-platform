import { LayoutGrid, Search, SlidersHorizontal, Table2 } from "lucide-react";
import type { LeadFilters, LeadPriority, LeadSource, LeadStage } from "@/lib/mock/leads";

type ViewMode = "kanban" | "table";

type LeadsToolbarProps = {
  filters: LeadFilters;
  onFiltersChange: (next: LeadFilters) => void;
  vehicleOptions: string[];
  sourceOptions: LeadSource[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
};

const stageOptions: Array<{ value: "all" | LeadStage; label: string }> = [
  { value: "all", label: "Tutti gli stati" },
  { value: "new", label: "Nuovo" },
  { value: "contacted", label: "Contattato" },
  { value: "quote", label: "Preventivo" },
  { value: "negotiation", label: "Trattativa" },
  { value: "won", label: "Venduto" },
  { value: "lost", label: "Perso" },
];

const priorityOptions: Array<{ value: "all" | LeadPriority; label: string }> = [
  { value: "all", label: "Tutte le priorita" },
  { value: "alta", label: "Alta" },
  { value: "media", label: "Media" },
  { value: "bassa", label: "Bassa" },
];

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
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-300"
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

export function LeadsToolbar({
  filters,
  onFiltersChange,
  vehicleOptions,
  sourceOptions,
  viewMode,
  onViewModeChange,
}: LeadsToolbarProps) {
  return (
    <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Ricerca e filtri lead</h2>
          <p className="text-sm text-slate-500">Usa filtri multipli e cambia vista tra Kanban e Tabella.</p>
        </div>

        <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => onViewModeChange("kanban")}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              viewMode === "kanban" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            Kanban
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
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Ricerca lead</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={filters.query}
              onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })}
              placeholder="Cerca cliente, email, telefono, veicolo"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-700 outline-none transition focus:border-sky-300"
            />
          </span>
        </label>

        <SelectField
          label="Stato"
          value={filters.stage}
          options={stageOptions}
          onChange={(next) => onFiltersChange({ ...filters, stage: next as LeadFilters["stage"] })}
        />

        <SelectField
          label="Veicolo"
          value={filters.vehicle}
          options={[{ value: "all", label: "Tutti i veicoli" }, ...vehicleOptions.map((item) => ({ value: item, label: item }))]}
          onChange={(next) => onFiltersChange({ ...filters, vehicle: next })}
        />

        <SelectField
          label="Sorgente"
          value={filters.source}
          options={[{ value: "all", label: "Tutte le sorgenti" }, ...sourceOptions.map((item) => ({ value: item, label: item }))]}
          onChange={(next) => onFiltersChange({ ...filters, source: next as LeadFilters["source"] })}
        />

        <SelectField
          label="Priorita"
          value={filters.priority}
          options={priorityOptions}
          onChange={(next) => onFiltersChange({ ...filters, priority: next as LeadFilters["priority"] })}
        />

        <div className="flex items-end md:col-span-2 xl:col-span-4">
          <button
            type="button"
            onClick={() =>
              onFiltersChange({
                query: "",
                stage: "all",
                vehicle: "all",
                source: "all",
                priority: "all",
              })
            }
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Reset filtri
          </button>
        </div>
      </div>
    </section>
  );
}
