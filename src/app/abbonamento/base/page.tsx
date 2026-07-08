import { Check, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";

const baseFeatures = [
  "Fino a 50 annunci veicolo attivi",
  "Gestione completa delle schede veicolo",
  "Ricezione e gestione dei lead",
  "Dashboard concessionario",
  "Supporto via e-mail",
];

export default function AbbonamentoBasePage() {
  return (
    <DealerDashboardShell title="Piano Base" dealerName="Dealer Console" avatarInitials="DC" unreadNotifications={3}>
      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.45)] sm:p-8 lg:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-700">Dettaglio Piano</p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">Piano Base</h2>

        <div className="mt-4 flex items-end gap-1">
          <p className="text-3xl font-semibold text-slate-900">€149</p>
          <p className="pb-1 text-sm font-medium text-slate-500">/mese</p>
        </div>

        <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
          Ideale per concessionarie che vogliono iniziare a pubblicare online con una gestione semplice e professionale.
        </p>

        <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50/70 p-6">
          <h3 className="text-lg font-semibold text-slate-900">Dettaglio servizi</h3>
          <ul className="mt-4 space-y-3 text-sm text-slate-700">
            {baseFeatures.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-slate-200 text-slate-700">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <Link
          href="/abbonamento"
          className="mt-8 inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Torna agli abbonamenti
        </Link>
      </section>
    </DealerDashboardShell>
  );
}
