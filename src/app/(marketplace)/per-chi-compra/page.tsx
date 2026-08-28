import type { Metadata } from "next";
import { toAbsoluteUrl } from "@/lib/public-marketplace";
import {
  BottonePrimario,
  BottoneSecondario,
  ChiusuraInvito,
  PresentazioneHero,
  SchedaNumerata,
  SchedaPunto,
  Sezione,
} from "@/components/marketplace/sezioni-presentazione";

/**
 * Chi arriva sulla home vede subito delle automobili, ma non trova scritto da
 * nessuna parte che cos'e' KeyAuto e perche' dovrebbe usarlo invece di
 * telefonare a un annuncio qualsiasi. Questa e' la pagina che lo dice a chi
 * compra; /per-le-concessionarie e' la stessa cosa dall'altro lato del banco.
 *
 * Distinta da /come-funziona di proposito: quella spiega i passaggi da fare,
 * questa spiega che cosa si ottiene. Le due si rimandano a vicenda.
 */

const descrizione =
  "Su KeyAuto trovi solo veicoli di concessionarie verificate: schede complete, prezzo dichiarato e contatto diretto con chi vende. Per chi compra è gratuito e non serve registrarsi.";

export const metadata: Metadata = {
  title: "Comprare un'auto su KeyAuto",
  description: descrizione,
  alternates: { canonical: toAbsoluteUrl("/per-chi-compra") },
  openGraph: {
    title: "Comprare un'auto su KeyAuto",
    description: descrizione,
    url: toAbsoluteUrl("/per-chi-compra"),
    type: "website",
    images: ["/opengraph-image"],
  },
};

const cosaTroviamo = [
  {
    titolo: "Solo venditori professionali",
    testo:
      "Ogni annuncio appartiene a una concessionaria con partita IVA, sede verificata e reputazione controllata prima della pubblicazione. Nessun privato improvvisato, nessun profilo anonimo dietro cui non c'è nessuno.",
  },
  {
    titolo: "Schede che dicono tutto",
    testo:
      "Chilometri, mese e anno di immatricolazione, alimentazione, cambio, potenza, classe di emissioni, colore, porte e posti. Quello che serve per farsi un'idea prima di prendere l'auto e andare a vederla.",
  },
  {
    titolo: "Il prezzo, scritto",
    testo:
      "Il prezzo è in vetrina e nella scheda, senza \"trattativa riservata\" e senza doverlo chiedere per saperlo. Se una concessionaria espone l'IVA, sulla scheda c'è scritto anche quello.",
  },
  {
    titolo: "Fotografie vere, e un avviso onesto",
    testo:
      "Le immagini arrivano dalla concessionaria. Sotto la galleria trovi scritto che sono indicative e che fa fede la visione diretta: preferiamo dirlo prima che scoprirlo dopo.",
  },
];

const comeSiCerca = [
  {
    numero: 1,
    titolo: "Restringi il campo",
    testo:
      "Marca, modello, prezzo, chilometri, alimentazione, cambio, carrozzeria, condizione. Oppure la ricerca avanzata, se hai già in mente esattamente cosa vuoi.",
  },
  {
    numero: 2,
    titolo: "Cerca vicino a te",
    testo:
      "Puoi limitare i risultati a un raggio di chilometri dalla tua città: un'ottima occasione a cinquecento chilometri di distanza, spesso, non è un'occasione.",
  },
  {
    numero: 3,
    titolo: "Scrivi a chi la vende",
    testo:
      "Dalla scheda del veicolo mandi la richiesta: nome, un recapito e due righe. Arriva alla concessionaria, che ti ricontatta per la visione o la prova su strada.",
  },
];

const garanzieDiChiarezza = [
  {
    titolo: "Non ti costa niente",
    testo:
      "Cercare, confrontare e mandare una richiesta è gratuito e non richiede alcuna registrazione. KeyAuto non chiede commissioni a chi compra: la piattaforma è pagata dalle concessionarie che espongono i veicoli.",
  },
  {
    titolo: "Parli direttamente con il venditore",
    testo:
      "Nessun call center in mezzo, nessun intermediario nascosto. La trattativa, la prova, il prezzo finale e la vendita restano fra te e la concessionaria.",
  },
  {
    titolo: "I tuoi dati restano al loro posto",
    testo:
      "La richiesta arriva solo alla concessionaria di quel veicolo e serve a farti ricontattare. Le comunicazioni commerciali sono un consenso a parte, che puoi non dare e revocare quando vuoi.",
  },
];

export default function PerChiCompraPage() {
  return (
    <main className="bg-slate-950">
      <PresentazioneHero
        occhiello="Per chi compra"
        titolo="L'usato che puoi guardare con calma"
        sottotitolo="KeyAuto raccoglie in un posto solo i veicoli delle concessionarie italiane verificate. Tu confronti, scegli e scrivi a chi vende. Senza registrarti, senza costi, senza nessuno in mezzo."
      >
        <div className="mt-9 flex flex-wrap gap-3">
          <BottonePrimario href="/auto">Guarda le auto disponibili</BottonePrimario>
          <BottoneSecondario href="/ricerca">Vai alla ricerca avanzata</BottoneSecondario>
        </div>
      </PresentazioneHero>

      <Sezione
        occhiello="Cosa trovi"
        titolo="Un catalogo di cui ci si può fidare"
        sottotitolo="La differenza fra un annuncio e un'offerta seria sta quasi sempre in quello che non viene scritto. Qui abbiamo deciso cosa deve esserci sempre."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {cosaTroviamo.map((punto) => (
            <SchedaPunto key={punto.titolo} titolo={punto.titolo} testo={punto.testo} />
          ))}
        </div>
      </Sezione>

      <Sezione
        occhiello="Come si arriva all'auto giusta"
        titolo="Tre passaggi, nessun modulo inutile"
        sottotitolo="Non chiediamo un account per farti guardare delle automobili. I tuoi dati te li chiediamo una volta sola: quando decidi tu di farti ricontattare."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {comeSiCerca.map((passo) => (
            <SchedaNumerata key={passo.numero} numero={passo.numero} titolo={passo.titolo} testo={passo.testo} />
          ))}
        </div>
      </Sezione>

      <Sezione
        occhiello="Le regole del gioco"
        titolo="Cosa facciamo, e cosa non facciamo"
        sottotitolo="KeyAuto mette in contatto chi compra e chi vende. Non vende automobili, non fa da garante sulla trattativa e non prende una percentuale sul tuo acquisto."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {garanzieDiChiarezza.map((punto) => (
            <SchedaPunto key={punto.titolo} titolo={punto.titolo} testo={punto.testo} />
          ))}
        </div>
      </Sezione>

      <ChiusuraInvito
        titolo="La tua prossima auto è già in vetrina"
        testo="Comincia dalla ricerca, oppure guarda quali concessionarie sono su KeyAuto e cosa hanno in questo momento."
      >
        <BottonePrimario href="/auto">Cerca un&apos;auto</BottonePrimario>
        <BottoneSecondario href="/concessionarie">Le concessionarie</BottoneSecondario>
        <BottoneSecondario href="/come-funziona">Come funziona, passo per passo</BottoneSecondario>
      </ChiusuraInvito>
    </main>
  );
}
