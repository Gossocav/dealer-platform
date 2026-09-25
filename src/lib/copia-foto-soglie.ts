/**
 * I numeri della copia delle foto, in un posto solo.
 *
 * Non stanno nel database, apposta: un vincolo che ripete un valore di
 * prodotto rifiuta la scrittura il giorno che il valore cambia (AGENTS.md, la
 * durata della prova). Sono una proposta costruita su una misura sola, e
 * hanno un appuntamento per essere riletti contro il tasso vero: la tabella
 * sta in `supabase/MIGRAZIONI.md`, "L'appuntamento: i numeri si rileggono
 * contro il tasso vero". Chi cambia un numero qui lo cambia anche li'.
 */
export const SOGLIE_COPIA_FOTO = {
  /** Foto al massimo in una galleria: lo stesso tetto del resto dell'importazione. */
  fotoPerVeicolo: 20,

  /**
   * Foto copiate che la sincronizzazione puo' togliere a una concessionaria in
   * una chiamata (una chiamata rilegge al massimo un lotto di schede di quella
   * concessionaria; il lavoro periodico ne fa piu' d'una a giro). Oltre, la
   * galleria di quell'auto resta com'e' e il riepilogo lo dice.
   * E' la rete per un cambio di nomi dei file da parte di DealerK: tutte le
   * copie cambierebbero identita' insieme, e senza tetto verrebbero buttate in
   * un giro solo. Una galleria vera ne ha al massimo 20, quindi una
   * concessionaria che rinnova le foto di due auto nella stessa chiamata vede
   * la seconda rimandata alla chiamata dopo: rimandata, non persa.
   */
  copieTolteMassimePerGiro: 20,
} as const;
