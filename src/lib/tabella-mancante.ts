/**
 * Riconosce l'errore che il database restituisce quando una tabella non c'e'
 * ancora.
 *
 * In questo progetto le modifiche al database le applica a mano il titolare,
 * quindi esiste sempre una finestra fra il momento in cui il codice va in
 * linea e quello in cui la tabella nasce. Dentro quella finestra la schermata
 * deve dire **cosa** manca, non "operazione non riuscita": e' successo il
 * 31/08/2026 col conto economico, e per un momento e' sembrato un guasto.
 *
 * PostgREST lo segnala in due modi diversi a seconda di dove si rompe --
 * "relation ... does not exist" oppure "Could not find the table ... in the
 * schema cache" -- e li riconosciamo entrambi.
 */
export function tabellaNonAncoraCreata(messaggio: string | undefined | null, nomeTabella: string) {
  const testo = String(messaggio ?? "").toLowerCase();
  return (
    testo.includes(nomeTabella.toLowerCase()) &&
    (testo.includes("relation") || testo.includes("does not exist") || testo.includes("schema cache"))
  );
}

/**
 * Riconosce **quale colonna** manca, per poterla togliere e riprovare.
 *
 * Stesso motivo di sopra, un gradino piu' in basso: lo schema di produzione
 * e' andato alla deriva piu' di una volta, e una colonna accessoria che non
 * esiste non deve far fallire una scrittura che per il resto e' valida.
 *
 * I due messaggi non si somigliano affatto, e questa e' la trappola: quando
 * PostgREST si accorge da solo che la colonna non e' nella sua cache risponde
 * `PGRST204` con "Could not find the 'x' column"; quando invece lascia
 * decidere a Postgres arriva "column \"x\" of relation \"y\" does not exist".
 * Riconoscerne uno solo vuol dire non riconoscere mai niente sul database
 * vero: e' il difetto trovato il 02/09/2026 nell'attivazione diretta, dove il
 * ripiego c'era ma non e' mai entrato in funzione.
 */
export function nomeDellaColonnaMancante(messaggio: string | undefined | null) {
  const testo = String(messaggio ?? "");

  const daPostgres = /column "([^"]+)" of relation "[^"]+" does not exist/i.exec(testo);
  if (daPostgres) return daPostgres[1];

  const daPostgrest = /could not find the '([^']+)' column/i.exec(testo);
  if (daPostgrest) return daPostgrest[1];

  return null;
}
