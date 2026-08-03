import Link from "next/link";

// Senza questo file la pagina cadeva sul 404 di serie di Next: fondo bianco,
// dentro un sito nero, e scritto in inglese ("This page could not be found").
export default function DealerNotFound() {
  return (
    <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <section className="rounded-[36px] border border-white/10 bg-gradient-to-b from-slate-800/80 to-slate-950 px-8 py-10 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)] sm:px-10 sm:py-12">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-300">Concessionaria</p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight">Concessionaria non trovata</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-400">
            Questa concessionaria non è più presente sul marketplace, oppure il link non è più valido.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/concessionarie"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-6 py-3 text-sm font-bold text-slate-950 shadow-[0_16px_40px_-14px_rgba(76,130,247,0.8)] transition hover:brightness-105"
            >
              Vedi tutte le concessionarie
            </Link>
            <Link
              href="/auto"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/50 hover:bg-cyan-400/10"
            >
              Sfoglia il catalogo
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
