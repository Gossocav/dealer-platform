import Link from "next/link";

export default function MarketplaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.12),_transparent_38%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_52%,_#f1f5f9_100%)] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3 text-sm font-semibold tracking-[0.2em] text-slate-900">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-xs font-bold text-white" suppressHydrationWarning>DP</span>
            <span suppressHydrationWarning>DEALER PLATFORM</span>
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            <NavLink href="/">Home</NavLink>
            <NavLink href="/auto">Auto</NavLink>
            <NavLink href="/ricerca">Ricerca</NavLink>
            <NavLink href="/concessionarie">Concessionarie</NavLink>
            <Link href="/login" className="ml-2 inline-flex items-center justify-center rounded-3xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-950/20 transition hover:bg-slate-800">
              Area dealer
            </Link>
          </nav>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-slate-200 bg-white/80">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-slate-500 sm:px-6 lg:px-8 md:flex-row md:items-center md:justify-between">
          <p>Marketplace pubblico Dealer Platform.</p>
          <p>Veicoli, concessionarie e ricerca avanzata senza autenticazione.</p>
        </div>
      </footer>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-3xl px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
      {children}
    </Link>
  );
}
