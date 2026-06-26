export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-7xl">
        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/40 sm:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-blue-600">
                Dealer Hub
              </p>
              <h1 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">
                Dashboard concessionario
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                Una panoramica professionale delle performance della tua concessionaria e delle attività più recenti.
              </p>
            </div>
            <button className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200">
              Inserisci veicolo
            </button>
          </div>

          <div className="mt-10 grid gap-6 xl:grid-cols-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Veicoli pubblicati</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900">128</p>
              <p className="mt-2 text-sm text-slate-500">Nuovi 14 questa settimana</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Lead ricevuti</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900">42</p>
              <p className="mt-2 text-sm text-slate-500">26 contatti caldi</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Piano attivo</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900">Elite</p>
              <p className="mt-2 text-sm text-slate-500">Fatturazione mensile</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-500">Stato account</p>
              <p className="mt-4 text-3xl font-semibold text-emerald-600">Attivo</p>
              <p className="mt-2 text-sm text-slate-500">Nessuna anomalia rilevata</p>
            </div>
          </div>

          <section className="mt-10 rounded-[28px] border border-slate-200 bg-slate-50 p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">Attività recenti</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Le ultime azioni svolte dalla tua concessionaria, tracciate in ordine cronologico.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200">
                Ultime 7 giorni
              </span>
            </div>

            <div className="mt-8 space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Nuovo lead acquisito</p>
                    <p className="mt-2 text-sm text-slate-500">Mario Rossi ha richiesto informazioni su una berlina premium.</p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
                    Lead
                  </span>
                </div>
                <p className="mt-4 text-xs uppercase tracking-[0.22em] text-slate-400">2 ore fa</p>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Veicolo pubblicato</p>
                    <p className="mt-2 text-sm text-slate-500">Inserito nuovo SUV con 6 foto e descrizione dettagliata.</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
                    Pubblicato
                  </span>
                </div>
                <p className="mt-4 text-xs uppercase tracking-[0.22em] text-slate-400">1 giorno fa</p>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Pagamento piano</p>
                    <p className="mt-2 text-sm text-slate-500">Fattura del piano Elite generata correttamente.</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                    Fatturazione
                  </span>
                </div>
                <p className="mt-4 text-xs uppercase tracking-[0.22em] text-slate-400">3 giorni fa</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
