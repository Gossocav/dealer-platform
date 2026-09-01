import type { Metadata } from "next";
import Link from "next/link";
import DealerInfoRequestForm from "../dealer-info-request-form";
import { InvitoAllaProva } from "@/components/marketplace/invito-alla-prova";
import { toAbsoluteUrl } from "@/lib/public-marketplace";
import { formattaPrezzoPiano, getDemoPlan } from "@/lib/demo-plan-catalog";

export const metadata: Metadata = {
  title: "Piano Pro",
  description:
    "Il piano Pro di KeyAuto: fino a 150 annunci attivi, il conto economico di ogni vettura, vendite, giacenza e supporto prioritario.",
  alternates: { canonical: toAbsoluteUrl("/registrazione/pro") },
  openGraph: {
    title: "Piano Pro | KeyAuto",
    description: "Il piano Pro di KeyAuto: fino a 150 annunci attivi, il conto economico di ogni vettura, vendite, giacenza e supporto prioritario.",
    url: toAbsoluteUrl("/registrazione/pro"),
    type: "website",
    images: ["/opengraph-image"],
  },
};

// L'elenco delle funzioni e il prezzo stanno nel catalogo, non qui: fino
// al 01/09/2026 erano scritti a mano in cinque pagine e avevano gia'
// divaricato, promettendo funzioni che non esistono.
const piano = getDemoPlan("pro");
const proFeatures = piano?.services ?? [];

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
          <p className="relative mt-4 text-2xl font-semibold text-white">{piano ? formattaPrezzoPiano(piano) : ""}</p>

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

        <InvitoAllaProva planCode="pro" planName="Pro" />

        {/* La demo era l'unica strada offerta in fondo alla pagina: chi non
            era ancora pronto a provarla, e voleva soltanto una risposta, non
            aveva dove chiederla e se ne andava. Il modulo e' lo stesso della
            pagina dei piani, ma dice da quale piano arriva la richiesta. */}
        <section
          id="richiedi-informazioni"
          className="scroll-mt-8 rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)] sm:p-8"
        >
          <DealerInfoRequestForm planCode="pro" planName="Pro" />
        </section>
      </div>
    </main>
  );
}
