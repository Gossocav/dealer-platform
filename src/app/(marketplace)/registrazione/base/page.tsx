import type { Metadata } from "next";
import Link from "next/link";
import DealerInfoRequestForm from "../dealer-info-request-form";
import { toAbsoluteUrl } from "@/lib/public-marketplace";

export const metadata: Metadata = {
  title: "Piano Base",
  description:
    "Il piano d'ingresso di KeyAuto: fino a 50 annunci attivi, gestione dei lead e pannello concessionario.",
  alternates: { canonical: toAbsoluteUrl("/registrazione/base") },
  openGraph: {
    title: "Piano Base | KeyAuto",
    description: "Il piano d'ingresso di KeyAuto: fino a 50 annunci attivi, gestione dei lead e pannello concessionario.",
    url: toAbsoluteUrl("/registrazione/base"),
    type: "website",
    images: ["/opengraph-image"],
  },
};

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
    <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <section className="relative overflow-hidden rounded-[36px] border border-white/10 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-6 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)] sm:p-8 lg:p-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(76,130,247,0.5), transparent 70%)" }}
          />
          <p className="relative text-sm font-semibold uppercase tracking-[0.32em] text-cyan-300">Piano Base</p>
          <h1 className="relative mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Piano Base</h1>
          <p className="relative mt-3 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
            La soluzione essenziale per portare la tua concessionaria online in modo semplice e professionale.
          </p>
          <p className="relative mt-4 text-2xl font-semibold text-white">€149/mese</p>

          <div className="relative mt-8 space-y-6">
            <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h2 className="text-lg font-semibold text-white">Chi siamo</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400 sm:text-base">
                KeyAuto e una piattaforma pensata per aiutare concessionarie e rivenditori automotive a pubblicare, gestire e valorizzare il proprio parco veicoli online.
              </p>
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h2 className="text-lg font-semibold text-white">Cosa include il Piano Base</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {baseFeatures.map((feature) => (
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
                Piccole concessionarie, autosaloni indipendenti e operatori che vogliono iniziare a lavorare online con uno strumento ordinato.
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
            Per attivare un account concessionaria e necessario richiedere la Demo. Dopo la validazione riceverai l&apos;accesso al piano piu adatto.
          </p>
          <Link
            href="/demo?piano=base"
            className="mt-5 inline-flex items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-400/10 px-6 py-3 text-sm font-bold text-cyan-200 shadow-[0_12px_30px_-12px_rgba(55,224,232,0.55)] transition hover:border-cyan-300/70 hover:bg-cyan-400/20 hover:text-white"
          >
            Richiedi Demo
          </Link>
          <Link
            href="#richiedi-informazioni"
            className="mt-5 ml-0 inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/[0.08] hover:text-white sm:ml-3"
          >
            Richiedi informazioni
          </Link>
        </section>

        {/* La demo era l'unica strada offerta in fondo alla pagina: chi non
            era ancora pronto a provarla, e voleva soltanto una risposta, non
            aveva dove chiederla e se ne andava. Il modulo e' lo stesso della
            pagina dei piani, ma dice da quale piano arriva la richiesta. */}
        <section
          id="richiedi-informazioni"
          className="scroll-mt-8 rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)] sm:p-8"
        >
          <DealerInfoRequestForm planCode="base" planName="Base" />
        </section>
      </div>
    </main>
  );
}
