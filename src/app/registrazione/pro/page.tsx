import Link from "next/link";
import { DealerRegistrationForm } from "@/components/dealer-registration-form";

const proFeatures = [
  "Annunci veicolo attivi illimitati",
  "Gestione completa delle schede veicolo",
  "Ricezione e gestione dei lead",
  "Dashboard concessionario avanzata",
  "CRM Lead avanzato",
  "Statistiche e KPI dettagliati",
  "Esportazione dati",
  "Supporto prioritario",
  "Maggiore visibilità sulla piattaforma",
];

export default function RegistrazioneProPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-slate-100 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-600">Piano selezionato</p>
          <h1 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Piano Pro</h1>
          <p className="mt-2 text-2xl font-semibold text-slate-900">€399/mese</p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Pensato per concessionarie con alto volume di annunci e necessità di strumenti avanzati.
          </p>

          <ul className="mt-5 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            {proFeatures.map((feature) => (
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

        <DealerRegistrationForm plan="pro" />
      </div>
    </main>
  );
}
