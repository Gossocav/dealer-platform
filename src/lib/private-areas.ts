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
  "/promemoria",
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

/**
 * Le eccezioni dentro `/api`: quello che deve restare visibile ai motori.
 *
 * Il proxy delle fotografie sta sotto `/api` per come e' fatto il progetto, non
 * perche' sia roba da gestionale: e' il percorso da cui passa **ogni singola
 * fotografia del sito pubblico**. Finendo dentro il divieto generale, le foto
 * erano chiuse ai motori due volte -- il `Disallow: /api/` nel robots.txt e
 * l'intestazione `X-Robots-Tag: noindex` che il proxy manda su ogni risposta.
 *
 * Non era solo l'assenza da Google Immagini. Su una scheda auto sono nove
 * risorse su ventisette: quando Google apriva l'annuncio per giudicarlo, un
 * terzo non gli arrivava, ed erano tutte le fotografie. Giudicava un annuncio
 * d'automobile senza vederne una.
 */
export const PUBLIC_API_PREFIXES = ["/api/image-proxy"] as const;

export function isPrivateAreaPath(pathname: string) {
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return false;
  }

  return PRIVATE_AREA_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
