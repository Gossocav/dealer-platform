import { Globe, KeyRound } from "lucide-react";
import { resolveClickableWebsite } from "@/lib/website-url";

/**
 * I due collegamenti esterni della pagina di una concessionaria: il suo sito e
 * la sua pagina di noleggio.
 *
 * **Il pulsante del noleggio** l'ha chiesto il titolare il 03/09/2026: molte
 * concessionarie hanno un sito dedicato -- `noleggio.autogepy.it` -- che dalla
 * loro pagina qui non era raggiungibile. E' una cosa che si vende, non un
 * recapito: chi guarda le auto e sta pensando "forse invece la noleggio" deve
 * vederlo senza cercarlo, quindi e' l'unico pulsante pieno della pagina.
 *
 * **Il riquadro "Dove trovarci" non c'e' piu'.** Il 04/09/2026 il titolare ha
 * chiesto di toglierlo: metteva in una sezione a se' cose che non c'entrano
 * fra loro. Adesso il sito e' una riga sotto il nome della concessionaria e il
 * noleggio sta fra i pulsanti. Facebook, Instagram e LinkedIn sono spariti
 * nella stessa occasione: si raccoglievano nelle Impostazioni dal 02/07/2026 e
 * nessuna concessionaria li aveva mai compilati.
 *
 * **Ogni indirizzo si ricontrolla prima di diventare un collegamento.** Nel
 * database puo' esserci ancora qualcosa che non e' un indirizzo -- i campi sono
 * a testo libero da luglio -- e un pulsante che porta su una pagina morta e'
 * peggio di un pulsante assente.
 */
/**
 * Lo stile dei due pulsanti in cima, scritto una volta sola.
 *
 * Il titolare li ha voluti identici e affiancati (04/09/2026): due classi
 * copiate divergerebbero al primo ritocco, e due pulsanti che dovrebbero
 * essere gemelli e non lo sono si notano subito.
 */
const PULSANTE_IN_CIMA =
  "inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_30px_-10px_rgba(76,130,247,0.7)] transition hover:brightness-105";

export function PulsanteNoleggio({ rentalUrl }: { rentalUrl: string | null }) {
  const noleggio = resolveClickableWebsite(rentalUrl);

  if (!noleggio) return null;

  return (
    <a
      href={noleggio}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={PULSANTE_IN_CIMA}
    >
      <KeyRound className="h-4 w-4" />
      Le nostre offerte di noleggio
    </a>
  );
}

/**
 * Il sito della concessionaria, come pulsante accanto al noleggio.
 *
 * Era una riga di testo sotto il nome, con l'indirizzo scritto per esteso. Il
 * titolare l'ha voluta cosi' (04/09/2026): due pulsanti uguali, affiancati.
 *
 * **Dice "Visita il nostro sito" e non l'indirizzo.** Su un pulsante conta
 * cosa succede premendolo, non come si chiama la destinazione -- e un indirizzo
 * lungo dentro un pulsante o lo allarga o va troncato, e in tutti e due i casi
 * i due gemelli smettono di somigliarsi.
 */
export function BottoneSitoConcessionaria({ website }: { website: string | null }) {
  const sito = resolveClickableWebsite(website);

  if (!sito) return null;

  return (
    <a href={sito} target="_blank" rel="noopener noreferrer nofollow" className={PULSANTE_IN_CIMA}>
      <Globe className="h-4 w-4" />
      Visita il nostro sito
    </a>
  );
}
