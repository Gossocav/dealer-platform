import { Copy, Eye, Pencil, Rocket, Trash2 } from "lucide-react";
import Link from "next/link";
import { formatCurrency, formatVehicleStatus, type VehicleInventoryItem } from "@/lib/mock/vehicles";

type VehiclesTableProps = {
  items: VehicleInventoryItem[];
};

function statusClasses(status: VehicleInventoryItem["status"]) {
  if (status === "published") return "bg-emerald-100 text-emerald-700";
  if (status === "sold") return "bg-slate-200 text-slate-700";
  if (status === "draft") return "bg-amber-100 text-amber-700";
  return "bg-sky-100 text-sky-700";
}

export function VehiclesTable({ items }: VehiclesTableProps) {
  return (
    <section className="dashboard-fade-up overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)]">
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full border-separate border-spacing-y-2 p-2 text-sm">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Veicolo</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Anno</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Prezzo</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Stato</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Badge</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Lead</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Visualizzazioni</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Inserimento</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {items.map((vehicle) => (
              <tr key={vehicle.id} className="rounded-2xl bg-slate-50 text-slate-700">
                <td className="rounded-l-2xl px-3 py-3">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={vehicle.mainImage} alt={vehicle.model} className="h-14 w-20 rounded-lg object-cover" />
                    <div>
                      <p className="font-semibold text-slate-900">
                        {vehicle.brand} {vehicle.model}
                      </p>
                      <p className="text-xs text-slate-500">{vehicle.version}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">{vehicle.year}</td>
                <td className="px-3 py-3 font-semibold text-slate-900">{formatCurrency(vehicle.price)}</td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(vehicle.status)}`}>
                    {formatVehicleStatus(vehicle.status)}
                  </span>
                </td>
                <td className="px-3 py-3">{vehicle.badge}</td>
                <td className="px-3 py-3">{vehicle.leads}</td>
                <td className="px-3 py-3">{vehicle.views}</td>
                <td className="px-3 py-3">{new Date(vehicle.insertedAt).toLocaleDateString("it-IT")}</td>
                <td className="rounded-r-2xl px-3 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Link
                      href={`/veicoli/${vehicle.id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      <Eye className="h-3.5 w-3.5" /> Visualizza
                    </Link>
                    <Link
                      href={`/veicoli/nuovo?id=${vehicle.id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Modifica
                    </Link>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      <Copy className="h-3.5 w-3.5" /> Duplica
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      <Rocket className="h-3.5 w-3.5" /> Pubblica
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Elimina
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
