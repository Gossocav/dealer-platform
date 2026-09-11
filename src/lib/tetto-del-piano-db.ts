import type { SupabaseClient } from "@supabase/supabase-js";
import { caricaTutto } from "@/lib/carica-tutto";
import { campiInVetrina, campiOltreIlTetto, pianoDelTetto, STATO_OLTRE_IL_TETTO, type RigaPerIlTetto } from "@/lib/tetto-del-piano";

/**
 * La regola del tetto applicata all'archivio di una concessionaria.
 *
 * E' l'unico punto che scrive per conto della regola: lo usano la
 * sincronizzazione notturna e l'importazione dal sito, con la chiave di
 * servizio. Il limite lo dice il database (`resolve_dealer_listing_cap`), che
 * e' lo stesso che poi lo impone con il trigger: qui non c'e' nessun numero.
 *
 * Prima si libera, poi si riempie: nell'ordine inverso il database
 * rifiuterebbe la salita per un posto non ancora liberato.
 */
export type EsitoTetto = {
  limite: number | null;
  /** Le candidate rimaste fuori dal tetto. */
  oltreIlTetto: number;
  /** Mosse in questa applicazione. */
  salite: number;
  messeDaParte: number;
  errori: string[];
};

/**
 * Il limite del piano, dal database.
 *
 * **Vuole la chiave di servizio**: `resolve_dealer_listing_cap` e' riservata a
 * quella dal 05/09/2026, perche' prende un `dealer_id` qualsiasi e con la
 * sessione di un utente direbbe il piano delle altre concessionarie. Chi ha
 * solo la sessione dell'utente si fa dare il limite da chi puo' leggerlo.
 */
export async function limiteDelPiano(supabase: SupabaseClient, dealerId: string): Promise<number | null> {
  const { data } = await supabase.rpc("resolve_dealer_listing_cap", { p_dealer_id: dealerId });
  return typeof data === "number" ? data : null;
}

export async function applicaTettoDelPiano(supabase: SupabaseClient, dealerId: string, limiteGiaLetto?: number | null): Promise<EsitoTetto> {
  const limite = limiteGiaLetto !== undefined ? limiteGiaLetto : await limiteDelPiano(supabase, dealerId);

  // Senza un limite leggibile non c'e' niente da applicare, e non vale la
  // pena leggere l'archivio intero per scoprirlo.
  if (limite === null) return { limite: null, oltreIlTetto: 0, salite: 0, messeDaParte: 0, errori: [] };

  const { righe, error } = await caricaTutto<RigaPerIlTetto>((da, a) =>
    supabase
      .from("vehicles")
      .select("id, vehicle_condition, status, published, created_at, import_source, import_missing_since")
      .eq("dealer_id", dealerId)
      .range(da, a),
  );
  if (error) return { limite, oltreIlTetto: 0, salite: 0, messeDaParte: 0, errori: [`tetto: ${error.message}`] };

  const piano = pianoDelTetto(righe, limite);
  const adesso = new Date();
  const errori: string[] = [];

  if (piano.daTogliere.length > 0) {
    const { error: e } = await supabase.from("vehicles").update(campiOltreIlTetto(adesso)).eq("dealer_id", dealerId).in("id", piano.daTogliere);
    if (e) errori.push(`tetto, messe da parte: ${e.message}`);
  }
  for (const id of piano.daPubblicare) {
    const { error: e } = await supabase.from("vehicles").update(campiInVetrina(adesso)).eq("id", id).eq("dealer_id", dealerId);
    if (e && errori.length < 5) errori.push(`tetto, salita ${id}: ${e.message}`);
  }

  return { limite, oltreIlTetto: piano.escluse.length, salite: piano.daPubblicare.length, messeDaParte: piano.daTogliere.length, errori };
}

/**
 * Quante auto risultano pubblicate, **con la stessa definizione del trigger**
 * che impone il tetto: `published` vero **e** `status` "published".
 *
 * Non e' pignoleria. In giro per il gestionale ci sono altri due conteggi che
 * chiamano "pubblicata" cose diverse -- il riquadro di Gestione Veicoli usa un
 * "oppure", il pannello il solo `published` -- e chi calcolasse i posti liberi
 * da quelli sbaglierebbe in tutti e due i versi: rifiutando una pubblicazione
 * che il database accetterebbe, o lasciandone passare una che rifiutera'.
 * Questa e' l'unica da riusare.
 */
export async function contaPubblicate(supabase: SupabaseClient, dealerId: string): Promise<number> {
  const { count } = await supabase
    .from("vehicles")
    .select("id", { count: "exact", head: true })
    .eq("dealer_id", dealerId)
    .eq("published", true)
    .eq("status", "published");
  return count ?? 0;
}

/** Quante auto del sito aspettano un posto in vetrina. */
export async function contaInAttesa(supabase: SupabaseClient, dealerId: string): Promise<number> {
  const { count } = await supabase
    .from("vehicles")
    .select("id", { count: "exact", head: true })
    .eq("dealer_id", dealerId)
    .eq("status", STATO_OLTRE_IL_TETTO)
    .not("import_source", "is", null)
    .is("import_missing_since", null);
  return count ?? 0;
}

/** Quante auto possono ancora entrare pubblicate adesso. `null` senza un limite leggibile. */
export async function postiLiberi(supabase: SupabaseClient, dealerId: string, limite: number | null): Promise<number | null> {
  if (limite === null) return null;
  return Math.max(0, limite - (await contaPubblicate(supabase, dealerId)));
}
