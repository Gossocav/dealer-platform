import { Bar, VehicleCardGrid } from "@/components/marketplace/skeletons";

export default function AutoLoading() {
  return (
    <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Bar className="h-8 w-56" />
        <div className="mt-6">
          <VehicleCardGrid count={9} />
        </div>
      </div>
    </main>
  );
}
