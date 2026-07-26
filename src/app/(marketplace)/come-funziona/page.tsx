import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Come funziona | KeyAuto",
  description:
    "Come funziona KeyAuto: come cercare e richiedere informazioni su un veicolo, e come le concessionarie pubblicano il proprio showroom.",
};

export default function ComeFunzionaPage() {
  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">Come funziona</p>
        <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Come funziona KeyAuto</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
          KeyAuto mette in contatto chi cerca un&apos;auto con le concessionarie verificate in tutta Italia. Ecco, in
          modo semplice, come funziona da entrambi i lati.
        </p>

        {/* ============ UTENTI ============ */}
        <section className="mt-14">
          <h2 className="text-2xl font-bold text-white">Se cerchi un&apos;auto</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">4 passaggi per trovare il veicolo giusto e mettersi in contatto con il venditore.</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <StepCard number={1} title="Cerca il veicolo che fa per te">
              Sfoglia migliaia di veicoli usati, km 0 e a noleggio. Filtra per marca, modello, prezzo, alimentazione,
              cambio e altro, oppure usa la ricerca avanzata.
            </StepCard>
            <StepCard number={2} title="Guarda tutti i dettagli">
              Apri la scheda del veicolo per vedere foto, caratteristiche tecniche, prezzo e i dati della
              concessionaria che lo vende.
            </StepCard>
            <StepCard number={3} title="Richiedi informazioni">
              Compila il modulo &ldquo;Richiedi informazioni&rdquo; nella scheda del veicolo: bastano nome, un
              contatto (email o telefono) e un messaggio.
            </StepCard>
            <StepCard number={4} title="Vieni ricontattato dalla concessionaria">
              La tua richiesta arriva direttamente al venditore, che ti ricontatta per organizzare visione, prova su
              strada e trattativa.
            </StepCard>
          </div>

          <p className="mt-6 text-sm leading-6 text-slate-500">
            KeyAuto mette in contatto acquirente e concessionaria, ma la trattativa e la vendita avvengono
            direttamente tra voi due — per i dettagli vedi i{" "}
            <Link href="/termini" className="text-cyan-300 underline">Termini e Condizioni</Link>.
          </p>
        </section>

        {/* ============ CONCESSIONARIE ============ */}
        <section className="mt-16 border-t border-white/10 pt-14">
          <h2 className="text-2xl font-bold text-white">Se sei una concessionaria</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">Dalla richiesta della prova gratuita alla gestione completa del tuo showroom online.</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <StepCard number={1} title="Richiedi una Demo gratuita">
              Compila il modulo con i dati della tua attività e carica la visura camerale. Il nostro team verifica la
              richiesta entro 1-2 giorni lavorativi.
            </StepCard>
            <StepCard number={2} title="Esplora la piattaforma">
              Con la Demo puoi pubblicare fino a 10 veicoli e ricevere fino a 20 richieste, con 1 utente, per provare
              gratuitamente le funzioni principali.
            </StepCard>
            <StepCard number={3} title="Gestisci il tuo showroom">
              Dalla dashboard aggiungi veicoli (anche importandoli da un feed o da un file Excel), rispondi ai
              <strong className="text-white"> Lead</strong> ricevuti, gestisci i <strong className="text-white">Clienti</strong>,
              fissa gli <strong className="text-white">Appuntamenti</strong> in agenda e controlli le{" "}
              <strong className="text-white">Statistiche</strong>.
            </StepCard>
            <StepCard number={4} title="Passa al piano completo">
              Al termine della Demo, attiva un abbonamento (Base, Pro o Elite) per continuare a operare senza limiti e
              sbloccare tutte le funzionalità.
            </StepCard>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/demo"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-6 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_30px_-10px_rgba(76,130,247,0.7)] transition hover:brightness-105"
            >
              Richiedi una Demo
            </Link>
            <Link
              href="/termini-concessionari"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:border-blue-400/50 hover:bg-blue-500/10"
            >
              Condizioni per le concessionarie
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function StepCard({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-bold text-white">
        {number}
      </span>
      <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{children}</p>
    </div>
  );
}
