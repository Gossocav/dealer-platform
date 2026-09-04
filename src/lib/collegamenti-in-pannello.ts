/**
 * Il sito e i social di una concessionaria, pronti per il pannello
 * amministrativo. **Solo per il pannello.**
 *
 * Il 03/09/2026 il titolare ha deciso di togliere ogni collegamento verso i
 * siti delle concessionarie da tutte le pagine pubbliche: chi arriva sul
 * marketplace deve restarci, e un pulsante "visita il nostro sito" lo manda
 * altrove. Quella decisione e' sorvegliata da un test
 * (`nessuna-uscita-verso-i-siti.test.ts`) che fallisce se un file del
 * marketplace torna a nominare questi campi.
 *
 * Restavano pero' quattro caselle nelle Impostazioni -- sito, Facebook,
 * Instagram, LinkedIn -- che il concessionario compilava senza che nessuno,
 * nemmeno il titolare, potesse piu' leggerle: un dato raccolto e mai guardato.
 * Il 04/09/2026 si e' scelto di mostrarle **dentro il pannello
 * amministrativo**, che e' privato e non e' una pagina di destinazione per
 * chi cerca un'automobile. Il visitatore continua a non vederle; il titolare
 * sa chi ha un sito e chi e' attivo sui social prima di telefonargli.
 *
 * **Ogni indirizzo ripassa da `resolveClickableWebsite`**, anche quello dei
 * social. Il "Sito web" viene normalizzato quando si salva, i tre campi
 * social no: nel database ci puo' stare qualunque cosa sia stata incollata,
 * comprese le righe salvate prima che quel controllo esistesse. Un
 * "javascript:..." rimasto li' sarebbe codice eseguito nel browser di chi lo
 * clicca, e chi clicca qui e' l'amministratore della piattaforma.
 */

import { formatWebsiteForDisplay, resolveClickableWebsite } from "@/lib/website-url";

/** I campi del dealer che questo modulo sa leggere. */
export type CollegamentiDelDealer = {
  website?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  linkedin_url?: string | null;
};

export type CollegamentoInPannello = {
  /** Come si chiama a schermo: "Sito", "Facebook", ... */
  etichetta: string;
  /** L'indirizzo su cui si va, gia' controllato. */
  url: string;
  /** L'indirizzo come si legge, senza "https://": va nel suggerimento. */
  leggibile: string;
};

const CAMPI: Array<{ chiave: keyof CollegamentiDelDealer; etichetta: string }> = [
  { chiave: "website", etichetta: "Sito" },
  { chiave: "facebook_url", etichetta: "Facebook" },
  { chiave: "instagram_url", etichetta: "Instagram" },
  { chiave: "linkedin_url", etichetta: "LinkedIn" },
];

/**
 * I collegamenti buoni di una concessionaria, nell'ordine in cui si mostrano.
 *
 * Un campo vuoto non compare, e nemmeno un campo con dentro qualcosa che non
 * e' un indirizzo: un'etichetta cliccabile che non porta da nessuna parte e'
 * peggio di un'etichetta assente, perche' chi la vede crede che il
 * concessionario abbia un sito.
 */
export function collegamentiDelDealer(dealer: CollegamentiDelDealer): CollegamentoInPannello[] {
  const collegamenti: CollegamentoInPannello[] = [];

  for (const campo of CAMPI) {
    const url = resolveClickableWebsite(dealer[campo.chiave]);
    if (!url) continue;

    collegamenti.push({
      etichetta: campo.etichetta,
      url,
      leggibile: formatWebsiteForDisplay(url) ?? url,
    });
  }

  return collegamenti;
}
