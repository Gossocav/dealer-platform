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
            <span suppressHydrationWarning>
              KEYAUTO <span className="hidden font-medium tracking-[0.15em] text-slate-400 sm:inline">MARKETPLACE</span>
            </span>
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
        <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-x-6 gap-y-10 px-4 py-14 sm:px-6 lg:grid-cols-5 lg:gap-x-8 lg:px-8">
          <div className="col-span-2 lg:col-span-2">
            <Link href="/" className="flex items-center gap-3 text-sm font-semibold tracking-[0.2em] text-white">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-xs font-bold text-white shadow-[0_8px_20px_-8px_rgba(76,130,247,0.8)]"
                suppressHydrationWarning
              >
                KA
              </span>
              <span suppressHydrationWarning>KEYAUTO</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-6 text-slate-400">
              Il marketplace che mette in contatto acquirenti e concessionarie verificate in tutta Italia.
            </p>
          </div>

          <FooterColumn title="Marketplace">
            <FooterLink href="/">Home</FooterLink>
            <FooterLink href="/auto">Auto</FooterLink>
            <FooterLink href="/ricerca">Ricerca</FooterLink>
            <FooterLink href="/concessionarie">Concessionarie</FooterLink>
            <FooterLink href="/faq">Domande Frequenti</FooterLink>
          </FooterColumn>

          <FooterColumn title="Per i concessionari">
            <FooterLink href="/demo">Richiedi una Demo</FooterLink>
            <FooterLink href="/registrazione">Registrati</FooterLink>
            <FooterLink href="/login">Accedi</FooterLink>
            <FooterLink href="/come-funziona">Come funziona</FooterLink>
          </FooterColumn>

          <FooterColumn title="Condizioni Generali">
            <FooterLink href="/privacy">Informativa sulla privacy</FooterLink>
            <FooterLink href="/termini">Termini e Condizioni utenti</FooterLink>
            <FooterLink href="/termini-concessionari">Termini e Condizioni concessionari</FooterLink>
            <FooterLink href="/consenso-marketing">Consenso al Marketing</FooterLink>
          </FooterColumn>
        </div>

        <div className="border-t border-white/10">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-slate-500 sm:px-6 lg:px-8 sm:flex-row sm:items-center sm:justify-between">
            <p>&copy; {new Date().getFullYear()} KeyAuto Marketplace. Tutti i diritti riservati. P.IVA 02543220970</p>
            <Link href="/privacy" className="transition hover:text-slate-300">Privacy</Link>
          </div>
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

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</p>
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-sm text-slate-400 transition hover:text-white">
      {children}
    </Link>
  );
}
