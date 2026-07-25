import type { Metadata } from "next";
import type { ReactNode } from "react";

const LAST_UPDATED = "25 luglio 2026";

const OPERATOR = {
  name: "KeyAuto Marketplace",
  address: "Località Ca' Vantel 1, 29025 Gropparello (PC)",
  vat: "02543220970",
  email: "amministrazione@keyauto.it",
};

export const metadata: Metadata = {
  title: "Termini e Condizioni per gli utenti | KeyAuto",
  description:
    "Termini e Condizioni per gli utenti del marketplace KeyAuto: ruolo di intermediario, uso del servizio e responsabilità.",
};

export default function TermsPage() {
  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">Note legali</p>
        <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Termini e Condizioni per gli utenti</h1>
        <p className="mt-3 text-sm text-slate-400">
          Ultimo aggiornamento: {LAST_UPDATED}. Le presenti condizioni regolano l&apos;utilizzo della piattaforma
          KeyAuto da parte degli utenti che consultano il marketplace e contattano i concessionari. Utilizzando il
          servizio dichiari di averle lette e accettate. Se sei un concessionario e vuoi pubblicare veicoli su KeyAuto,
          fanno fede le{" "}
          <a className="text-cyan-300 underline" href="/termini-concessionari">Condizioni Generali per i concessionari</a>.
        </p>

        <div className="mt-10 space-y-9">
          <Section title="1. Oggetto">
            <p>
              Le presenti Condizioni Generali disciplinano l&apos;accesso e l&apos;utilizzo della piattaforma online
              KeyAuto (di seguito la &ldquo;Piattaforma&rdquo;), che consente ai concessionari di pubblicare annunci di
              veicoli e agli utenti di consultarli e richiedere informazioni.
            </p>
          </Section>

          <Section title="2. Gestore del servizio">
            <ul className="mt-1 space-y-1">
              <li><strong className="text-white">{OPERATOR.name}</strong></li>
              <li>{OPERATOR.address}</li>
              <li>Partita IVA: {OPERATOR.vat}</li>
              <li>
                Email:{" "}
                <a className="text-cyan-300 underline" href={`mailto:${OPERATOR.email}`}>
                  {OPERATOR.email}
                </a>
              </li>
            </ul>
          </Section>

          <Section title="3. Ruolo di KeyAuto (intermediario)">
            <p>
              KeyAuto svolge esclusivamente un ruolo di <strong className="text-white">intermediario tecnologico</strong>:
              mette in contatto i concessionari con gli utenti interessati. KeyAuto <strong className="text-white">non è
              parte del contratto di compravendita</strong> del veicolo, che intercorre unicamente tra il concessionario
              e l&apos;acquirente. KeyAuto non vende veicoli, non ne detiene la proprietà e non interviene nella
              trattativa, nel pagamento o nella consegna.
            </p>
          </Section>

          <Section title="4. Annunci e dati dei veicoli">
            <p>
              I contenuti degli annunci (dati tecnici, prezzo, foto, disponibilità del veicolo) sono
              <strong className="text-white"> inseriti e forniti direttamente dai concessionari</strong>, che ne sono
              gli unici responsabili. KeyAuto non garantisce l&apos;esattezza, la completezza, l&apos;aggiornamento o la
              disponibilità dei veicoli pubblicati. Prima di qualsiasi decisione d&apos;acquisto, l&apos;utente è invitato
              a verificare ogni informazione direttamente presso il concessionario.
            </p>
          </Section>

          <Section title="5. Utilizzo da parte degli utenti">
            <p>Utilizzando la Piattaforma, l&apos;utente si impegna a:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>fornire dati veritieri e corretti nei moduli di richiesta informazioni;</li>
              <li>utilizzare il servizio in modo lecito e conforme alle presenti condizioni;</li>
              <li>non compiere abusi, invii massivi, tentativi di accesso non autorizzato o attività che possano
                danneggiare la Piattaforma o gli altri utenti.</li>
            </ul>
          </Section>

          <Section title="6. Concessionari">
            <p>
              I concessionari che desiderano registrarsi e pubblicare veicoli su KeyAuto sono soggetti a condizioni
              specifiche, comprensive dei termini dell&apos;abbonamento al servizio, disciplinate dalle{" "}
              <a className="text-cyan-300 underline" href="/termini-concessionari">Condizioni Generali per i concessionari</a>.
            </p>
          </Section>

          <Section title="7. Proprietà intellettuale">
            <p>
              Il marchio KeyAuto, il software, la grafica e i contenuti della Piattaforma sono di proprietà del gestore
              o dei rispettivi titolari e sono protetti dalla normativa vigente. Ne è vietata la riproduzione o
              l&apos;utilizzo non autorizzato. I contenuti caricati dai concessionari restano di loro titolarità, che ne
              concedono l&apos;uso a KeyAuto ai fini della pubblicazione sulla Piattaforma.
            </p>
          </Section>

          <Section title="8. Limitazione di responsabilità">
            <p>
              Nei limiti consentiti dalla legge, KeyAuto non risponde dei rapporti tra concessionario e utente, della
              qualità, conformità o effettiva disponibilità dei veicoli, né di eventuali danni derivanti da informazioni
              errate fornite dai concessionari o dall&apos;impossibilità temporanea di accedere al servizio. Restano
              impregiudicati i diritti inderogabili riconosciuti ai consumatori dalla legge.
            </p>
          </Section>

          <Section title="9. Sospensione e cessazione del servizio">
            <p>
              KeyAuto si riserva il diritto di modificare, sospendere o interrompere, in tutto o in parte, la Piattaforma
              o singole funzionalità, nonché di rimuovere contenuti che violino le presenti condizioni o la legge.
            </p>
          </Section>

          <Section title="10. Modifiche alle condizioni">
            <p>
              KeyAuto può aggiornare le presenti Condizioni Generali. Le modifiche saranno pubblicate su questa pagina
              con l&apos;indicazione della data di ultimo aggiornamento e si applicheranno agli utilizzi successivi.
            </p>
          </Section>

          <Section title="11. Legge applicabile e foro competente">
            <p>
              Le presenti condizioni sono regolate dalla legge italiana. Per ogni controversia è competente il foro del
              luogo in cui ha sede il gestore, fatta salva l&apos;applicazione del foro del consumatore ove
              inderogabilmente previsto dalla legge a tutela dell&apos;utente consumatore.
            </p>
          </Section>

          <Section title="12. Contatti">
            <p>
              Per qualsiasi informazione relativa alle presenti condizioni è possibile scrivere a{" "}
              <a className="text-cyan-300 underline" href={`mailto:${OPERATOR.email}`}>
                {OPERATOR.email}
              </a>
              . Per il trattamento dei dati personali si rimanda all&apos;{" "}
              <a className="text-cyan-300 underline" href="/privacy">Informativa sulla privacy</a>.
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
