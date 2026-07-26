import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

const LAST_UPDATED = "25 luglio 2026";

const OPERATOR = {
  name: "KeyAuto Marketplace",
  address: "Località Ca' Vantel 1, 29025 Gropparello (PC)",
  vat: "02543220970",
  email: "amministrazione@keyauto.it",
};

export const metadata: Metadata = {
  title: "Condizioni Generali per i concessionari | KeyAuto",
  description:
    "Condizioni Generali di abbonamento riservate ai concessionari che pubblicano veicoli sul marketplace KeyAuto.",
};

export default function DealerTermsPage() {
  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">Note legali · Professionisti</p>
        <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Condizioni Generali per i concessionari</h1>
        <p className="mt-3 text-sm text-slate-400">
          Ultimo aggiornamento: {LAST_UPDATED}. Le presenti Condizioni Generali (di seguito il &ldquo;Contratto&rdquo;)
          disciplinano il rapporto tra {OPERATOR.name} e il concessionario, operatore professionale del settore
          automotive, che sottoscrive un abbonamento per pubblicare veicoli sul marketplace KeyAuto. Sono riservate ai
          professionisti; se sei un utente del marketplace fanno fede le{" "}
          <Link className="text-cyan-300 underline" href="/termini">Condizioni Generali per gli utenti</Link>.
        </p>

        <div className="mt-10 space-y-9">
          <Section title="1. Parti e oggetto">
            <p>
              Il presente Contratto è stipulato tra <strong className="text-white">{OPERATOR.name}</strong> (di seguito
              &ldquo;KeyAuto&rdquo;), con sede in {OPERATOR.address}, P.IVA {OPERATOR.vat}, e il soggetto che richiede
              l&apos;attivazione di un account concessionario sulla piattaforma (di seguito il
              &ldquo;Concessionario&rdquo;). Il Contratto disciplina l&apos;accesso e l&apos;utilizzo, dietro
              abbonamento, degli strumenti che KeyAuto mette a disposizione per la pubblicazione e la gestione di annunci
              di veicoli sul marketplace pubblico.
            </p>
          </Section>

          <Section title="2. Requisiti e registrazione">
            <p>
              Il servizio è riservato a operatori professionali del settore automotive (concessionarie, rivenditori,
              noleggiatori) muniti di partita IVA. La registrazione è soggetta a verifica da parte di KeyAuto, che può
              richiedere documentazione (es. visura camerale) a conferma dell&apos;attività. Il Concessionario garantisce
              la veridicità dei dati forniti in fase di registrazione e si impegna a mantenerli aggiornati.
            </p>
          </Section>

          <Section title="3. Periodo di prova (Demo)">
            <p>
              KeyAuto può mettere a disposizione un periodo di prova gratuito (&ldquo;Demo&rdquo;) con funzionalità e
              limiti d&apos;uso ridotti (numero di veicoli, lead e utenti), a esclusiva discrezione di KeyAuto. Al
              termine del periodo di prova, in assenza di attivazione di un piano in abbonamento, l&apos;accesso in
              scrittura alla piattaforma viene sospeso; i dati inseriti restano consultabili per un periodo ragionevole
              e possono essere cancellati decorso tale periodo.
            </p>
          </Section>

          <Section title="4. Piani, corrispettivi e fatturazione">
            <p>
              L&apos;utilizzo del servizio oltre il periodo di prova è subordinato alla sottoscrizione di un piano in
              abbonamento tra quelli resi disponibili da KeyAuto, con le relative funzionalità, limiti d&apos;uso e
              corrispettivo indicati al momento della sottoscrizione. <strong className="text-white">Il corrispettivo,
              la periodicità di fatturazione, la durata e le modalità di rinnovo sono quelli indicati nel piano
              sottoscritto dal Concessionario</strong>, che costituisce parte integrante del presente Contratto. Salvo
              diverso accordo scritto, i corrispettivi non sono rimborsabili per il periodo già fatturato.
            </p>
          </Section>

          <Section title="5. Durata, rinnovo e recesso">
            <p>
              Il Contratto ha la durata indicata nel piano sottoscritto e si rinnova secondo le modalità ivi previste,
              salvo disdetta comunicata dal Concessionario con le tempistiche e modalità indicate nel piano stesso o,
              in mancanza, con un preavviso scritto ragionevole a mezzo email a {" "}
              <a className="text-cyan-300 underline" href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>. Resta
              fermo il diritto di ciascuna parte di risolvere il Contratto per inadempimento grave dell&apos;altra
              parte, previa contestazione scritta.
            </p>
          </Section>

          <Section title="6. Obblighi del Concessionario">
            <p>Il Concessionario si impegna a:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>pubblicare esclusivamente veicoli realmente disponibili e di cui abbia titolo per la vendita o l&apos;intermediazione;</li>
              <li>inserire informazioni veritiere, complete e aggiornate su ciascun veicolo (dati tecnici, prezzo, immagini, disponibilità);</li>
              <li>rispondere con diligenza alle richieste di informazioni ricevute tramite la piattaforma;</li>
              <li>custodire le proprie credenziali di accesso e non consentirne l&apos;uso a soggetti non autorizzati;</li>
              <li>rispettare la normativa applicabile alla propria attività, incluse quelle su commercio, pubblicità e protezione dei consumatori;</li>
              <li>trattare i dati dei clienti ricevuti tramite la piattaforma nel rispetto della normativa privacy applicabile, in qualità di autonomo titolare del trattamento per i dati raccolti a valle del contatto.</li>
            </ul>
          </Section>

          <Section title="7. Ruolo di KeyAuto">
            <p>
              KeyAuto mette a disposizione l&apos;infrastruttura tecnologica per la pubblicazione degli annunci e la
              ricezione delle richieste degli utenti, ma <strong className="text-white">non è parte della compravendita</strong>
              tra Concessionario e cliente finale, non garantisce risultati commerciali (numero di contatti, vendite) e
              non verifica la veridicità di ogni singolo annuncio, fermo restando quanto previsto all&apos;art. 6.
            </p>
          </Section>

          <Section title="8. Sospensione e chiusura dell'account">
            <p>
              KeyAuto può sospendere o chiudere l&apos;account del Concessionario, dandone comunicazione, in caso di:
              mancato pagamento del corrispettivo dovuto; violazione degli obblighi di cui all&apos;art. 6; pubblicazione
              di contenuti falsi, ingannevoli o illeciti; uso della piattaforma in violazione di legge o del presente
              Contratto. La sospensione per mancato pagamento non esonera il Concessionario dal corrispettivo maturato.
            </p>
          </Section>

          <Section title="9. Proprietà intellettuale">
            <p>
              Il marchio KeyAuto, il software e la piattaforma restano di proprietà esclusiva di KeyAuto o dei rispettivi
              licenzianti. I contenuti caricati dal Concessionario (testi, immagini, dati dei veicoli) restano di sua
              titolarità o di quella dei rispettivi aventi diritto; il Concessionario concede a KeyAuto una licenza non
              esclusiva a utilizzarli per la pubblicazione e la promozione degli annunci sulla piattaforma, per la durata
              del Contratto.
            </p>
          </Section>

          <Section title="10. Limitazione di responsabilità">
            <p>
              Nei limiti consentiti dalla legge, la responsabilità di KeyAuto verso il Concessionario per eventuali
              inadempimenti relativi al servizio è limitata al corrispettivo effettivamente corrisposto dal
              Concessionario nei dodici mesi precedenti l&apos;evento. KeyAuto non risponde di interruzioni del servizio
              dovute a cause di forza maggiore o a fattori indipendenti dalla propria volontà.
            </p>
          </Section>

          <Section title="11. Modifiche al Contratto">
            <p>
              KeyAuto può aggiornare le presenti Condizioni Generali, dandone comunicazione ai Concessionari attivi con
              ragionevole anticipo. L&apos;utilizzo continuato del servizio dopo l&apos;entrata in vigore delle modifiche
              costituisce accettazione delle stesse; in caso di modifiche sostanziali sfavorevoli, il Concessionario ha
              diritto di recedere secondo quanto previsto all&apos;art. 5.
            </p>
          </Section>

          <Section title="12. Legge applicabile e foro competente">
            <p>
              Il Contratto è regolato dalla legge italiana. Per ogni controversia relativa alla sua validità,
              interpretazione o esecuzione è competente in via esclusiva il foro di Piacenza, salva diversa
              inderogabile previsione di legge.
            </p>
          </Section>

          <Section title="13. Contatti">
            <p>
              Per informazioni sui piani disponibili o su qualsiasi aspetto del presente Contratto è possibile scrivere
              a{" "}
              <a className="text-cyan-300 underline" href={`mailto:${OPERATOR.email}`}>
                {OPERATOR.email}
              </a>
              . Per il trattamento dei dati personali si rimanda all&apos;{" "}
              <Link className="text-cyan-300 underline" href="/privacy">Informativa sulla privacy</Link>.
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
