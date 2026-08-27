import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * La galleria di un veicolo importato dal sito della concessionaria.
 *
 * Sta a se' perche' la usano in due: l'importazione che il concessionario
 * lancia a mano e la sincronizzazione che gira da sola. Prima stava dentro
 * l'endpoint dell'importazione, e la sincronizzazione avrebbe dovuto
 * riscriverla -- due copie della stessa regola delicata, che col tempo
 * divergono.
 */

// Lo stesso tetto usato dal resto dell'importazione veicoli.
export const MAX_FOTO_VEICOLO = 20;

// Senza i tipi generati dello schema il client inferisce "never" per i
// payload di inserimento.
type ApiSupabaseClient = SupabaseClient;

/**
 * Rimette la galleria com'e' adesso sulla sorgente, invece di aggiungerci
 * quello che manca.
 *
 * Per un veicolo importato la sorgente e' la verita': se una foto non c'e'
 * piu' li', non deve restare qui. La sincronizzazione da feed invece
 * aggiunge soltanto, e va bene per quel caso -- ma qui ha prodotto un difetto
 * vero: le prime venti vetture importate si sono portate dentro i loghi delle
 * marche e lo stesso scatto in quattro misure, e nessuna reimportazione
 * avrebbe potuto ripulirle.
 *
 * Se la galleria e' gia' quella giusta non si tocca niente: rifarla a ogni
 * sincronizzazione cambierebbe gli identificativi delle foto per nulla.
 */
export async function sostituisciFoto(supabase: ApiSupabaseClient, dealerId: string, vehicleId: string, urls: string[]) {
  const volute = urls.slice(0, MAX_FOTO_VEICOLO);
  if (volute.length === 0) return;

  const { data: presenti } = await supabase
    .from("vehicle_images")
    .select("id, image_url")
    .eq("vehicle_id", vehicleId)
    .order("position", { ascending: true });

  const attuali = (presenti ?? []).map((riga: Record<string, unknown>) => String(riga.image_url ?? "").trim());
  const gia = attuali.length === volute.length && attuali.every((url, i) => url === volute[i]);
  if (gia) return;

  await supabase.from("vehicle_images").delete().eq("vehicle_id", vehicleId).eq("dealer_id", dealerId);

  await supabase.from("vehicle_images").insert(
    volute.map((url, index) => ({
      dealer_id: dealerId,
      vehicle_id: vehicleId,
      image_url: url,
      position: index,
      is_cover: index === 0,
    })),
  );
}
