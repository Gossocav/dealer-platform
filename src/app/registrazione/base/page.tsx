import Link from "next/link";
import { DealerRegistrationForm } from "@/components/dealer-registration-form";

const baseFeatures = [
  {
    title: "Fino a 50 annunci veicolo attivi",
    description:
      "Pubblica uno stock selezionato e sempre aggiornato, dando priorita ai veicoli con maggiore potenziale commerciale senza sovraccaricare la gestione quotidiana.",
  },
  {
    title: "Gestione completa delle schede veicolo",
    description:
      "Organizza foto, dati tecnici, optional e descrizioni in modo uniforme, migliorando la qualita degli annunci e la fiducia dei clienti interessati.",
  },
  {
    title: "Ricezione e gestione dei lead",
    description:
      "Raccogli richieste da clienti interessati e gestiscile con ordine, riducendo tempi di risposta e aumentando le opportunita di appuntamento.",
  },
  {
    title: "Dashboard concessionario",
    description:
      "Visualizza da un unico pannello le attivita principali della concessionaria, con una panoramica chiara su stock, contatti e operazioni in corso.",
  },
  {
    title: "Supporto via e-mail",
    description:
      "Ricevi assistenza operativa per dubbi e configurazioni, cosi da lavorare con continuita e risolvere rapidamente eventuali blocchi.",
  },
];

export default function RegistrazioneBasePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-slate-100 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-600">Piano Base</p>
          <h1 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Piano Base</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            La soluzione essenziale per portare la tua concessionaria online in modo semplice e professionale.
          </p>
          <p className="mt-4 text-2xl font-semibold text-slate-900">€149/mese</p>

          <div className="mt-8 space-y-6">
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="text-lg font-semibold text-slate-900">Chi siamo</h2>
              <p className="mt-2 text-sm leading-6 text-slate-700 sm:text-base">
                Dealer Platform e una piattaforma pensata per aiutare concessionarie e rivenditori automotive a pubblicare, gestire e valorizzare il proprio parco veicoli online.
              </p>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="text-lg font-semibold text-slate-900">Cosa include il Piano Base</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {baseFeatures.map((feature) => (
                  <div key={feature.title} className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-semibold text-slate-900">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{feature.description}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="text-lg font-semibold text-slate-900">A chi e adatto</h2>
              <p className="mt-2 text-sm leading-6 text-slate-700 sm:text-base">
                Piccole concessionarie, autosaloni indipendenti e operatori che vogliono iniziare a lavorare online con uno strumento ordinato.
              </p>
            </article>
          </div>

          <Link
            href="/registrazione"
            className="mt-6 inline-flex items-center rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Cambia piano
          </Link>
        </section>

        <DealerRegistrationForm plan="base" />
      </div>
    </main>
  );
}
