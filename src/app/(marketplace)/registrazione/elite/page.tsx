import type { Metadata } from "next";
import Link from "next/link";
import { toAbsoluteUrl } from "@/lib/public-marketplace";

export const metadata: Metadata = {
  title: "Piano Elite",
  description:
    "Il piano Elite di KeyAuto: fino a 300 annunci attivi, maggiore visibilità in vetrina, promozione sui social ufficiali, scheda consegna veicolo e supporto prioritario.",
  alternates: { canonical: toAbsoluteUrl("/registrazione/elite") },
  openGraph: {
    title: "Piano Elite | KeyAuto",
    description: "Il piano Elite di KeyAuto: fino a 300 annunci attivi, maggiore visibilità in vetrina, promozione sui social ufficiali, scheda consegna veicolo e supporto prioritario.",
    url: toAbsoluteUrl("/registrazione/elite"),
    type: "website",
    images: ["/opengraph-image"],
  },
};

const eliteFeatures = [
  {
    title: "Fino a 300 annunci veicolo attivi",
    description:
      "Gestisci l'intero parco auto mantenendo sempre ampia disponibilità online, con spazio sufficiente per intercettare più richieste.",
  },
  {
    title: "Gestione completa delle schede veicolo",
    description:
      "Standardizza la qualità delle schede su tutto il parco auto, con dati completi e presentazioni professionali per ogni veicolo pubblicato.",
  },
  {
    title: "Ricezione e gestione dei lead",
    description:
      "Centralizza i contatti in ingresso, assegna priorità alle opportunità migliori e migliora il tasso di conversione commerciale.",
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
    title: "Scheda consegna veicolo",
    description:
      "Un documento pronto da stampare con i dati del veicolo, i chilometri, le dotazioni e la garanzia: si firma al momento della consegna e resta al cliente, senza compilarlo a mano ogni volta.",
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
      "Accedi a un canale di assistenza con priorità alta per ridurre tempi di attesa e mantenere continuità nelle attività quotidiane.",
  },
  {
    title: "Maggiore visibilità sulla piattaforma",
    description:
      "Aumenta la presenza dei tuoi veicoli nel marketplace e migliora le possibilita di essere scelto dai clienti nelle fasi di ricerca.",
  },
  {
    title: "Visibilità sui social ufficiali KeyAuto",
    description:
      "I tuoi veicoli e la tua concessionaria vengono promossi sui canali social ufficiali di KeyAuto, ampliando la copertura oltre il marketplace.",
  },
];

export default function RegistrazioneElitePage() {
  return (
    <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <section className="relative overflow-hidden rounded-[36px] border border-white/10 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-6 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)] sm:p-8 lg:p-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(76,130,247,0.5), transparent 70%)" }}
          />
          <p className="relative text-sm font-semibold uppercase tracking-[0.32em] text-cyan-300">Piano Elite</p>
          <h1 className="relative mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Piano Elite</h1>
          <p className="relative mt-3 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
            Tutte le funzionalità del Piano Pro, con in più il doppio degli annunci pubblicabili, la promozione sui canali social ufficiali e la scheda consegna da dare al cliente.
          </p>
          <p className="relative mt-4 text-2xl font-semibold text-white">€699/mese</p>

          <div className="relative mt-8 space-y-6">
            <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h2 className="text-lg font-semibold text-white">Chi siamo</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400 sm:text-base">
                KeyAuto è una piattaforma pensata per aiutare concessionarie e rivenditori automotive a pubblicare, gestire e valorizzare il proprio parco veicoli online.
              </p>
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h2 className="text-lg font-semibold text-white">Cosa include il Piano Elite</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {eliteFeatures.map((feature) => (
                  <div key={feature.title} className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
                    <h3 className="text-sm font-semibold text-white">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{feature.description}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h2 className="text-lg font-semibold text-white">A chi è adatto</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400 sm:text-base">
                Concessionarie con un parco auto ampio, che non sta nei 150 annunci del Piano Pro: qui se ne pubblicano fino a 300
                insieme, senza dover togliere un veicolo dalla vetrina per far posto a un nuovo arrivo.
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-400 sm:text-base">
                È il piano di chi ha una rotazione alta e vuole che tutto lo stock resti online mentre il team lavora sui contatti in
                arrivo. Alla capienza si aggiungono la maggiore visibilità nel marketplace, la promozione sui canali social ufficiali
                KeyAuto, la scheda consegna da far firmare al cliente e il supporto prioritario, con tempi di risposta più brevi.
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-400 sm:text-base">
                Se il parco auto sta comodamente sotto i 150 veicoli, il Piano Pro offre le stesse funzioni di gestione a un canone
                inferiore: l&apos;Elite conviene quando è lo spazio in vetrina a mancare.
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
            L&apos;accesso al piano Elite passa dalla richiesta Demo e dalla successiva attivazione assistita.
          </p>
          <Link
            href="/demo?piano=elite"
            className="mt-5 inline-flex items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-400/10 px-6 py-3 text-sm font-bold text-cyan-200 shadow-[0_12px_30px_-12px_rgba(55,224,232,0.55)] transition hover:border-cyan-300/70 hover:bg-cyan-400/20 hover:text-white"
          >
            Richiedi Demo
          </Link>
        </section>
      </div>
    </main>
  );
}
