import Link from "next/link";

// Prima questa schermata veniva disegnata dalla pagina stessa, che pero'
// rispondeva "200 OK": per Google un annuncio venduto restava una pagina viva
// e vuota, da ripassare all'infinito. Spostata qui, la stessa grafica arriva
// con un vero 404.
export default function VehicleNotFound() {
  return (
    <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <section className="rounded-[36px] border border-white/10 bg-gradient-to-b from-slate-800/80 to-slate-950 px-8 py-10 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)] sm:px-10 sm:py-12">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-300">Scheda veicolo</p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight">Veicolo non disponibile</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-400">
            Il veicolo che cerchi non è più disponibile o potrebbe non essere ancora pubblicato.
          </p>
        </section>
        <div className="rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-8">
          <div className="flex flex-col items-center gap-5 py-8 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/5 text-slate-500">
              <svg viewBox="0 0 64 64" aria-hidden="true" className="h-10 w-10 fill-current opacity-60">
                <path d="M12 18a8 8 0 0 0-8 8v13a8 8 0 0 0 8 8h4a7 7 0 0 0 14 0h4a7 7 0 0 0 14 0h4a8 8 0 0 0 8-8V26a8 8 0 0 0-8-8h-4.6a3 3 0 0 1-2.5-1.3l-1.8-2.8A6 6 0 0 0 38 12H26a6 6 0 0 0-5 2.7l-1.8 2.8A3 3 0 0 1 16.6 19H12Zm10 25a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm20 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-semibold text-white">Annuncio non trovato</p>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
                Il veicolo potrebbe essere stato rimosso, venduto o il link non è più valido.
              </p>
            </div>
            <Link
              href="/auto"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-6 py-3 text-sm font-bold text-slate-950 shadow-[0_16px_40px_-14px_rgba(76,130,247,0.8)] transition hover:brightness-105"
            >
              Sfoglia il catalogo
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
