import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Quali concessionarie hanno il Piano Elite, per le pagine pubbliche.
 *
 * Il marketplace legge senza sessione, e la tabella degli abbonamenti e'
 * riservata al servizio: il piano non si puo' leggere da li'. Il database
 * espone apposta il solo fatto che serve -- quali concessionarie sono Elite --
 * con `elite_showcase_dealer_ids` (20260727030000), che restituisce
 * identificativi e nient'altro: nessuno storico, nessuna data, nessun piano
 * degli altri.
 *
 * La funzione considera Elite solo chi ha **convertito** la prova in
 * abbonamento: una demo che gira sul profilo Elite non lo e' ancora. E' la
 * regola gia' in vigore per la vetrina in home, e vale anche per il video
 * dell'annuncio -- sono servizi del piano pagato.
 *
 * **Perche' esiste questo file invece di due copie.** La lettura era scritta
 * dentro la home; con il video sull'annuncio serviva la stessa cosa in un
 * secondo posto, e due copie della stessa interrogazione divergono. In piu' la
 * forma della risposta e' scomoda -- PostgREST restituisce stringhe oppure
 * oggetti con il nome della funzione come chiave, a seconda della versione --
 * e quel dettaglio va gestito in un posto solo.
 */
export async function caricaConcessionarieElite(
  client: SupabaseClient,
  suErrore?: (contesto: string, errore: unknown) => void
): Promise<Set<string>> {
  const { data, error } = await client.rpc("elite_showcase_dealer_ids");

  if (error) {
    // Un errore qui non deve far cadere la pagina: si torna un insieme vuoto,
    // cioe' "nessuna Elite", e la pagina mostra semplicemente meno cose.
    suErrore?.("elite-dealers", error);
    return new Set();
  }

  const identificativi = (data ?? [])
    .map((riga: unknown) =>
      typeof riga === "string" ? riga : (riga as { elite_showcase_dealer_ids?: string })?.elite_showcase_dealer_ids
    )
    .filter((valore: unknown): valore is string => typeof valore === "string" && valore.length > 0);

  return new Set(identificativi);
}
