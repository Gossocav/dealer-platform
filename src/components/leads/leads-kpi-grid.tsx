import { CircleCheck, CircleDashed, Handshake, PhoneCall, type LucideIcon } from "lucide-react";
import type { LeadKpi } from "@/lib/leads";

type LeadsKpiGridProps = {
  items: LeadKpi[];
};

const kpiIcons: Record<string, LucideIcon> = {
  new: CircleDashed,
  "to-contact": PhoneCall,
  open: Handshake,
  won: CircleCheck,
};

export function LeadsKpiGrid({ items }: LeadsKpiGridProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = kpiIcons[item.id] ?? CircleDashed;

        return (
          <article
            key={item.id}
            className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{item.value}</p>
                <p className="mt-2 text-sm text-slate-500">{item.delta}</p>
              </div>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <Icon className="h-5 w-5" />
              </span>
            </div>
          </article>
        );
      })}
    </section>
  );
}
