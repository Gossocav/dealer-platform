import { ExternalLink, Globe, KeyRound } from "lucide-react";
import { formatWebsiteForDisplay, resolveClickableWebsite } from "@/lib/website-url";

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
export function PulsanteNoleggio({ rentalUrl }: { rentalUrl: string | null }) {
  const noleggio = resolveClickableWebsite(rentalUrl);

  if (!noleggio) return null;

  return (
    <a
      href={noleggio}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_30px_-10px_rgba(76,130,247,0.7)] transition hover:brightness-105"
    >
      <KeyRound className="h-4 w-4" />
      Le nostre offerte di noleggio
    </a>
  );
}

/**
 * Il sito della concessionaria, sotto il suo nome.
 *
 * Una riga e non un pulsante: chi arriva qui e' arrivato per le auto, e il
 * sito e' un'informazione su chi le vende -- sta accanto al nome e alla citta',
 * dove si guarda per capire con chi si ha a che fare.
 */
export function LinkSitoConcessionaria({ website }: { website: string | null }) {
  const sito = resolveClickableWebsite(website);

  if (!sito) return null;

  return (
    <a
      href={sito}
      target="_blank"
      rel="noopener noreferrer nofollow"
      // "relative" perche' nel riquadro in cima c'e' una macchia di colore
      // messa in posizione assoluta: senza, il collegamento le finirebbe
      // sotto e non si potrebbe cliccare.
      className="relative mt-4 inline-flex max-w-full items-center gap-2 text-sm font-semibold text-cyan-300 transition hover:text-cyan-200"
    >
      <Globe className="h-4 w-4 flex-none" />
      <span className="truncate">{formatWebsiteForDisplay(website) ?? "Sito web"}</span>
      <ExternalLink className="h-3.5 w-3.5 flex-none opacity-60" />
    </a>
  );
}
