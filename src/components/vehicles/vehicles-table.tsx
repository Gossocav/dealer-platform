import { ArrowDownAZ, ArrowUpAZ, Copy, Eye, Pencil, Rocket, Trash2 } from "lucide-react";
import Link from "next/link";
import { formatDate, type VehicleListItem, type VehicleSortState } from "@/lib/vehicles";

type VehiclesTableProps = {
  items: VehicleListItem[];
  sort: VehicleSortState;
  selectedVehicleIds: string[];
  allVisibleSelected: boolean;
  onToggleSelect: (vehicleId: string) => void;
  onToggleSelectAll: () => void;
  onSortChange: (field: VehicleSortState["field"]) => void;
  onDuplicate: (vehicleId: string) => void;
  onTogglePublished: (vehicle: VehicleListItem) => void;
  onDelete: (vehicleId: string) => void;
  busyVehicleId: string | null;
};

function statusClasses(status: VehicleListItem["status"]) {
  if (status === "published") return "bg-emerald-100 text-emerald-700";
  if (status === "sold") return "bg-slate-200 text-slate-700";
  if (status === "draft") return "bg-amber-100 text-amber-700";
  return "bg-blue-100 text-blue-700";
}

function SortHeader({
  label,
  field,
  sort,
  onSortChange,
}: {
  label: string;
  field: VehicleSortState["field"];
  sort: VehicleSortState;
  onSortChange: (field: VehicleSortState["field"]) => void;
}) {
  const isActive = sort.field === field;

  return (
    <button
      type="button"
      onClick={() => onSortChange(field)}
      className="inline-flex items-center gap-1 text-left font-semibold text-slate-500 hover:text-slate-700"
    >
      {label}
      {isActive ? (
        sort.direction === "asc" ? <ArrowUpAZ className="h-3.5 w-3.5" /> : <ArrowDownAZ className="h-3.5 w-3.5" />
      ) : null}
    </button>
  );
}

export function VehiclesTable({
  items,
  sort,
  selectedVehicleIds,
  allVisibleSelected,
  onToggleSelect,
  onToggleSelectAll,
  onSortChange,
  onDuplicate,
  onTogglePublished,
  onDelete,
  busyVehicleId,
}: VehiclesTableProps) {
  return (
    <section className="dashboard-fade-up overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)]">
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full border-separate border-spacing-y-2 p-2 text-sm">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={onToggleSelectAll}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                  aria-label="Seleziona tutti i veicoli visibili"
                />
              </th>
              <th className="px-3 py-2 text-left">
                <SortHeader label="Veicolo" field="brand" sort={sort} onSortChange={onSortChange} />
              </th>
              <th className="px-3 py-2 text-left">
                <SortHeader label="Anno" field="year" sort={sort} onSortChange={onSortChange} />
              </th>
              <th className="px-3 py-2 text-left">
                <SortHeader label="Prezzo" field="price" sort={sort} onSortChange={onSortChange} />
              </th>
              <th className="px-3 py-2 text-left">
                <SortHeader label="Stato" field="status" sort={sort} onSortChange={onSortChange} />
              </th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Badge</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Lead</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Visualizzazioni</th>
              <th className="px-3 py-2 text-left">
                <SortHeader label="Inserimento" field="created_at" sort={sort} onSortChange={onSortChange} />
              </th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {items.map((vehicle) => {
              const isBusy = busyVehicleId === vehicle.id;
              const isSelected = selectedVehicleIds.includes(vehicle.id);

              return (
                <tr key={vehicle.id} className="rounded-2xl bg-slate-50 text-slate-700">
                  <td className="rounded-l-2xl px-3 py-3 align-top">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(vehicle.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                      aria-label={`Seleziona ${vehicle.brand} ${vehicle.model}`}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      {vehicle.mainImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={vehicle.mainImageUrl} alt={vehicle.model} className="h-14 w-20 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-14 w-20 items-center justify-center rounded-lg bg-slate-200 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                          N/A
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-slate-900">
                          {vehicle.brand} {vehicle.model}
                        </p>
                        <p className="text-xs text-slate-500">{vehicle.version}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">{vehicle.year}</td>
                  <td className="px-3 py-3 font-semibold text-slate-900">{vehicle.priceLabel}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(vehicle.status)}`}>
                      {vehicle.statusLabel}
                    </span>
                  </td>
                  <td className="px-3 py-3">{vehicle.badge}</td>
                  <td className="px-3 py-3">{vehicle.leadCount}</td>
                  <td className="px-3 py-3">{vehicle.viewsCount}</td>
                  <td className="px-3 py-3">{formatDate(vehicle.insertedAt)}</td>
                  <td className="rounded-r-2xl px-3 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Link
                        href={`/veicoli/${vehicle.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <Eye className="h-3.5 w-3.5" /> Visualizza
                      </Link>
                      <Link
                        href={`/veicoli/modifica/${vehicle.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Modifica
                      </Link>
                      <button
                        type="button"
                        onClick={() => onDuplicate(vehicle.id)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Copy className="h-3.5 w-3.5" /> Duplica
                      </button>
                      <button
                        type="button"
                        onClick={() => onTogglePublished(vehicle)}
                        disabled={isBusy || vehicle.status === "sold"}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Rocket className="h-3.5 w-3.5" /> {vehicle.status === "published" ? "Bozza" : "Pubblica"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(vehicle.id)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Elimina
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
