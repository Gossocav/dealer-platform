import { Bar, VehicleCardGrid } from "@/components/marketplace/skeletons";

export default function HomeLoading() {
  return (
    <main className="bg-slate-950">
      <section className="px-4 pb-20 pt-16 sm:px-6 sm:pt-20 lg:px-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
          <Bar className="h-7 w-64" />
          <Bar className="h-12 w-full max-w-xl" />
          <Bar className="h-5 w-full max-w-lg" />
          <div className="mt-2 h-20 w-full max-w-3xl animate-pulse rounded-[28px] bg-white/5" />
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Bar className="h-6 w-48" />
          <div className="mt-6">
            <VehicleCardGrid count={6} />
          </div>
        </div>
      </section>
    </main>
  );
}
