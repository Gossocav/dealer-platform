import { Bar, DealerCardGrid } from "@/components/marketplace/skeletons";

export default function ConcessionarieLoading() {
  return (
    <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Bar className="h-8 w-64" />
        <div className="mt-6">
          <DealerCardGrid count={6} />
        </div>
      </div>
    </main>
  );
}
