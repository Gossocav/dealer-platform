/**
 * Dove finisce chi ha appena fatto l'accesso, a seconda dello stato del suo
 * account.
 *
 * L'elenco vive qui perche' serve a due parti che devono dire la stessa cosa:
 * il server che decide la destinazione e il client che la riceve e ci porta
 * l'utente.
 *
 * Quando erano due elenchi separati sono divergiti, e il modo in cui si e'
 * visto e' istruttivo: il server rispondeva "/account/demo-scaduta", il
 * client non riconosceva quella destinazione, la scartava come risposta non
 * valida e mostrava "Impossibile verificare lo stato account". Chi aveva la
 * demo scaduta non riusciva piu' a entrare, e l'errore non diceva niente di
 * cio' che era successo davvero.
 */
export const ACCOUNT_ROUTES = [
  "/admin",
  "/account/sospeso",
  "/account/in-attesa",
  "/account/demo-scaduta",
  "/dashboard",
] as const;

export type AccountRoute = (typeof ACCOUNT_ROUTES)[number];

export function isAccountRoute(value: unknown): value is AccountRoute {
  return typeof value === "string" && (ACCOUNT_ROUTES as readonly string[]).includes(value);
}
