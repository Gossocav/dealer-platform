import Link from "next/link";

export default function RegistrazionePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-slate-100 px-4 py-12 sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-5xl rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_40px_120px_-40px_rgba(15,23,42,0.25)] sm:p-8 lg:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-600">Accesso Dealer</p>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Richiedi la tua Demo gratuita di 7 giorni</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
          Scopri Dealer Platform con un accesso dimostrativo riservato ai professionisti del settore automotive.
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
          Dopo la richiesta il nostro team verifichera i dati e attivera il tuo account.
        </p>

        <section className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-6 sm:p-7">
          <h2 className="text-2xl font-semibold text-slate-900">Richiedi Demo</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Invia la richiesta per ottenere 7 giorni di prova guidata. Login, recupero password e inviti admin restano attivi per gli account gia abilitati.
          </p>
          <Link
            href="/demo"
            className="mt-5 inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
          >
            Richiedi Demo
          </Link>
          <p className="mt-4 text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
            Nessun impegno. Nessuna registrazione automatica. Attivazione previa verifica.
          </p>
        </section>
      </section>
    </main>
  );
}
