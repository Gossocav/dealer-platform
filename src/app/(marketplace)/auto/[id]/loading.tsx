import { Bar } from "@/components/marketplace/skeletons";

export default function VehicleDetailLoading() {
  return (
    <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-6">
          <Bar className="h-8 w-2/3" />
          <Bar className="mt-3 h-5 w-1/3" />
        </section>

        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
          <div className="min-w-0 space-y-6">
            <div className="overflow-hidden rounded-[32px] border border-white/10 bg-slate-900">
              <div className="h-[460px] animate-pulse bg-slate-800/60" />
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-32 animate-pulse rounded-2xl bg-slate-800/60" />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, index) => (
                <Bar key={index} className="h-16" />
              ))}
            </div>
          </div>

          <aside className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Bar className="h-12 w-40" />
              <Bar className="h-12 w-32" />
            </div>
            <div className="rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-6">
              <Bar className="h-5 w-1/2" />
              <Bar className="mt-4 h-24 w-full" />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
