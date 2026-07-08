export default function AccountSospesoPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-600">Stato account</p>
        <h1 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Account sospeso</h1>
        <p className="mt-4 text-base leading-7 text-slate-700">
          Il tuo account è stato sospeso. Per assistenza contatta support@dealerplatform.it.
        </p>
        <div className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-slate-700">
          <p>
            Stato attuale: <span className="font-semibold text-slate-900">account sospeso</span>
          </p>
          <p>
            Assistenza: <a className="font-semibold text-blue-700 underline" href="mailto:support@dealerplatform.it">support@dealerplatform.it</a>
          </p>
        </div>
      </section>
    </main>
  );
}
