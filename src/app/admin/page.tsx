import Link from "next/link";

export default function AdminHomePage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-blue-600">Platform Owner</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">Dashboard Piattaforma</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Area amministrativa separata dalla console concessionario. Da qui puoi gestire i processi globali della piattaforma.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/admin/dealer-approval"
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Dealer</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">Approvazione Dealer</h2>
            <p className="mt-2 text-sm text-slate-600">Valuta e approva le nuove richieste concessionario in stato pending_review.</p>
          </Link>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Panoramica</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">Controllo piattaforma</h2>
            <p className="mt-2 text-sm text-slate-600">Sezione riservata ai ruoli admin/platform_owner.</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Sicurezza</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">Accesso isolato</h2>
            <p className="mt-2 text-sm text-slate-600">Gli utenti dealer continuano a usare esclusivamente l'area /login e /dashboard.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
