/**
 * Andare a prendere le pagine sul sito della concessionaria.
 *
 * Sta a se' perche' lo usano in due: l'importazione che il concessionario
 * lancia a mano e la sincronizzazione che gira di notte. Erano dentro
 * l'endpoint dell'importazione, e la sincronizzazione avrebbe dovuto
 * riscriverle -- due copie della stessa attesa e degli stessi tentativi, che
 * col tempo divergono.
 *
 * Qui dentro c'e' solo la rete: chi legge cosa c'e' scritto nelle pagine sta
 * in "dealer-site-import", che non tocca ne' rete ne' database.
 */

const SITEMAP_USATO = "auto_usate_0-sitemap.xml";

// Il sito della concessionaria non e' un fornitore su cui contare: interrogato
// in fretta smette di rispondere. Misurato sul sito vero -- leggendo 154
// schede di fila ventidue tornavano vuote; rilette con calma c'erano tutte.
export const PAUSA_FRA_SCHEDE_MS = 400;
const TENTATIVI_PER_SCHEDA = 2;
const TIMEOUT_SCHEDA_MS = 15000;
const PAUSA_FRA_TENTATIVI_MS = 800;

import { parseDealerStockSitemap, type DealerSiteEntry } from "@/lib/dealer-site-import";
import { fetchWithSsrfProtection, IndirizzoNonAmmesso } from "@/lib/ssrf-protection";

/**
 * Il solo nome del sito, senza percorsi ne' parametri.
 *
 * Gli indirizzi veri li costruiamo noi: cosi' questa funzione non si puo'
 * usare per far leggere al server un indirizzo qualsiasi.
 */
