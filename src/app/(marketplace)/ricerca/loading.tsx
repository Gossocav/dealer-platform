import { Bar, VehicleCardGrid } from "@/components/marketplace/skeletons";

export default function RicercaLoading() {
  return (
    <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Bar className="h-8 w-48" />
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Bar key={index} className="h-11" />
          ))}
        </div>
        <div className="mt-6">
          <VehicleCardGrid count={8} className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" />
        </div>
      </div>
    </main>
  );
}
