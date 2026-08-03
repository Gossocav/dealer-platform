import type { Metadata } from "next";
import Link from "next/link";
import { toAbsoluteUrl } from "@/lib/public-marketplace";
import DealerInfoRequestForm from "./dealer-info-request-form";

export const metadata: Metadata = {
  title: "Registra la tua concessionaria",
  description:
    "Porta il tuo parco veicoli su KeyAuto: pubblica gli annunci, ricevi richieste dai clienti e gestisci tutto da un pannello unico.",
  alternates: { canonical: toAbsoluteUrl("/registrazione") },
  openGraph: {
    title: "Registra la tua concessionaria | KeyAuto",
    description: "Pubblica i tuoi veicoli su KeyAuto e ricevi richieste dai clienti.",
    url: toAbsoluteUrl("/registrazione"),
    type: "website",
    images: ["/opengraph-image"],
  },
};

export default function RegistrazionePage() {
  return (
    <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <section className="relative overflow-hidden rounded-[36px] border border-white/10 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 px-8 py-10 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)] sm:px-10 sm:py-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(76,130,247,0.5), transparent 70%)" }}
          />
          <p className="relative text-sm font-semibold uppercase tracking-[0.32em] text-cyan-300">Accesso Dealer</p>
          <h1 className="relative mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Scegli il percorso piu adatto alla tua concessionaria
          </h1>
          <p className="relative mt-4 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
            Seleziona Piano Base, Piano Pro, Piano Elite oppure richiedi la Demo gratuita di 7 giorni.
          </p>
        </section>

        <div className="grid gap-5 lg:grid-cols-4">
          <PlanCard
            title="Piano Base"
            description="Ideale per partire con i flussi fondamentali di gestione concessionaria."
            href="/registrazione/base"
            cta="Vai al Piano Base"
          />
          <PlanCard
            title="Piano Pro"
            description="Pensato per concessionarie con maggiore volume operativo e strumenti avanzati."
            href="/registrazione/pro"
            cta="Vai al Piano Pro"
          />
          <PlanCard
            title="Piano Elite"
            description="Tutto il Piano Pro, con in piu la gestione della visibilita social e delle campagne Google Ads."
            href="/registrazione/elite"
            cta="Vai al Piano Elite"
          />

          {/* La demo resta l'unica scheda in evidenza, come prima: e' l'azione
              che la pagina vuole far scegliere. */}
          <article className="flex flex-col rounded-[26px] border border-cyan-300/30 bg-cyan-400/[0.07] p-6">
            <h2 className="text-2xl font-semibold text-white">Demo gratuita</h2>
            <p className="mt-2 text-sm font-medium text-cyan-200">Prova KeyAuto per 7 giorni</p>
            <p className="mt-3 flex-1 text-sm leading-6 text-slate-400">
              Accesso dimostrativo riservato ai professionisti automotive, con alcune funzionalita limitate.
            </p>
            <Link
              href="/demo"
              className="mt-6 inline-flex w-full items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-400/10 px-5 py-3 text-sm font-bold text-cyan-200 shadow-[0_12px_30px_-12px_rgba(55,224,232,0.55)] transition hover:border-cyan-300/70 hover:bg-cyan-400/20 hover:text-white"
            >
              Richiedi Demo
            </Link>
          </article>
        </div>

        <section className="rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)] sm:p-8">
          <DealerInfoRequestForm />
        </section>
      </div>
    </main>
  );
}

function PlanCard({ title, description, href, cta }: { title: string; description: string; href: string; cta: string }) {
  return (
    <article className="flex flex-col rounded-[26px] border border-white/10 bg-gradient-to-br from-slate-800 to-slate-950 p-6 transition hover:border-blue-400/40">
      <h2 className="text-2xl font-semibold text-white">{title}</h2>
      <p className="mt-3 flex-1 text-sm leading-6 text-slate-400">{description}</p>
      <Link
        href={href}
        className="mt-6 inline-flex w-full items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
      >
        {cta}
      </Link>
    </article>
  );
}
