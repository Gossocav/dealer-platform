import type { Metadata } from "next";
import Link from "next/link";
import { toAbsoluteUrl } from "@/lib/public-marketplace";

export const metadata: Metadata = {
  title: "Piano Pro",
  description:
    "Il piano Pro di KeyAuto: fino a 150 annunci attivi, CRM lead avanzato, statistiche e supporto prioritario.",
  alternates: { canonical: toAbsoluteUrl("/registrazione/pro") },
  openGraph: {
    title: "Piano Pro | KeyAuto",
    description: "Il piano Pro di KeyAuto: fino a 150 annunci attivi, CRM lead avanzato, statistiche e supporto prioritario.",
    url: toAbsoluteUrl("/registrazione/pro"),
    type: "website",
  },
};

const proFeatures = [
  {
    title: "Fino a 150 annunci veicolo attivi",
    description:
      "Gestisci volumi elevati di stock mantenendo sempre ampia disponibilita online, con spazio sufficiente per intercettare piu richieste.",
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
    <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <section className="relative overflow-hidden rounded-[36px] border border-white/10 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-6 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)] sm:p-8 lg:p-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(76,130,247,0.5), transparent 70%)" }}
          />
          <p className="relative text-sm font-semibold uppercase tracking-[0.32em] text-cyan-300">Piano Pro</p>
          <h1 className="relative mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Piano Pro</h1>
          <p className="relative mt-3 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
            Il piano avanzato per concessionarie che vogliono scalare, gestire piu annunci e lavorare con strumenti professionali.
          </p>
          <p className="relative mt-4 text-2xl font-semibold text-white">€399/mese</p>

          <div className="relative mt-8 space-y-6">
            <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h2 className="text-lg font-semibold text-white">Chi siamo</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400 sm:text-base">
                KeyAuto supporta concessionarie e rivenditori automotive nella crescita digitale, offrendo strumenti professionali per gestire stock, lead e performance commerciali in modo strutturato.
              </p>
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h2 className="text-lg font-semibold text-white">Cosa include il Piano Pro</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {proFeatures.map((feature) => (
                  <div key={feature.title} className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
                    <h3 className="text-sm font-semibold text-white">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{feature.description}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h2 className="text-lg font-semibold text-white">A chi e adatto</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400 sm:text-base">
                Dealer strutturati, concessionarie con alto volume di stock, autosaloni multi-brand e operatori che vogliono massimizzare visibilita e conversioni.
              </p>
            </article>
          </div>

          <Link
            href="/registrazione"
            className="relative mt-6 inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
          >
            Cambia piano
          </Link>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)] sm:p-8">
          <h2 className="text-2xl font-semibold text-white">Registrazione diretta disattivata</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400 sm:text-base">
            L&apos;accesso al piano Pro passa dalla richiesta Demo e dalla successiva attivazione assistita.
          </p>
          <Link
            href="/demo?piano=pro"
            className="mt-5 inline-flex items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-400/10 px-6 py-3 text-sm font-bold text-cyan-200 shadow-[0_12px_30px_-12px_rgba(55,224,232,0.55)] transition hover:border-cyan-300/70 hover:bg-cyan-400/20 hover:text-white"
          >
            Richiedi Demo
          </Link>
        </section>
      </div>
    </main>
  );
}
