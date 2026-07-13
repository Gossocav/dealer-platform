import Link from "next/link";

export default function AccountDemoScadutaPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-600">Stato account</p>
        <h1 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">La tua Demo e scaduta</h1>
        <p className="mt-4 text-base leading-7 text-slate-700">
          Il periodo di prova di 7 giorni e terminato.
          <br />
          I tuoi dati sono stati conservati.
          <br />
          Contattaci per attivare la versione completa.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a
            href="mailto:support@dealerplatform.it"
            className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Attiva la versione completa
          </a>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Torna al Login
          </Link>
        </div>
      </section>
    </main>
  );
}
