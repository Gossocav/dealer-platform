import Link from "next/link";
import { DealerRegistrationForm } from "@/components/dealer-registration-form";

const baseFeatures = [
  "Fino a 50 annunci veicolo attivi",
  "Gestione completa delle schede veicolo",
  "Ricezione e gestione dei lead",
  "Dashboard concessionario",
  "Supporto via e-mail",
];

export default function RegistrazioneBasePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-slate-100 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-600">Piano selezionato</p>
          <h1 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Piano Base</h1>
          <p className="mt-2 text-2xl font-semibold text-slate-900">€149/mese</p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Ideale per concessionarie che vogliono iniziare a pubblicare online con una gestione semplice e professionale.
          </p>

          <ul className="mt-5 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            {baseFeatures.map((feature) => (
              <li key={feature} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                {feature}
              </li>
            ))}
          </ul>

          <Link
            href="/registrazione"
            className="mt-5 inline-flex items-center rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Cambia piano
          </Link>
        </section>

        <DealerRegistrationForm plan="base" />
      </div>
    </main>
  );
}
