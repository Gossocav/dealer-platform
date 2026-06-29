import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.16),_transparent_40%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_52%,_#f1f5f9_100%)] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <section className="overflow-hidden rounded-[40px] border border-slate-200 bg-slate-950 shadow-[0_40px_120px_-40px_rgba(15,23,42,0.55)]">
          <div className="relative px-8 py-12 sm:px-10 sm:py-14 lg:px-14 lg:py-18">
            <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:32px_32px]" />
            <div className="relative max-w-4xl">
              <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold tracking-[0.18em] text-white/90">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xs font-bold text-slate-950">DP</span>
                MARKETPLACE
              </div>

              <h1 className="mt-8 text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
                Trova la tua prossima auto
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                Esplora il marketplace pubblico premium di Dealer Platform e scopri i veicoli pubblicati dalle concessionarie partner.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/auto"
                  className="inline-flex items-center justify-center rounded-3xl bg-white px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-black/10 transition hover:bg-slate-100"
                >
                  Sfoglia auto
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-3xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Accedi concessionaria
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