export function normalizzaSitoConcessionaria(value: unknown) {
  const grezzo = String(value ?? "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!grezzo || /\s/.test(grezzo)) return null;

  const host = grezzo.split("/")[0].toLowerCase();
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host.replace(/^www\./, "") : null;
}

/**
 * Legge una pagina, senza mai finire dentro la nostra rete.
 *
 * **Perche' non basta `normalizzaSitoConcessionaria`.** Quella accetta il
 * nome di un sito, e va bene: e' il concessionario che dice qual e' il suo.
 * Ma un nome pubblico puo' **puntare** a un indirizzo interno, e un sito
 * pubblico puo' rispondere "vai qui" indicandone uno. Fino al 05/09/2026 qui
 * si chiamava `fetch` liscio, che i rimbalzi li segue da solo e senza
 * chiedere niente a nessuno: era l'unico dei tre punti che escono verso
 * l'esterno a non avere nessuna protezione.
 *
 * Ora passa dalla stessa protezione delle importazioni e del proxy delle
 * fotografie, che guarda **dove porta** ogni indirizzo, a ogni rimbalzo.
 */
export type EsitoLettura =
  | { ok: true; html: string }
  /**
   * `frenato`: il sito ha risposto 429, "troppe richieste". Non e' la pagina
   * che manca, e' il sito che ci sta chiedendo di rallentare: ritentare
   * subito peggiora le cose, e chi legge una fila di schede deve fermarsi.
   * `non-letta`: tutto il resto -- errore, tempo scaduto, indirizzo rifiutato.
   */
  | {
      ok: false;
      motivo: "frenato" | "non-letta";
      /**
       * L'ultimo stato HTTP visto, se il sito ha risposto. Distingue "non
       * l'ho raggiunto" (nessuna risposta: `stato` assente) da "l'ho
       * raggiunto e mi ha detto di no" (404, 403, 500...). Chi legge una fila
       * di schede non lo guarda; chi deve spiegare a una persona perche'
       * l'elenco non si legge, si'.
       */
      stato?: number;
    };

export async function leggiPaginaConEsito(url: string, tentativi = TENTATIVI_PER_SCHEDA): Promise<EsitoLettura> {
  let ultimoStato: number | undefined;
  for (let i = 0; i < tentativi; i += 1) {
    try {
      const risposta = await fetchWithSsrfProtection(url, {
        headers: { "User-Agent": "KeyAuto/1.0 (+https://www.keyauto.it)" },
        signal: AbortSignal.timeout(TIMEOUT_SCHEDA_MS),
      });
      if (risposta.ok) return { ok: true, html: await risposta.text() };
      // Dal 07/09/2026 il sito di Autogepy risponde cosi' dalla seconda scheda
      // in poi. Un secondo tentativo dopo meno di un secondo e' esattamente
      // quello che il 429 chiede di non fare.
      if (risposta.status === 429) return { ok: false, motivo: "frenato", stato: 429 };
      ultimoStato = risposta.status;
    } catch (errore) {
      // Un indirizzo rifiutato non si ritenta: la seconda volta e' rifiutato
      // uguale, e l'attesa fra un tentativo e l'altro moltiplicata per le
      // centinaia di schede di un sito diventa un fermo lungo per niente.
      if (errore instanceof IndirizzoNonAmmesso) return { ok: false, motivo: "non-letta" };
      // Tutto il resto si ritenta: vedi la nota sulla pausa qui sopra.
    }
    if (i + 1 < tentativi) await new Promise((r) => setTimeout(r, PAUSA_FRA_TENTATIVI_MS));
  }
  return ultimoStato === undefined ? { ok: false, motivo: "non-letta" } : { ok: false, motivo: "non-letta", stato: ultimoStato };
}

/** Come sopra, per chi vuole solo il testo e non il motivo. */
export async function leggiPagina(url: string, tentativi = TENTATIVI_PER_SCHEDA): Promise<string | null> {
  const esito = await leggiPaginaConEsito(url, tentativi);
  return esito.ok ? esito.html : null;
}

/**
 * Perche' l'elenco non si e' letto: sono **tre** cose diverse, e chi le
 * confonde da' la colpa alla persona sbagliata.
 *
 * Fino al 23/09/2026 un concessionario con il sito su GestionaleAuto.com
 * scriveva il suo indirizzo, giusto, e leggeva *"Verifica l'indirizzo"*. Il
 * sito rispondeva benissimo (la home 200, la sitemap che cerchiamo 404 con
 * una pagina HTML): l'indirizzo era corretto, era il **formato** che non
 * sappiamo leggere -- oggi leggiamo i siti costruiti con DealerK. Il
 * messaggio mentiva, incolpava l'utente di un limite nostro, e lui se ne
 * andava al primo tentativo. Misurato quel giorno su cinque indirizzi:
 * robertoferrariauto.it 404 text/html; i tre siti DealerK collegati 200
 * text/xml; un dominio inesistente nessuna risposta.
 *
 * - `non-raggiunto`: nessuna risposta (nome che non esiste, tempo scaduto,
 *   indirizzo rifiutato dalla protezione di rete);
 * - `frenato`: il sito ha risposto 429, "troppe richieste";
 * - `elenco-non-trovato`: il sito risponde, ma all'indirizzo della sitemap
 *   dice di no (404, 403, 500...);
 * - `elenco-illeggibile`: all'indirizzo c'e' qualcosa (200), ma non e' una
 *   sitemap: nessun `<loc>` dentro. Tipico del sito che risponde 200 con
 *   una pagina "non trovato".
 */
export type EsitoElenco =
  | { ok: true; voci: DealerSiteEntry[] }
  | {
      ok: false;
      motivo: "non-raggiunto" | "frenato" | "elenco-non-trovato" | "elenco-illeggibile";
      /** L'indirizzo esatto che abbiamo provato: chi legge il messaggio lo puo' aprire nel browser. */
      indirizzo: string;
      stato?: number;
    };

export async function elencoStockConEsito(host: string): Promise<EsitoElenco> {
  const indirizzo = `https://www.${host}/${SITEMAP_USATO}`;
  const esito = await leggiPaginaConEsito(indirizzo);
  if (!esito.ok) {
    if (esito.motivo === "frenato") return { ok: false, motivo: "frenato", indirizzo, stato: 429 };
    if (esito.stato !== undefined) return { ok: false, motivo: "elenco-non-trovato", indirizzo, stato: esito.stato };
    return { ok: false, motivo: "non-raggiunto", indirizzo };
  }
  if (!/<loc>/i.test(esito.html)) return { ok: false, motivo: "elenco-illeggibile", indirizzo, stato: 200 };
  return { ok: true, voci: parseDealerStockSitemap(esito.html, host) };
}

/**
 * Le parole per una persona, una per ogni motivo. Ogni frase dice **cosa
 * puo' fare lei**, e nessuna le da' la colpa: in due casi su tre l'indirizzo
 * e' giusto e il limite e' nostro.
 */
export function spiegaElencoNonLetto(esito: Extract<EsitoElenco, { ok: false }>, host: string) {
  const altrove = "Intanto puoi caricare lo stock da un file (CSV o Excel) o da un feed, dalle altre sezioni di questa pagina.";
  switch (esito.motivo) {
    case "non-raggiunto":
      return `Non siamo riusciti a raggiungere www.${host}: nessuna risposta. Prova ad aprire ${esito.indirizzo} nel browser: se si apre, riprova fra qualche minuto; se non si apre, il sito in questo momento non risponde.`;
    case "frenato":
      return `Il sito ${host} ci ha chiesto di rallentare (troppe richieste). Non c'e' niente da correggere: riprova fra qualche minuto.`;
    case "elenco-non-trovato":
      return `Abbiamo raggiunto ${host}, ma all'indirizzo ${esito.indirizzo} non c'e' l'elenco dei veicoli (risposta ${esito.stato}). L'indirizzo che hai scritto e' giusto: e' il sito che non pubblica l'elenco nel formato che oggi sappiamo leggere (quello dei siti costruiti con DealerK). ${altrove}`;
    case "elenco-illeggibile":
      return `Abbiamo trovato una pagina a ${esito.indirizzo}, ma non e' un elenco di veicoli che sappiamo leggere. L'indirizzo che hai scritto e' giusto e il sito risponde: e' il formato che non riconosciamo. ${altrove}`;
  }
}

/**
 * L'elenco di cio' che il sito dichiara adesso, per chi non deve spiegare
 * niente a nessuno (la sincronizzazione periodica).
 *
 * Restituisce null quando la lettura non e' riuscita -- per qualunque dei
 * quattro motivi qui sopra -- e un elenco vuoto solo se il sito ha davvero
 * risposto con una sitemap senza veicoli. La distinzione non e' pedante: chi
 * allinea lo stock, davanti a null, non deve toccare niente.
 */
export async function elencoStock(host: string): Promise<DealerSiteEntry[] | null> {
  const esito = await elencoStockConEsito(host);
  return esito.ok ? esito.voci : null;
}
