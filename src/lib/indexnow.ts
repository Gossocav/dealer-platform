import { getAppBaseUrl } from "@/lib/public-marketplace";

/**
 * Avvisa i motori di ricerca quando un annuncio nasce o cambia.
 *
 * **Perche' serve.** Su Bing il sito era a **zero pagine**, verificato il
 * 05/09/2026 con la stessa ricerca che su autoscout24.it ne restituisce 23.
 * La sitemap la si lascia li' e si aspetta che qualcuno passi; IndexNow e'
 * l'unico modo per dire "guarda qui adesso", ed e' una chiamata sola.
 *
 * Google non aderisce: per Google restano la sitemap e la pazienza. Bing,
 * Yandex, Naver e Seznam si', e per un sito che su Bing non esiste affatto e'
 * il guadagno piu' facile che ci sia.
 *
 * **La chiave e' pubblica per costruzione, non per distrazione.** Il
 * protocollo chiede di pubblicarla come file sul sito
 * (`/<chiave>.txt`): serve al motore per verificare che chi segnala
 * quell'indirizzo sia davvero chi controlla il sito. Non apre niente e non
 * autorizza niente: al massimo qualcun altro potrebbe segnalare **le nostre
 * pagine**, il che e' un dispetto senza conseguenze. Per questo sta nel
 * repository e non fra i segreti.
 */
export const CHIAVE_INDEXNOW = "4c50854406ce96fb1b8d5b2626ec3e9d";

/** Il tetto dichiarato dal protocollo: oltre, la richiesta viene rifiutata. */
export const MAX_INDIRIZZI_PER_SEGNALAZIONE = 10_000;

const ENDPOINT = "https://api.indexnow.org/indexnow";
const TIMEOUT_MS = 10_000;

export type SegnalazioneIndexNow = {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
};

/**
 * Il messaggio da spedire, o niente se non c'e' niente da dire.
 *
 * Tiene solo gli indirizzi di questo sito: il protocollo rifiuta l'intera
 * richiesta se anche uno solo appartiene a un altro dominio, quindi un
 * indirizzo sbagliato farebbe perdere anche tutti gli altri.
 */
export function costruisciSegnalazione(baseUrl: string, indirizzi: string[]): SegnalazioneIndexNow | null {
  let host: string;
  try {
    host = new URL(baseUrl).host;
  } catch {
    return null;
  }

  const nostri = [...new Set(indirizzi.map((i) => String(i ?? "").trim()).filter(Boolean))].filter((indirizzo) => {
    try {
      return new URL(indirizzo).host === host;
    } catch {
      return false;
    }
  });

  if (nostri.length === 0) {
    return null;
  }

  return {
    host,
    key: CHIAVE_INDEXNOW,
    keyLocation: `${baseUrl.replace(/\/$/, "")}/${CHIAVE_INDEXNOW}.txt`,
    urlList: nostri.slice(0, MAX_INDIRIZZI_PER_SEGNALAZIONE),
  };
}

/**
 * Spedisce la segnalazione. **Non fallisce mai verso chi la chiama.**
 *
 * E' un effetto collaterale nel senso stretto che questo progetto da' alla
 * parola: un'auto importata correttamente resta importata anche se Bing non
 * risponde. Se saltasse, farebbe fallire una sincronizzazione riuscita, che e'
 * il contrario di quello che serve.
 */
export async function segnalaAIndexNow(indirizzi: string[]): Promise<{ inviati: number; esito: string }> {
  const segnalazione = costruisciSegnalazione(getAppBaseUrl(), indirizzi);

  if (!segnalazione) {
    return { inviati: 0, esito: "niente-da-segnalare" };
  }

  try {
    const risposta = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(segnalazione),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!risposta.ok) {
      console.warn("[indexnow] segnalazione rifiutata", { stato: risposta.status, quanti: segnalazione.urlList.length });
      return { inviati: 0, esito: `rifiutata-${risposta.status}` };
    }

    return { inviati: segnalazione.urlList.length, esito: "inviata" };
  } catch (errore) {
    console.warn("[indexnow] segnalazione non riuscita", { errore: errore instanceof Error ? errore.message : String(errore) });
    return { inviati: 0, esito: "non-riuscita" };
  }
}

/** L'indirizzo pubblico di una scheda veicolo, quello che si segnala. */
export function indirizzoDellaScheda(vehicleId: string) {
  return `${getAppBaseUrl().replace(/\/$/, "")}/auto/${vehicleId}`;
}
