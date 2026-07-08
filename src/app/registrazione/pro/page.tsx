import Link from "next/link";
import { DealerRegistrationForm } from "@/components/dealer-registration-form";

const proFeatures = [
  {
    title: "Annunci veicolo attivi illimitati",
    description:
      "Gestisci volumi elevati di stock senza limiti operativi, mantenendo sempre ampia disponibilita online per intercettare piu richieste.",
  },
  {
    title: "Gestione completa delle schede veicolo",
    description:
      "Standardizza la qualita delle schede su tutto il parco auto, con dati completi e presentazioni professionali per ogni veicolo pubblicato.",
  },
  {
    title: "Ricezione e gestione dei lead",
    description:
      "Centralizza i contatti in ingresso, assegna priorita alle opportunita migliori e migliora il tasso di conversione commerciale.",
  },
  {
    title: "Dashboard concessionario avanzata",
    description:
      "Monitora KPI operativi e commerciali in un ambiente evoluto, utile per prendere decisioni rapide su stock e strategie di vendita.",
  },
  {
    title: "CRM Lead avanzato",
    description:
      "Traccia lo storico di ogni trattativa, organizza follow-up e coordina il team commerciale con un flusso strutturato e replicabile.",
  },
  {
    title: "Statistiche e KPI dettagliati",
    description:
      "Analizza performance di annunci, sorgenti lead e risultati commerciali per ottimizzare campagne e investimenti con dati concreti.",
  },
  {
    title: "Esportazione dati",
    description:
      "Esporta informazioni strategiche per condivisione interna, reportistica e integrazione con processi amministrativi o strumenti esterni.",
  },
  {
    title: "Supporto prioritario",
    description:
      "Accedi a un canale di assistenza con priorita alta per ridurre tempi di attesa e mantenere continuita nelle attivita quotidiane.",
  },
  {
    title: "Maggiore visibilita sulla piattaforma",
    description:
      "Aumenta la presenza dei tuoi veicoli nel marketplace e migliora le possibilita di essere scelto dai clienti nelle fasi di ricerca.",
  },
];

export default function RegistrazioneProPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-slate-100 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-600">Piano Pro</p>
          <h1 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Piano Pro</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Il piano avanzato per concessionarie che vogliono scalare, gestire piu annunci e lavorare con strumenti professionali.
          </p>
          <p className="mt-4 text-2xl font-semibold text-slate-900">€399/mese</p>

          <div className="mt-8 space-y-6">
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="text-lg font-semibold text-slate-900">Chi siamo</h2>
              <p className="mt-2 text-sm leading-6 text-slate-700 sm:text-base">
                Dealer Platform supporta concessionarie e rivenditori automotive nella crescita digitale, offrendo strumenti professionali per gestire stock, lead e performance commerciali in modo strutturato.
              </p>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="text-lg font-semibold text-slate-900">Cosa include il Piano Pro</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {proFeatures.map((feature) => (
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
                Dealer strutturati, concessionarie con alto volume di stock, autosaloni multi-brand e operatori che vogliono massimizzare visibilita e conversioni.
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

        <DealerRegistrationForm plan="pro" />
      </div>
    </main>
  );
}
