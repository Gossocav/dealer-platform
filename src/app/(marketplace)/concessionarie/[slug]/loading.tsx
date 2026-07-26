import { Bar, VehicleCardGrid } from "@/components/marketplace/skeletons";

export default function ConcessionarieDetailLoading() {
  return (
    <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <section className="rounded-[36px] border border-white/10 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 px-8 py-10 sm:px-10 sm:py-12 lg:px-12 lg:py-14">
          <Bar className="h-4 w-32" />
          <Bar className="mt-4 h-10 w-2/3" />
        </section>

        <section className="flex flex-col gap-5 rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <Bar className="h-6 w-56" />
          <Bar className="h-10 w-40" />
        </section>

        <VehicleCardGrid count={6} className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" />
      </div>
    </main>
  );
}
