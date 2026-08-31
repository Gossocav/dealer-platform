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
