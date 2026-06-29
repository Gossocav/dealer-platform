import type { LeadStatusPoint } from "@/lib/mock/dashboard";

type LeadStatusChartProps = {
  points: LeadStatusPoint[];
};

export function LeadStatusChart({ points }: LeadStatusChartProps) {
  const total = points.reduce((sum, point) => sum + point.value, 0);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-full bg-slate-100">
        <div className="flex h-4 w-full">
          {points.map((point) => {
            const width = `${(point.value / total) * 100}%`;
            return <span key={point.label} className={`${point.colorClass} h-full`} style={{ width }} />;
          })}
        </div>
      </div>

      <ul className="space-y-2.5">
        {points.map((point) => {
          const percentage = ((point.value / total) * 100).toFixed(1);
          return (
            <li key={point.label} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className={`inline-flex h-2.5 w-2.5 rounded-full ${point.colorClass}`} />
                <span className="font-medium text-slate-700">{point.label}</span>
              </div>
              <span className="font-semibold text-slate-900">{point.value} ({percentage}%)</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}