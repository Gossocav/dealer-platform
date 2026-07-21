import Link from "next/link";

export default function RegistrazionePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-slate-100 px-4 py-12 sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-5xl rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_40px_120px_-40px_rgba(15,23,42,0.25)] sm:p-8 lg:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-600">Accesso Dealer</p>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Scegli il percorso piu adatto alla tua concessionaria</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
          Seleziona Piano Base, Piano Pro, Piano Elite oppure richiedi la Demo gratuita di 7 giorni.
        </p>

        <div className="mt-8 grid gap-5 lg:grid-cols-4">
          <article className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
            <h2 className="text-2xl font-semibold text-slate-900">Piano Base</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">Ideale per partire con i flussi fondamentali di gestione concessionaria.</p>
            <Link
              href="/registrazione/base"
              className="mt-6 inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
            >
              Vai al Piano Base
            </Link>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
            <h2 className="text-2xl font-semibold text-slate-900">Piano Pro</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">Pensato per concessionarie con maggiore volume operativo e strumenti avanzati.</p>
            <Link
              href="/registrazione/pro"
              className="mt-6 inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
            >
              Vai al Piano Pro
            </Link>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
            <h2 className="text-2xl font-semibold text-slate-900">Piano Elite</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">Tutto il Piano Pro, con in piu la gestione della visibilita social e delle campagne Google Ads.</p>
            <Link
              href="/registrazione/elite"
              className="mt-6 inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
            >
              Vai al Piano Elite
            </Link>
          </article>

          <article className="rounded-3xl border border-cyan-200 bg-cyan-50 p-6">
            <h2 className="text-2xl font-semibold text-slate-900">Demo gratuita</h2>
            <p className="mt-2 text-sm font-medium text-cyan-800">Prova Dealer Platform per 7 giorni</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Accesso dimostrativo riservato ai professionisti automotive, con alcune funzionalita limitate.
            </p>
            <Link
              href="/demo"
              className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-cyan-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-cyan-700"
            >
              Richiedi Demo
            </Link>
          </article>
        </div>
      </section>
    </main>
  );
}
