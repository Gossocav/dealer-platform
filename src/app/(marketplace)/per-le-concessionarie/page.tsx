import type { Metadata } from "next";
import { toAbsoluteUrl } from "@/lib/public-marketplace";
import { RevealOnScroll } from "@/components/marketplace/reveal-on-scroll";
import Link from "next/link";
import {
  BottonePrimario,
  BottoneSecondario,
  ChiusuraInvito,
  PresentazioneHero,
  SchedaPunto,
  Sezione,
} from "@/components/marketplace/sezioni-presentazione";

/**
 * Il lato concessionaria della presentazione. Speculare a /per-chi-compra:
 * dalla home si entra da una delle due porte a seconda di chi si e'.
 *
 * Qui si dice **cosa offriamo**; /registrazione resta il posto dove si sceglie
 * e si chiede. I numeri dei piani sono ripetuti qui perche' una pagina che
 * vende senza dire quanto costa fa perdere tempo a tutti -- e un test
 * (`src/lib/pagine-presentazione.test.ts`) li confronta con quelli scritti
 * nelle pagine dei piani, perche' non possano divergere.
 */

const descrizione =
  "KeyAuto dà alla tua concessionaria una vetrina sul marketplace e il gestionale che ci sta dietro: annunci, richieste dei clienti, agenda e statistiche in un pannello unico. Sette giorni di prova gratuita.";

export const metadata: Metadata = {
  title: "KeyAuto per la tua concessionaria",
  description: descrizione,
  alternates: { canonical: toAbsoluteUrl("/per-le-concessionarie") },
  openGraph: {
    title: "KeyAuto per la tua concessionaria",
    description: descrizione,
    url: toAbsoluteUrl("/per-le-concessionarie"),
    type: "website",
    images: ["/opengraph-image"],
  },
};

const laVetrina = [
  {
    titolo: "I tuoi veicoli nel marketplace",
    testo:
      "Ogni auto pubblicata entra nel catalogo, nei filtri di ricerca, nelle categorie per carrozzeria e fra gli ultimi arrivi in home. Chi cerca quel modello ti trova senza sapere che esisti.",
  },
  {
    titolo: "Una pagina tutta tua",
    testo:
      "La concessionaria ha un suo indirizzo pubblico con il profilo, la sede e tutto lo stock disponibile in quel momento. E' il link da mettere nelle inserzioni e sui social: porta a casa tua, non su un annuncio singolo.",
  },
  {
    titolo: "Costruita per essere trovata",
    testo:
      "Indirizzi puliti, sitemap aggiornata da sola e anteprime curate quando un annuncio viene condiviso in chat o su un social. Il lavoro che di solito si paga a parte qui è già dentro.",
  },
];

const ilGestionale = [
  {
    titolo: "Veicoli",
    testo: "Inserimento, modifica, foto, pubblicazione e ritiro dalla vetrina. Lo stock e le schede in un posto solo.",
  },
  {
    titolo: "Richieste dei clienti",
    testo: "Ogni contatto in arrivo dal marketplace diventa una scheda da lavorare, con lo storico di cosa è stato detto e quando.",
  },
  {
    titolo: "Clienti",
    testo: "L'anagrafica di chi si è fatto avanti, per non ricominciare da zero alla telefonata successiva.",
  },
  {
    titolo: "Agenda e appuntamenti",
    testo: "Visioni e prove su strada fissate accanto al contatto a cui appartengono, così nessuna resta scritta su un foglietto.",
  },
  {
    titolo: "Statistiche",
    testo: "Quante richieste arrivano, da quali veicoli, come si muove lo stock. Numeri veri, presi dai tuoi dati.",
  },
  {
    titolo: "Impostazioni della concessionaria",
    testo: "Dati, sede, recapiti e profilo pubblico: quello che i clienti vedono lo decidi tu, e lo cambi quando vuoi.",
  },
];

const modiPerCaricare = [
  {
    titolo: "A mano, veicolo per veicolo",
    testo: "Il modulo completo con dati tecnici, dotazioni, foto e prezzo. Per il nuovo arrivo di oggi è la strada più breve.",
  },
  {
    titolo: "Da un file Excel o CSV",
    testo: "Carichi il file che usi già e la piattaforma riconosce le colonne anche quando hanno nomi diversi dai nostri.",
  },
  {
    titolo: "Da un feed del tuo gestionale",
    testo: "Se il tuo sistema espone un flusso CSV, XML o JSON, KeyAuto lo legge e lo trasforma in annunci.",
  },
  {
    titolo: "Dal sito della tua concessionaria",
    testo: "Se lo stock è già online sul tuo sito, si porta dentro da lì: marca, modello, prezzo, chilometri e fotografie, senza reinserire niente.",
  },
];

const piani = [
  {
    nome: "Piano Base",
    prezzo: "€149/mese",
    annunci: "Fino a 50 annunci attivi",
    testo: "Pubblicazione, schede veicolo, gestione delle richieste e pannello concessionario. Il necessario per esserci davvero.",
    href: "/registrazione/base",
  },
  {
    nome: "Piano Pro",
    prezzo: "€399/mese",
    annunci: "Fino a 150 annunci attivi",
    testo: "Tutto il Base, più il CRM delle richieste, le statistiche dettagliate, l'esportazione dei dati e il supporto prioritario.",
    href: "/registrazione/pro",
    inEvidenza: true,
  },
  {
    nome: "Piano Elite",
    prezzo: "€699/mese",
    annunci: "Fino a 300 annunci attivi",
    testo: "Tutto il Pro, più la maggiore visibilità in vetrina, la promozione sui canali social ufficiali e la scheda consegna da far firmare al cliente.",
    href: "/registrazione/elite",
  },
];

