import type { SeriesPoint } from "@/lib/mock/dashboard";

type LeadTrendChartProps = {
  points: SeriesPoint[];
};

export function LeadTrendChart({ points }: LeadTrendChartProps) {
  const maxValue = Math.max(...points.map((point) => point.value), 1);

  return (
    <div>
      <div className="flex h-52 items-end gap-2 rounded-2xl bg-slate-50 p-4 sm:gap-3">
        {points.map((point) => {
          const height = `${Math.max((point.value / maxValue) * 100, 8)}%`;
          return (
            <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <div className="w-full rounded-full bg-sky-500/90 transition duration-300 hover:bg-sky-600" style={{ height }} aria-label={`${point.label}: ${point.value} lead`} />
              <span className="text-[11px] font-semibold text-slate-500">{point.label}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">Andamento lead ultimi 30 giorni</p>
    </div>
  );
}