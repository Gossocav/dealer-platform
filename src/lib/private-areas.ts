/**
 * Le sezioni che non appartengono al pubblico: il gestionale del
 * concessionario, l'area amministrativa e le pagine di accesso.
 *
 * Rispondono tutte 200 a chiunque, anche senza login -- i dati sono al sicuro
 * perche' il controllo avviene nel browser e senza sessione si vede solo
 * "Verifica autenticazione...", ma proprio per questo Google, se le trova, si
 * indicizzerebbe decine di pagine vuote e identiche fra loro.
 *
 * L'elenco vive qui perche' serve in due posti che devono dire la stessa cosa:
 * il divieto per i crawler in `robots.txt` e l'intestazione `X-Robots-Tag`
 * inviata dal proxy. Il robots.txt e' una richiesta che un crawler educato
 * rispetta; l'intestazione e' quella che conta davvero, perche' vale anche per
 * un indirizzo raggiunto da un link esterno.
 */
export const PRIVATE_AREA_PREFIXES = [
  "/dashboard",
  "/veicoli",
  "/clienti",
  "/lead",
  "/statistiche",
  "/vendite",
  "/giacenza",
  "/perizie",
  "/documenti",
  "/impostazioni",
  "/agenda",
  "/appuntamenti",
  "/email",
  "/abbonamento",
  "/account",
  "/admin",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/api",
] as const;

export function isPrivateAreaPath(pathname: string) {
  return PRIVATE_AREA_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