export default function PerLeConcessionariePage() {
  return (
    <main className="bg-slate-950">
      <PresentazioneHero
        occhiello="Per le concessionarie"
        titolo="La tua vetrina online, e il gestionale che ci sta dietro"
        sottotitolo="Con KeyAuto il parco auto si pubblica una volta e vive in due posti: davanti ai clienti che cercano, e dentro un pannello dove tu lo gestisci. Sette giorni di prova gratuita, senza carta di credito."
      >
        <div className="mt-9 flex flex-wrap gap-3">
          <BottonePrimario href="/demo">Richiedi la Demo gratuita</BottonePrimario>
          <BottoneSecondario href="/registrazione">Vedi i piani e i prezzi</BottoneSecondario>
        </div>
      </PresentazioneHero>

      <Sezione
        occhiello="La vetrina"
        titolo="Dove finiscono le auto che pubblichi"
        sottotitolo="Un annuncio serve a essere visto. Su KeyAuto entra in un catalogo che le persone sfogliano per cercare un'automobile, non per cercare te: è così che si incontrano clienti nuovi."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {laVetrina.map((punto) => (
            <SchedaPunto key={punto.titolo} titolo={punto.titolo} testo={punto.testo} />
          ))}
        </div>
      </Sezione>

      <Sezione
        occhiello="Il pannello"
        titolo="Sei strumenti, un unico posto"
        sottotitolo="Quello che oggi sta sparso fra un file Excel, la casella di posta e un quaderno, qui sta insieme e parla la stessa lingua."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ilGestionale.map((punto) => (
            <SchedaPunto key={punto.titolo} titolo={punto.titolo} testo={punto.testo} />
          ))}
        </div>
      </Sezione>

      <Sezione
        occhiello="Partire in fretta"
        titolo="Quattro modi per portare dentro lo stock"
        sottotitolo="Il momento in cui si molla una piattaforma nuova è quello in cui bisogna reinserire duecento automobili a mano. Per questo ci sono quattro strade, e solo una passa dalla tastiera."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {modiPerCaricare.map((punto) => (
            <SchedaPunto key={punto.titolo} titolo={punto.titolo} testo={punto.testo} />
          ))}
        </div>
      </Sezione>

      <Sezione
        occhiello="I tuoi dati"
        titolo="Quello che è tuo lo vedi solo tu"
        sottotitolo="Su KeyAuto convivono più concessionarie, e la separazione non è una promessa scritta in un contratto: è il database stesso a impedire che una concessionaria legga i dati di un'altra, indipendentemente da come si arrivi a chiederli."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SchedaPunto
            titolo="Anagrafiche e contatti al riparo"
            testo="Nomi, email e numeri di telefono dei tuoi clienti non sono accessibili a nessun'altra concessionaria, e non compaiono nelle pagine pubbliche del marketplace."
          />
          <SchedaPunto
            titolo="Le tue schede restano tue"
            testo="Puoi esporre lo stock e ritirarlo quando vuoi. I dati che carichi servono a far funzionare la tua vetrina, non a costruirne una di qualcun altro."
          />
        </div>
      </Sezione>

      <Sezione
        occhiello="I piani"
        titolo="Si paga per lo spazio in vetrina, non per ogni contatto"
        sottotitolo="Un canone mensile, nessuna commissione sulle vendite e nessun costo a richiesta ricevuta. Quello che incassi da una trattativa resta tuo per intero."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {piani.map((piano) => (
            <article
              key={piano.nome}
              className={`flex flex-col rounded-3xl border p-6 transition ${
                piano.inEvidenza
                  ? "border-cyan-300/40 bg-cyan-400/[0.06] hover:border-cyan-300/70"
                  : "border-white/10 bg-white/[0.03] hover:border-blue-400/40"
              }`}
            >
              <h3 className="text-xl font-semibold text-white">{piano.nome}</h3>
              <p className="mt-2 text-2xl font-bold text-white">{piano.prezzo}</p>
              <p className="mt-1 text-sm font-medium text-cyan-200">{piano.annunci}</p>
              <p className="mt-4 flex-1 text-sm leading-6 text-slate-400">{piano.testo}</p>
              <Link
                href={piano.href}
                className="mt-6 inline-flex w-full items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
              >
                Scopri il {piano.nome.replace("Piano ", "")}
              </Link>
            </article>
          ))}
        </div>

        <RevealOnScroll delayMs={120} className="mt-6 rounded-3xl border border-cyan-300/30 bg-cyan-400/[0.07] p-6 sm:p-8">
          <h3 className="text-lg font-semibold text-white">Prima di decidere, provala</h3>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            La Demo dura sette giorni ed è gratuita: pubblichi fino a 10 veicoli, ricevi fino a 20 richieste e usi il
            pannello con i tuoi dati veri, non con un esempio. È riservata ai professionisti del settore: al momento della
            richiesta si allega la visura camerale, e la verifica richiede uno o due giorni lavorativi.
          </p>
          <div className="mt-6">
            <BottonePrimario href="/demo">Richiedi la Demo gratuita</BottonePrimario>
          </div>
        </RevealOnScroll>
      </Sezione>

      <ChiusuraInvito
        titolo="Il tuo parco auto merita di essere visto"
        testo="Comincia dalla prova gratuita, oppure guarda i piani e scrivici: rispondiamo con i numeri della tua concessionaria in mano."
      >
        <BottonePrimario href="/demo">Richiedi la Demo</BottonePrimario>
        <BottoneSecondario href="/registrazione">Piani e prezzi</BottoneSecondario>
        <BottoneSecondario href="/termini-concessionari">Condizioni per le concessionarie</BottoneSecondario>
      </ChiusuraInvito>
    </main>
  );
}
