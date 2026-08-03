import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

const SUPPORT_EMAIL = "info@keyauto.it";

export const metadata: Metadata = {
  title: "Domande Frequenti",
  description:
    "Le risposte alle domande più frequenti su KeyAuto: come cercare un'auto e richiedere informazioni, e come funziona la piattaforma per le concessionarie.",
};

export default function FaqPage() {
  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">Assistenza</p>
        <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Domande Frequenti</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
          Le risposte alle domande più comuni. Per una spiegazione passo passo di come funziona la piattaforma vedi
          anche la pagina{" "}
          <Link href="/come-funziona" className="text-cyan-300 underline">Come funziona</Link>.
        </p>

        {/* ============ UTENTI ============ */}
        <section className="mt-14">
          <h2 className="text-2xl font-bold text-white">Se cerchi un&apos;auto</h2>

          <div className="mt-6 space-y-3">
            <FaqItem question="Come funziona la richiesta di informazioni su un veicolo?">
              Apri la scheda del veicolo che ti interessa e clicca su &ldquo;Contatta il venditore&rdquo;: la pagina
              scorre al modulo &ldquo;Richiedi informazioni&rdquo;. Compila nome, cognome, tipo di cliente (privato o
              azienda), email, telefono e un messaggio, poi invia. La richiesta arriva direttamente alla concessionaria
              che vende il veicolo.
            </FaqItem>

            <FaqItem question="KeyAuto vende direttamente le auto o mette solo in contatto?">
              KeyAuto è un intermediario: mette in contatto te e la concessionaria, ma non è parte della vendita.
              La trattativa, il prezzo definitivo e il contratto di acquisto avvengono direttamente tra te e la
              concessionaria. Per i dettagli vedi i{" "}
              <Link href="/termini" className="text-cyan-300 underline">Termini e Condizioni</Link>.
            </FaqItem>

            <FaqItem question="Usare KeyAuto è gratuito?">
              Sì. Consultare gli annunci e inviare richieste di informazioni su KeyAuto è completamente gratuito per
              chi cerca un&apos;auto.
            </FaqItem>

            <FaqItem question="Come mi contatta la concessionaria dopo aver inviato la richiesta?">
              Ti ricontatta direttamente sui recapiti (email o telefono) che hai indicato nel modulo, per organizzare
              visione del veicolo, prova su strada e trattativa. Riceverai anche una email di conferma
              dell&apos;avvenuto invio della richiesta.
            </FaqItem>

            <FaqItem question="Il veicolo che cercavo non è più disponibile: cosa significa?">
              L&apos;annuncio è stato probabilmente rimosso o il veicolo è stato venduto dalla concessionaria. In
              questi casi la scheda del veicolo non è più raggiungibile.
            </FaqItem>

            <FaqItem question="Come vengono trattati i miei dati personali?">
              Trovi tutti i dettagli nell&apos;
              <Link href="/privacy" className="text-cyan-300 underline">Informativa sulla privacy</Link>.
            </FaqItem>
          </div>
        </section>

        {/* ============ CONCESSIONARIE ============ */}
        <section className="mt-16 border-t border-white/10 pt-14">
          <h2 className="text-2xl font-bold text-white">Se sei una concessionaria</h2>

          <div className="mt-6 space-y-3">
            <FaqItem question="Come funziona la Demo gratuita e cosa include?">
              Compili il modulo &ldquo;Richiedi una Demo&rdquo; con i dati della tua attività e la visura camerale.
              Il nostro team verifica la richiesta entro 1-2 giorni lavorativi e attiva l&apos;accesso. Con la Demo
              puoi pubblicare fino a 10 veicoli e ricevere fino a 20 richieste, con 1 utente, per provare
              gratuitamente le funzioni principali.
            </FaqItem>

            <FaqItem question="Quali documenti servono per registrarsi?">
              Ragione sociale, partita IVA, dati del referente e la visura camerale della tua attività (in formato
              PDF, JPG o PNG, massimo 5 MB).
            </FaqItem>

            <FaqItem question="Quanti veicoli posso pubblicare in Demo? E dopo?">
              In Demo il limite è di 10 veicoli. Attivando un piano completo (Base, Pro o Elite) il limite viene
              rimosso in base al piano scelto.
            </FaqItem>

            <FaqItem question="Come importo il mio parco auto?">
              Dalla sezione &ldquo;Importa Veicoli&rdquo; della dashboard puoi caricare i veicoli tramite un feed
              esterno oppure da un file Excel, senza doverli inserire uno per uno.
            </FaqItem>

            <FaqItem question="Come gestisco i lead che ricevo?">
              Ogni richiesta di informazioni ricevuta compare nella sezione &ldquo;Lead&rdquo; della dashboard, e
              riceverai anche una notifica via email non appena arriva.
            </FaqItem>

            <FaqItem question="Quali piani di abbonamento sono disponibili e come cambio piano?">
              I piani disponibili sono Base, Pro ed Elite. Puoi consultarli e gestire il tuo abbonamento dalla
              sezione &ldquo;Il mio piano&rdquo; della dashboard.
            </FaqItem>

            <FaqItem question="Cosa succede quando scade la Demo?">
              Alla scadenza l&apos;accesso in scrittura viene bloccato automaticamente: i dati inseriti restano
              salvati e consultabili, ma per continuare a pubblicare e gestire i veicoli è necessario attivare un
              piano completo.
            </FaqItem>

            <FaqItem question="Come contatto l'assistenza KeyAuto?">
              Puoi scriverci in qualsiasi momento a{" "}
              <a className="text-cyan-300 underline" href={`mailto:${SUPPORT_EMAIL}`}>
                {SUPPORT_EMAIL}
              </a>
              .
            </FaqItem>
          </div>

          <div className="mt-8">
            <Link
              href="/demo"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-6 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_30px_-10px_rgba(76,130,247,0.7)] transition hover:brightness-105"
            >
              Richiedi una Demo
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function FaqItem({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-white">
        {question}
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 text-slate-400 transition group-open:rotate-45">
          +
        </span>
      </summary>
      <p className="mt-3 text-sm leading-6 text-slate-400">{children}</p>
    </details>
  );
}
