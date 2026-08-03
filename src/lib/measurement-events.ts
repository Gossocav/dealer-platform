/**
 * I momenti che contano davvero, raccontati allo strumento di misura.
 *
 * Senza questi, Analytics sa quante persone arrivano e quali pagine guardano,
 * ma non sa distinguere chi scrive alla concessionaria da chi se ne va: per
 * lui sono la stessa visita. E' esattamente la differenza fra sapere quanto
 * traffico hai comprato e sapere quale annuncio ti ha portato un cliente.
 */

type GtagFunction = (command: string, eventName: string, params?: Record<string, unknown>) => void;

/** Cosa ha chiesto la persona. Un solo evento con un tipo, invece di quattro eventi diversi. */
export type LeadType = "veicolo" | "demo_concessionaria" | "info_concessionaria";

export type MeasurementEventParams = Record<string, string | number | undefined>;

/**
 * Le chiavi che non devono mai finire in un evento.
 *
 * Mandare nome, email o telefono a uno strumento di misura e' vietato dalle
 * condizioni di Google, oltre che sbagliato: quei dati appartengono alla
 * richiesta che arriva alla concessionaria, non alle statistiche. Il filtro
 * sta qui e non nella buona memoria di chi aggiunge il prossimo evento.
 */
const FORBIDDEN_KEYS = [
  "nome",
  "cognome",
  "name",
  "first_name",
  "last_name",
  "email",
  "mail",
  "telefono",
  "phone",
  "messaggio",
  "message",
  "indirizzo",
  "address",
];

function isForbidden(key: string) {
  const normalized = key.toLowerCase();
  return FORBIDDEN_KEYS.some((forbidden) => normalized === forbidden || normalized.includes(forbidden));
}

export function stripPersonalData(params: MeasurementEventParams): MeasurementEventParams {
  const clean: MeasurementEventParams = {};

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") {
      continue;
    }

    if (isForbidden(key)) {
      continue;
    }

    clean[key] = value;
  }

  return clean;
}

/**
 * Manda un evento, se c'e' qualcuno che ascolta.
 *
 * Senza consenso lo strumento non e' stato caricato e `gtag` non esiste:
 * questa funzione non fa niente e non protesta. E' voluto -- il modulo deve
 * funzionare identico per chi ha rifiutato, e un errore qui bloccherebbe
 * l'invio di una richiesta vera per un problema di statistiche.
 */
export function trackEvent(eventName: string, params: MeasurementEventParams = {}) {
  if (typeof window === "undefined") {
    return;
  }

  const gtag = (window as unknown as { gtag?: GtagFunction }).gtag;
  if (typeof gtag !== "function") {
    return;
  }

  try {
    gtag("event", eventName, stripPersonalData(params));
  } catch {
    // Una statistica non deve mai rompere la pagina.
  }
}

/**
 * La richiesta andata a buon fine, in tutte e tre le sue forme.
 *
 * "generate_lead" e' il nome che Google Ads riconosce da solo come
 * conversione: usarne uno inventato costringerebbe a configurarlo a mano.
 */
export function trackLead(type: LeadType, params: MeasurementEventParams = {}) {
  trackEvent("generate_lead", { tipo: type, ...params });
}

/** Il tocco su WhatsApp: non e' un modulo inviato, ma e' un contatto. */
export function trackWhatsAppContact(params: MeasurementEventParams = {}) {
  trackEvent("contatto_whatsapp", params);
}
