import type { Metadata } from "next";
import type { ReactNode } from "react";

const LAST_UPDATED = "24 luglio 2026";

const CONTROLLER = {
  name: "KeyAuto Marketplace",
  address: "Località Ca' Vantel 1, 29025 Gropparello (PC)",
  vat: "02543220970",
  email: "amministrazione@keyauto.it",
};

export const metadata: Metadata = {
  title: "Informativa sulla privacy",
  description:
    "Informativa sul trattamento dei dati personali di KeyAuto Marketplace ai sensi del Regolamento (UE) 2016/679 (GDPR).",
};

export default function PrivacyPage() {
  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">Note legali</p>
        <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Informativa sulla privacy</h1>
        <p className="mt-3 text-sm text-slate-400">
          Ultimo aggiornamento: {LAST_UPDATED}. La presente informativa è resa ai sensi degli artt. 13 e 14 del
          Regolamento (UE) 2016/679 (&ldquo;GDPR&rdquo;) e del D.Lgs. 196/2003 come modificato dal D.Lgs. 101/2018.
        </p>

        <div className="mt-10 space-y-9">
          <Section title="1. Titolare del trattamento">
            <p>Il Titolare del trattamento dei dati personali è:</p>
            <ul className="mt-3 space-y-1">
              <li><strong className="text-white">{CONTROLLER.name}</strong></li>
              <li>{CONTROLLER.address}</li>
              <li>Partita IVA: {CONTROLLER.vat}</li>
              <li>
                Email:{" "}
                <a className="text-cyan-300 underline" href={`mailto:${CONTROLLER.email}`}>
                  {CONTROLLER.email}
                </a>
              </li>
            </ul>
            <p className="mt-3">
              Il Titolare non ha nominato un Responsabile della protezione dei dati (DPO). Per qualsiasi richiesta in
              materia di dati personali è possibile scrivere all&apos;indirizzo email sopra indicato.
            </p>
          </Section>

          <Section title="2. Dati personali raccolti">
            <p>A seconda dell&apos;interazione con la piattaforma, trattiamo le seguenti categorie di dati:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                <strong className="text-white">Richieste di informazioni su un veicolo</strong>: nome, cognome, tipo di
                cliente (privato/azienda), email, numero di telefono, messaggio e riferimento al veicolo di interesse.
              </li>
              <li>
                <strong className="text-white">Richieste di Demo (concessionari)</strong>: ragione sociale, partita IVA,
                provincia e città, nome del referente, email, telefono e cellulare, numero indicativo di veicoli,
                marchi trattati, gestionale utilizzato, note e la visura camerale caricata.
              </li>
              <li>
                <strong className="text-white">Registrazione e gestione dell&apos;account concessionario</strong>: dati
                anagrafici e di contatto dell&apos;attività e dell&apos;utente, credenziali di accesso e dati inseriti
                nell&apos;uso della piattaforma.
              </li>
              <li>
                <strong className="text-white">Dati tecnici</strong>: indirizzo IP e dati di navigazione strettamente
                necessari al funzionamento e alla sicurezza del servizio (es. limitazione degli abusi).
              </li>
            </ul>
          </Section>

          <Section title="3. Finalità e base giuridica del trattamento">
            <ul className="mt-1 list-disc space-y-2 pl-5">
              <li>
                Dare seguito alle richieste di informazioni e metterti in contatto con la concessionaria interessata —
                base giuridica: esecuzione di misure precontrattuali su richiesta dell&apos;interessato (art. 6.1.b GDPR).
              </li>
              <li>
                Gestire le richieste di Demo, la registrazione e l&apos;erogazione del servizio ai concessionari — base
                giuridica: esecuzione del contratto o di misure precontrattuali (art. 6.1.b GDPR).
              </li>
              <li>
                Inviare comunicazioni di servizio (conferme, notifiche operative) — base giuridica: esecuzione del
                contratto e legittimo interesse (art. 6.1.b e 6.1.f GDPR).
              </li>
              <li>
                Garantire la sicurezza della piattaforma e adempiere agli obblighi di legge — base giuridica: legittimo
                interesse e obbligo legale (art. 6.1.f e 6.1.c GDPR).
              </li>
            </ul>
          </Section>

          <Section title="4. Modalità del trattamento">
            <p>
              I dati sono trattati con strumenti elettronici, adottando misure tecniche e organizzative adeguate a
              garantirne la sicurezza, la riservatezza e l&apos;integrità, e sono accessibili solo al personale
              autorizzato e ai responsabili esterni indicati al punto 5.
            </p>
          </Section>

          <Section title="5. Destinatari e responsabili del trattamento">
            <p>
              Per erogare il servizio ci avvaliamo di fornitori terzi che trattano i dati per nostro conto, nominati
              responsabili del trattamento ai sensi dell&apos;art. 28 GDPR:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li><strong className="text-white">Supabase</strong> — database e archiviazione sicura dei dati e dei documenti.</li>
              <li><strong className="text-white">Vercel</strong> — hosting e distribuzione dell&apos;applicazione web.</li>
              <li><strong className="text-white">Resend</strong> — invio delle email transazionali e di notifica.</li>
            </ul>
            <p className="mt-3">
              I dati possono inoltre essere comunicati alle concessionarie destinatarie delle richieste di informazioni,
              nella misura necessaria a ricontattarti, e ad autorità competenti ove previsto dalla legge. I dati non
              sono oggetto di diffusione né di vendita a terzi.
            </p>
          </Section>

          <Section title="6. Trasferimento dei dati">
            <p>
              I dati sono conservati preferibilmente su server situati nell&apos;Unione Europea. Qualora un fornitore
              comportasse un trasferimento verso Paesi terzi, questo avverrà solo in presenza di garanzie adeguate ai
              sensi degli artt. 44 e seguenti del GDPR (es. clausole contrattuali standard).
            </p>
          </Section>

          <Section title="7. Periodo di conservazione">
            <p>
              I dati sono conservati per il tempo strettamente necessario alle finalità per cui sono stati raccolti: le
              richieste di informazioni e di Demo per il tempo utile a gestire il contatto e i conseguenti adempimenti;
              i dati relativi agli account per la durata del rapporto e, successivamente, nei termini previsti dagli
              obblighi di legge. Al termine, i dati vengono cancellati o resi anonimi.
            </p>
          </Section>

          <Section title="8. Diritti dell'interessato">
            <p>In qualsiasi momento hai diritto di:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>accedere ai tuoi dati e ottenerne copia (art. 15);</li>
              <li>chiederne la rettifica o l&apos;aggiornamento (art. 16);</li>
              <li>chiederne la cancellazione (art. 17);</li>
              <li>chiedere la limitazione del trattamento (art. 18);</li>
              <li>opporti al trattamento (art. 21);</li>
              <li>ricevere i dati in formato strutturato e portabile (art. 20);</li>
              <li>revocare il consenso, ove prestato, senza pregiudicare i trattamenti già effettuati.</li>
            </ul>
            <p className="mt-3">
              Per esercitare i tuoi diritti puoi scrivere a{" "}
              <a className="text-cyan-300 underline" href={`mailto:${CONTROLLER.email}`}>
                {CONTROLLER.email}
              </a>
              . Hai inoltre diritto di proporre reclamo all&apos;Autorità Garante per la protezione dei dati personali
              (www.garanteprivacy.it).
            </p>
          </Section>

          <Section title="9. Cookie">
            <p>
              <strong>Cookie tecnici.</strong> La piattaforma utilizza cookie tecnici e di sessione necessari al
              funzionamento del servizio e alla gestione dell&apos;autenticazione. Questi cookie non richiedono
              consenso preventivo e non possono essere disattivati senza compromettere il funzionamento del sito.
            </p>
            <p>
              <strong>Cookie di misurazione.</strong> Previo tuo consenso, la piattaforma utilizza cookie di
              misurazione statistica forniti da Google (Google Analytics) per capire quali pagine vengono consultate e
              migliorare il servizio. Questi cookie <strong>non vengono installati finché non presti il consenso</strong>:
              alla prima visita ti viene chiesto di scegliere, e finché non scegli nessuno strumento di misurazione
              viene caricato. Se rifiuti, non viene installato alcun cookie di misurazione.
            </p>
            <p>
              <strong>Come cambiare idea.</strong> Puoi modificare la tua scelta in qualsiasi momento dal collegamento
              &ldquo;Preferenze cookie&rdquo; in fondo a ogni pagina. La revoca è semplice quanto il consenso e ha
              effetto immediato.
            </p>
            <p>
              Non vengono utilizzati cookie di profilazione pubblicitaria né cookie che ricostruiscano il tuo
              comportamento su siti di terzi.
            </p>
          </Section>

          <Section title="10. Modifiche all'informativa">
            <p>
              Il Titolare si riserva di aggiornare la presente informativa. Le eventuali modifiche saranno pubblicate su
              questa pagina con l&apos;indicazione della data di ultimo aggiornamento.
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
