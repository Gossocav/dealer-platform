/**
 * Il filtro di testo della ricerca veicoli, in un posto solo.
 *
 * La stessa riga esisteva in due copie -- la vetrina pubblica e il gestionale
 * -- e le due copie **non erano uguali**. La pubblica ripuliva l'input, il
 * gestionale no, e nel gestionale bastava una virgola per rompere la ricerca.
 *
 * Misurato sulla produzione il 06/09/2026, interrogando come farebbe la
 * pagina:
 *
 *     "audi"       -> ok, 3 risultati
 *     "audi,bmw"   -> HTTP 400, la ricerca non risponde
 *
 * Non e' una falla: PostgREST rifiuta la riga, quindi nessuno puo' infilarci
 * condizioni sue. E' un difetto -- chi scrive una virgola nella casella di
 * ricerca del gestionale non ottiene niente, senza capire perche'.
 */

/** I caratteri che vanno tolti, e perche'. Misurati, non supposti. */
const DA_NEUTRALIZZARE = /[,%]/g;

/**
 * Costruisce la condizione `or` per marca, modello e allestimento.
 * Restituisce `null` quando non resta niente da cercare.
 *
 * - la **virgola** separa le condizioni dentro `or=(...)`: lasciarla passare
 *   spezza la riga e il database risponde 400.
 * - il **percento** e' il jolly di `ilike`: non rompe niente, ma cambia in
 *   silenzio cosa si sta cercando, e chi cerca non se ne accorge.
 *
 * Le parentesi, il punto, l'apice e la barra rovescia sono stati provati uno
 * per uno sulla produzione e passano come testo normale: toglierli
 * restringerebbe la ricerca senza motivo.
 */
export function filtroRicercaVeicolo(testo: string | null | undefined): string | null {
  const ripulito = String(testo ?? "")
    .replace(DA_NEUTRALIZZARE, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!ripulito) {
    return null;
  }

  return `brand.ilike.%${ripulito}%,model.ilike.%${ripulito}%,version.ilike.%${ripulito}%`;
}
