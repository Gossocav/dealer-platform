import type { LucideIcon } from "lucide-react";

type MetricCardProps = {
  label: string;
  value: string;
  delta: string;
  tone: "positive" | "neutral";
  icon: LucideIcon;
};

export function MetricCard({ label, value, delta, tone, icon: Icon }: MetricCardProps) {
  return (
    <article className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.45)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-18px_rgba(15,23,42,0.38)] sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className={`mt-4 text-xs font-semibold uppercase tracking-[0.14em] ${tone === "positive" ? "text-emerald-600" : "text-slate-500"}`}>{delta}</p>
    </article>
  );
}