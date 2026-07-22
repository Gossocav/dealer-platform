import Link from "next/link";

export default function MarketplaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3 text-sm font-semibold tracking-[0.2em] text-white">
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-xs font-bold text-white shadow-[0_8px_20px_-8px_rgba(76,130,247,0.8)]"
              suppressHydrationWarning
            >
              KA
            </span>
            <span suppressHydrationWarning>KEYAUTO</span>
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            <NavLink href="/">Home</NavLink>
            <NavLink href="/auto">Auto</NavLink>
            <NavLink href="/ricerca">Ricerca</NavLink>
            <NavLink href="/concessionarie">Concessionarie</NavLink>
            <span className="ml-2 flex items-center gap-2 border-l border-white/10 pl-3">
              <Link href="/login" className="inline-flex items-center justify-center rounded-3xl px-4 py-2 text-sm font-semibold text-slate-300 transition hover:text-white">
                Accedi
              </Link>
              <Link href="/registrazione" className="inline-flex items-center justify-center rounded-3xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-blue-400/50 hover:bg-blue-500/10">
                Registrati
              </Link>
            </span>
          </nav>

          {/* Mobile menu: native <details> disclosure, zero JS. Without this,
              every nav item (including Accedi) is unreachable below the md
              breakpoint since the nav above is hidden there. */}
          <details className="group relative md:hidden">
            <summary
              className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-2xl border border-white/15 bg-white/5 text-white [&::-webkit-details-marker]:hidden"
              aria-label="Menu"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[2]" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              </svg>
            </summary>
            <nav className="absolute right-0 top-[calc(100%+10px)] z-50 flex w-56 flex-col gap-1 rounded-2xl border border-white/10 bg-slate-950 p-2 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)]">
              <NavLink href="/">Home</NavLink>
              <NavLink href="/auto">Auto</NavLink>
              <NavLink href="/ricerca">Ricerca</NavLink>
              <NavLink href="/concessionarie">Concessionarie</NavLink>
              <div className="my-1 border-t border-white/10" />
              <Link href="/login" className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white">
                Accedi
              </Link>
              <Link href="/registrazione" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/5">
                Registrati
              </Link>
            </nav>
          </details>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-white/10 bg-slate-950">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-slate-400 sm:px-6 lg:px-8 md:flex-row md:items-center md:justify-between">
          <p>Marketplace pubblico KeyAuto.</p>
          <p>Veicoli, concessionarie e ricerca avanzata senza autenticazione.</p>
        </div>
      </footer>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-3xl px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white">
      {children}
    </Link>
  );
}
