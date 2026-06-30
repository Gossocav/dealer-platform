import { CalendarDays, Copy, Eye, Gauge, Pencil, Rocket, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { formatDate, type VehicleListItem } from "@/lib/vehicles";

type VehiclesCardGridProps = {
  items: VehicleListItem[];
  onDuplicate: (vehicleId: string) => void;
  onTogglePublished: (vehicle: VehicleListItem) => void;
  onDelete: (vehicleId: string) => void;
  busyVehicleId: string | null;
};

function statusClasses(status: VehicleListItem["status"]) {
  if (status === "published") return "bg-emerald-100 text-emerald-700";
  if (status === "sold") return "bg-slate-200 text-slate-700";
  if (status === "draft") return "bg-amber-100 text-amber-700";
  return "bg-sky-100 text-sky-700";
}

export function VehiclesCardGrid({ items, onDuplicate, onTogglePublished, onDelete, busyVehicleId }: VehiclesCardGridProps) {
  return (
    <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {items.map((vehicle) => {
        const isBusy = busyVehicleId === vehicle.id;

        return (
          <article
            key={vehicle.id}
            className="dashboard-fade-up group overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-16px_rgba(15,23,42,0.4)]"
          >
            <div className="relative h-48 overflow-hidden bg-slate-100">
              {vehicle.mainImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={vehicle.mainImageUrl}
                  alt={`${vehicle.brand} ${vehicle.model}`}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Nessuna foto
                </div>
              )}
              <span className="absolute left-3 top-3 rounded-full bg-slate-900/80 px-3 py-1 text-xs font-semibold text-white">
                {vehicle.badge}
              </span>
              <span className={`absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-semibold ${statusClasses(vehicle.status)}`}>
                {vehicle.statusLabel}
              </span>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <p className="text-lg font-semibold text-slate-900">
                  {vehicle.brand} {vehicle.model}
                </p>
                <p className="text-sm text-slate-500">{vehicle.version}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
                <p className="rounded-xl bg-slate-50 px-3 py-2">
                  <span className="block text-xs uppercase tracking-[0.12em] text-slate-400">Anno</span>
                  {vehicle.year}
                </p>
                <p className="rounded-xl bg-slate-50 px-3 py-2">
                  <span className="block text-xs uppercase tracking-[0.12em] text-slate-400">Prezzo</span>
                  {vehicle.priceLabel}
                </p>
                <p className="rounded-xl bg-slate-50 px-3 py-2">
                  <span className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.12em] text-slate-400">
                    <Users className="h-3.5 w-3.5" /> Lead
                  </span>
                  {vehicle.leadCount}
                </p>
                <p className="rounded-xl bg-slate-50 px-3 py-2">
                  <span className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.12em] text-slate-400">
                    <Gauge className="h-3.5 w-3.5" /> Visualizzazioni
                  </span>
                  {vehicle.viewsCount}
                </p>
              </div>

              <p className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.14em] text-slate-400">
                <CalendarDays className="h-3.5 w-3.5" /> Inserito il {formatDate(vehicle.insertedAt)}
              </p>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <Link
                  href={`/veicoli/${vehicle.id}`}
                  className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <Eye className="h-4 w-4" /> Visualizza
                </Link>
                <Link
                  href={`/veicoli/modifica/${vehicle.id}`}
                  className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <Pencil className="h-4 w-4" /> Modifica
                </Link>
                <button
                  type="button"
                  onClick={() => onDuplicate(vehicle.id)}
                  disabled={isBusy}
                  className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Copy className="h-4 w-4" /> Duplica
                </button>
                <button
                  type="button"
                  onClick={() => onTogglePublished(vehicle)}
                  disabled={isBusy || vehicle.status === "sold"}
                  className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Rocket className="h-4 w-4" /> {vehicle.status === "published" ? "Bozza" : "Pubblica"}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(vehicle.id)}
                  disabled={isBusy}
                  className="col-span-2 inline-flex items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" /> Elimina
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
