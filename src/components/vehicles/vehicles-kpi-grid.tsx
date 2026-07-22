import { CarFront, FileText, Target, Users } from "lucide-react";
import type { VehicleKpi } from "@/lib/vehicles";

type VehiclesKpiGridProps = {
  items: VehicleKpi[];
};

const icons = [CarFront, FileText, Target, Users] as const;

export function VehiclesKpiGrid({ items }: VehiclesKpiGridProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => {
        const Icon = icons[index];

        return (
          <article
            key={item.id}
            className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-500">{item.label}</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{item.value}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.12em] text-emerald-600">{item.delta}</p>
              </div>
              {Icon ? (
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Icon className="h-5 w-5" />
                </span>
              ) : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}
