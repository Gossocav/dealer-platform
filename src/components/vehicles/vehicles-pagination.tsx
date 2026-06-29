type VehiclesPaginationProps = {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
};

export function VehiclesPagination({ page, pageSize, totalCount, onPageChange }: VehiclesPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;

  return (
    <section className="dashboard-fade-up flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200/70 bg-white p-4 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)]">
      <p className="text-sm text-slate-600">
        Pagina <span className="font-semibold text-slate-900">{page}</span> di <span className="font-semibold text-slate-900">{totalPages}</span>
      </p>

      <div className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={!canGoPrev}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Precedente
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!canGoNext}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Successiva
        </button>
      </div>
    </section>
  );
}
