/**
 * Il consenso ai cookie di misurazione.
 *
 * L'informativa dichiarava -- e finora era vero -- che il sito non usa cookie
 * di profilazione o marketing. Nel momento in cui si installa uno strumento di
 * misura quella frase smette di essere vera, e in Italia il consenso va
 * raccolto *prima* che lo strumento parta, non dopo.
 *
 * Quindi qui non c'e' nessun "consenso implicito allo scorrimento": finche' la
 * scelta non e' stata fatta, non parte niente.
 */

/**
 * La scelta sta in localStorage e non in un cookie, per una ragione precisa:
 * scrivere un cookie per ricordare che l'utente ha rifiutato i cookie sarebbe
 * la prima cosa che un controllo troverebbe.
 */
export const CONSENT_STORAGE_KEY = "keyauto.consenso-misurazione.v1";

export type ConsentChoice = "accettato" | "rifiutato";

/** Avvisa le altre parti della pagina che la scelta e' cambiata, senza ricaricare. */
export const CONSENT_CHANGED_EVENT = "keyauto:consenso-cambiato";

/**
 * Come restare allineati alla scelta senza ricaricare la pagina.
 *
 * Ascolta anche "storage", che il browser manda alle *altre* schede aperte
 * sullo stesso sito: chi rifiuta in una scheda non deve continuare a essere
 * misurato in quella che aveva lasciato aperta prima.
 */
export function subscribeToConsent(onChange: () => void) {
  window.addEventListener(CONSENT_CHANGED_EVENT, onChange);
  window.addEventListener("storage", onChange);

  return () => {
    window.removeEventListener(CONSENT_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Il server non puo' sapere la scelta: risponde sempre "non ancora fatta". */
export function readServerConsent(): ConsentChoice | null {
  return null;
}

export function readStoredConsent(): ConsentChoice | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return stored === "accettato" || stored === "rifiutato" ? stored : null;
  } catch {
    // Navigazione in incognito con archiviazione bloccata: senza memoria la
    // scelta si richiede a ogni visita, che e' il comportamento prudente.
    return null;
  }
}

export function storeConsent(choice: ConsentChoice) {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, choice);
  } catch {
    // Se non si puo' scrivere, la scelta vale comunque per questa visita:
    // l'evento qui sotto parte lo stesso.
  }

  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: choice }));
}

/**
 * Cancella la scelta per poterla rifare. Serve al collegamento in fondo alla
 * pagina: un consenso che non si puo' ritirare non e' un consenso valido.
 */
export function clearStoredConsent() {
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    // Vedi sopra.
  }

  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: null }));
}

/**
 * L'identificativo dello strumento di misura, se e' stato configurato.
 *
 * Finche' resta vuoto non viene caricato niente e il banner non compare: il
 * codice puo' quindi essere pubblicato prima di aver deciso quale strumento
 * usare, senza cambiare in nulla il comportamento del sito.
 */
export function getMeasurementId() {
  return String(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "").trim();
}
