import { VehiclesImportPage } from "@/components/vehicles/vehicles-import-page";

export default function VehiclesImportRoutePage() {
  return (
    <div className="space-y-6">
      <VehiclesImportPage />

      <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">🌐 Importazione automatica</h2>
          <p className="mt-1 text-sm text-slate-600">Configura un feed per preparare la sincronizzazione del tuo stock veicoli.</p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(220px,0.8fr)_auto]">
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">URL Feed</span>
            <input
              type="url"
              placeholder="https://www.concessionaria.it/feed.xml"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Tipo Feed</span>
            <select className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300">
              <option value="csv">CSV</option>
              <option value="xml">XML</option>
              <option value="json">JSON</option>
            </select>
          </label>

          <div className="flex items-end">
            <button type="button" className="h-11 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800">
              Verifica Feed
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
