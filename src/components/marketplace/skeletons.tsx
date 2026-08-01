// Shared building blocks for the marketplace's loading.tsx files. Each
// mirrors the exact shape (rounding, aspect ratio, spacing) of the real
// component it stands in for, so the page doesn't visibly jump when the
// real content replaces it once data has loaded.

export function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-full bg-white/10 ${className}`} />;
}

export function VehicleCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-b from-slate-800/70 to-slate-900">
      <div className="aspect-[16/9] animate-pulse bg-slate-800/60" />
      <div className="space-y-4 p-5">
        <Bar className="h-5 w-3/4" />
        <div className="flex flex-wrap gap-2">
          <Bar className="h-6 w-16" />
          <Bar className="h-6 w-20" />
          <Bar className="h-6 w-14" />
        </div>
        <div className="border-t border-white/10 pt-4">
          <Bar className="h-6 w-24" />
        </div>
      </div>
    </div>
  );
}

export function DealerCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/70 to-slate-900">
      <div className="h-52 animate-pulse bg-slate-800/60" />
      <div className="space-y-4 p-5">
        <Bar className="h-4 w-40" />
        <Bar className="h-6 w-3/4" />
        <Bar className="h-4 w-1/2" />
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Bar className="h-10" />
          <Bar className="h-10" />
        </div>
      </div>
    </div>
  );
}

export function VehicleCardGrid({
  count,
  className = "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3",
}: {
  count: number;
  className?: string;
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, index) => (
        <VehicleCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function DealerCardGrid({ count }: { count: number }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <DealerCardSkeleton key={index} />
      ))}
    </div>
  );
}
