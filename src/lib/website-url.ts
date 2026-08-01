/**
 * Il "Sito web" della concessionaria e' testo libero scritto a mano, e finche'
 * e' rimasto invisibile al pubblico nessuno se n'e' accorto: nel database ci
 * puo' stare qualsiasi cosa. Il giorno in cui diventa un pulsante cliccabile
 * sul marketplace, quel testo diventa una destinazione -- quindi va ricondotto
 * a un indirizzo vero prima di salvarlo, non dopo.
 *
 * Cosa fa, in ordine:
 * - un campo vuoto resta vuoto: il sito non e' obbligatorio;
 * - "esempio.it" e "www.esempio.it" diventano "https://esempio.it": e' come
 *   la gente scrive un sito, e pretendere il prefisso sarebbe solo un ostacolo;
 * - "http://" resta "http://": non tutti i siti hanno il certificato, e
 *   promuoverli a https porterebbe l'utente su una pagina che non risponde;
 * - tutto il resto viene rifiutato con un messaggio leggibile.
 *
 * Il rifiuto piu' importante e' "javascript:": un indirizzo del genere non e'
 * un sito, e' codice che verrebbe eseguito nel browser di chi lo clicca. Oggi
 * il campo non e' cliccabile e non fa danni, ma il controllo va messo qui,
 * dove il dato entra, non nel punto in cui un domani verra' disegnato.
 */

const ALLOWED_PROTOCOLS = ["http:", "https:"];

export type WebsiteUrlResult = {
  /** L'indirizzo da salvare, oppure null se il campo e' vuoto. */
  url: string | null;
  /** Messaggio da mostrare al concessionario; null se va tutto bene. */
  error: string | null;
};

export function normalizeWebsiteUrl(value: string | null | undefined): WebsiteUrlResult {
  const text = String(value ?? "").trim();

  if (!text) {
    return { url: null, error: null };
  }

  // Uno spazio dentro l'indirizzo e' sempre un errore di battitura, ma il
  // costruttore URL lo accetterebbe codificandolo in %20: verrebbe salvato un
  // indirizzo plausibile che non porta da nessuna parte.
  if (/\s/.test(text)) {
    return { url: null, error: "L'indirizzo del sito non può contenere spazi." };
  }

  const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(text);

  if (hasProtocol && !/^https?:\/\//i.test(text)) {
    return { url: null, error: "Sono ammessi solo indirizzi che iniziano con http:// o https://." };
  }

  let parsed: URL;
  try {
    parsed = new URL(hasProtocol ? text : `https://${text}`);
  } catch {
    return { url: null, error: "Indirizzo del sito non valido. Esempio: https://www.tuaconcessionaria.it" };
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return { url: null, error: "Sono ammessi solo indirizzi che iniziano con http:// o https://." };
  }

  // Il punto separa il dominio dall'estensione: senza, non e' un sito ma una
  // parola. Serve a fermare "la mia concessionaria" scritto nel campo
  // sbagliato, che altrimenti diventerebbe "https://lamiaconcessionaria".
  if (!parsed.hostname.includes(".") || parsed.hostname.startsWith(".") || parsed.hostname.endsWith(".")) {
    return { url: null, error: "Indirizzo del sito non valido. Esempio: https://www.tuaconcessionaria.it" };
  }

  return { url: parsed.toString(), error: null };
}
