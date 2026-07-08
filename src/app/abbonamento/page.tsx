"use client";

import { Check, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";

type Plan = {
  id: "base" | "pro";
  name: string;
  price: string;
  period: string;
  features: string[];
  ctaLabel: string;
  recommended?: boolean;
  detailsHref: string;
  detailsLabel: string;
};

const plans: Plan[] = [
  {
    id: "base",
    name: "Piano Base",
    price: "€149",
    period: "/mese",
    ctaLabel: "Scegli Base",
    detailsHref: "/abbonamento/base",
    detailsLabel: "Scopri dettagli Base",
    features: [
      "Fino a 50 annunci veicolo attivi",
      "Gestione completa delle schede veicolo",
      "Ricezione e gestione dei lead",
      "Dashboard concessionario",
      "Supporto via e-mail",
    ],
  },
  {
    id: "pro",
    name: "Piano Pro",
    price: "€399",
    period: "/mese",
    ctaLabel: "Scegli Pro",
    detailsHref: "/abbonamento/pro",
    detailsLabel: "Scopri dettagli Pro",
    recommended: true,
    features: [
      "Annunci veicolo attivi illimitati",
      "Gestione completa delle schede veicolo",
      "Ricezione e gestione dei lead",
      "Dashboard concessionario avanzata",
      "CRM Lead avanzato",
      "Statistiche e KPI dettagliati",
      "Esportazione dati",
      "Supporto prioritario",
      "Maggiore visibilità sulla piattaforma",
    ],
  },
];

export default function AbbonamentoPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-10">
      <section className="mx-auto w-full max-w-6xl rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.45)] sm:p-8 lg:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-700">Piani Dealer</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">Scegli il piano piu adatto alla tua concessionaria</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Confronta i servizi inclusi e attiva il piano piu adatto alla fase di crescita del tuo business.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
            <ShieldCheck className="h-4 w-4" />
            Abbonamento sicuro
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {plans.map((plan) => (
            <article
              key={plan.id}
              className={[
                "relative flex h-full flex-col rounded-3xl border p-6 shadow-sm sm:p-7",
                plan.recommended
                  ? "border-sky-300 bg-gradient-to-b from-sky-50 via-white to-white shadow-sky-100"
                  : "border-slate-200 bg-slate-50/50",
              ].join(" ")}
            >
              {plan.recommended ? (
                <div className="absolute right-5 top-5 inline-flex items-center gap-1 rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white">
                  <Sparkles className="h-3.5 w-3.5" />
                  Consigliato
                </div>
              ) : null}

              <div>
                <h3 className="text-2xl font-semibold text-slate-900">{plan.name}</h3>
                <div className="mt-3 flex items-end gap-1">
                  <p className="text-3xl font-semibold text-slate-900">{plan.price}</p>
                  <p className="pb-1 text-sm font-medium text-slate-500">{plan.period}</p>
                </div>
              </div>

              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <span
                      className={[
                        "mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full",
                        plan.recommended ? "bg-sky-100 text-sky-700" : "bg-slate-200 text-slate-700",
                      ].join(" ")}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={`/registrazione?piano=${plan.id}`}
                className={[
                  "mt-8 inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-4",
                  plan.recommended
                    ? "bg-sky-600 text-white hover:bg-sky-700 focus:ring-sky-200"
                    : "bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-300",
                ].join(" ")}
              >
                {plan.ctaLabel}
              </Link>

              <Link
                href={plan.detailsHref}
                className="mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-slate-200"
              >
                {plan.detailsLabel}
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
