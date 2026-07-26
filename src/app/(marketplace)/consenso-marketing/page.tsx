import type { Metadata } from "next";
import type { ReactNode } from "react";

const LAST_UPDATED = "25 luglio 2026";

const CONTROLLER = {
  name: "KeyAuto Marketplace",
  email: "amministrazione@keyauto.it",
};

export const metadata: Metadata = {
  title: "Consenso al Marketing | KeyAuto",
  description:
    "Informativa sul consenso facoltativo all'invio di comunicazioni di marketing da parte di KeyAuto.",
};

export default function MarketingConsentPage() {
  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">Note legali</p>
        <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Consenso al Marketing</h1>
        <p className="mt-3 text-sm text-slate-400">
          Ultimo aggiornamento: {LAST_UPDATED}. Questa pagina spiega, in modo separato rispetto all&apos;
          <a href="/privacy" className="text-cyan-300 underline">Informativa sulla privacy</a>, come funziona il
          consenso facoltativo all&apos;invio di comunicazioni di marketing da parte di {CONTROLLER.name}.
        </p>

        <div className="mt-10 space-y-9">
          <Section title="1. Cosa copre questo consenso">
            <p>
              Con il tuo consenso esplicito e facoltativo, KeyAuto può inviarti comunicazioni via email relative a:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>novità sulla piattaforma e nuove funzionalità del servizio;</li>
              <li>veicoli e offerte in linea con le ricerche o le richieste che hai effettuato;</li>
              <li>comunicazioni promozionali di KeyAuto e delle concessionarie partner.</li>
            </ul>
          </Section>

          <Section title="2. Facoltatività">
            <p>
              Questo consenso è <strong className="text-white">separato e indipendente</strong> dal trattamento dei dati
              necessario per usare i servizi essenziali della piattaforma (richiesta di informazioni su un veicolo,
              richiesta di Demo, gestione dell&apos;account). <strong className="text-white">Non prestare questo
              consenso, o revocarlo in qualsiasi momento, non pregiudica in alcun modo l&apos;utilizzo di questi
              servizi</strong>, che restano disponibili anche senza ricevere comunicazioni di marketing.
            </p>
          </Section>

          <Section title="3. Base giuridica">
            <p>
              La base giuridica di questo trattamento è il tuo consenso (art. 6.1.a GDPR), liberamente prestato e
              revocabile in ogni momento, senza pregiudicare la liceità del trattamento basata sul consenso prima
              della revoca.
            </p>
          </Section>

          <Section title="4. Cosa non facciamo">
            <p>
              A differenza di quanto avviene su altre piattaforme, KeyAuto{" "}
              <strong className="text-white">non effettua oggi alcuna profilazione comportamentale</strong> basata sul
              tracciamento della tua navigazione su altri siti o app, né incrocia i tuoi dati con fonti pubblicitarie di
              terze parti. Le eventuali comunicazioni si basano unicamente sui dati che ci fornisci direttamente (es.
              email, veicolo o ricerca di interesse). Per maggiori dettagli sui cookie utilizzati vedi il punto 9
              dell&apos;
              <a href="/privacy" className="text-cyan-300 underline">Informativa sulla privacy</a>.
            </p>
          </Section>

          <Section title="5. Come revocare il consenso">
            <p>Puoi revocare il consenso in qualsiasi momento, con effetto immediato per le comunicazioni successive:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>tramite l&apos;apposito link di cancellazione presente in ogni comunicazione di marketing ricevuta;</li>
              <li>
                scrivendo a{" "}
                <a className="text-cyan-300 underline" href={`mailto:${CONTROLLER.email}`}>
                  {CONTROLLER.email}
                </a>
                .
              </li>
            </ul>
          </Section>

          <Section title="6. Riferimenti">
            <p>
              Per informazioni complete sul trattamento dei tuoi dati personali consulta l&apos;
              <a href="/privacy" className="text-cyan-300 underline">Informativa sulla privacy</a>. Per le condizioni
              generali di utilizzo della piattaforma consulta i{" "}
              <a href="/termini" className="text-cyan-300 underline">Termini e Condizioni</a>.
            </p>
          </Section>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="mt-3 space-y-2 text-sm leading-7 text-slate-300">{children}</div>
    </section>
  );
}
