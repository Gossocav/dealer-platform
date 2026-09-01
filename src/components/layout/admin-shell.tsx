"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * L'involucro comune delle pagine amministrative.
 *
 * Prima ogni pagina si disegnava la propria intestazione, con larghezze
 * diverse (7xl qui, 6xl la', 3xl negli errori) e, soprattutto, **senza alcun
 * modo di passare da una all'altra**: le sezioni erano raggiungibili solo
 * tornando indietro alla dashboard o scrivendo l'indirizzo a mano.
 *
 * La larghezza scende a 6xl. Su uno schermo grande una tabella larga quanto
 * la finestra costringe l'occhio a percorrere mezzo metro per leggere una
 * riga, ed e' il motivo per cui il pannello sembrava "troppo largo".
 */
const SEZIONI = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/dealer-approval", label: "Approvazioni" },
  { href: "/admin/dealers", label: "Concessionarie" },
  { href: "/admin/demo-requests", label: "Richieste demo" },
  // Sta accanto alle richieste perche' e' la stessa cosa vista dall'altro
  // lato: li' si attiva chi ha chiesto la prova, qui chi non la vuole.
  { href: "/admin/attivazione-diretta", label: "Attivazione diretta" },
  { href: "/admin/info-requests", label: "Richieste info" },
  { href: "/admin/users", label: "Account" },
] as const;

type AdminShellProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function AdminShell({ title, description, actions, children }: AdminShellProps) {
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,#dbeafe_0%,#f8fafc_42%,#f8fafc_100%)] pb-12">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/admin" className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 hover:text-slate-900">
              KeyAuto · Amministrazione
            </Link>
            <Link href="/" className="text-xs font-medium text-slate-500 hover:text-slate-900">
              Vai al sito pubblico
            </Link>
          </div>

          <nav className="mt-3 flex flex-wrap gap-1" aria-label="Sezioni amministrative">
            {SEZIONI.map((sezione) => {
              // "/admin" e' prefisso di tutte le altre: solo la corrispondenza
              // esatta lo accende, altrimenti risulterebbe sempre attivo.
              const attiva = sezione.href === "/admin" ? pathname === "/admin" : pathname.startsWith(sezione.href);

              return (
                <Link
                  key={sezione.href}
                  href={sezione.href}
                  aria-current={attiva ? "page" : undefined}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                    attiva ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {sezione.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
            {description ? <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>

        <div className="mt-6 space-y-6">{children}</div>
      </div>
    </main>
  );
}
