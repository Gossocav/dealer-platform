import type { SupabaseClient } from "@supabase/supabase-js";
import { SOGLIE_COPIA_FOTO } from "@/lib/copia-foto-soglie";
import { chiaveDellaFoto, eFotoEsterna } from "@/lib/identita-foto";

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
export const MAX_FOTO_VEICOLO = SOGLIE_COPIA_FOTO.fotoPerVeicolo;

// Senza i tipi generati dello schema il client inferisce "never" per i
// payload di inserimento.
type ApiSupabaseClient = SupabaseClient;

type RigaFoto = {
  id: string;
  image_url: string;
  origine_url: string | null;
  position: number | null;
  is_cover: boolean | null;
  copia_esito: string | null;
};

/**
 * Quante foto copiate la sincronizzazione puo' ancora togliere a una
 * concessionaria in questa chiamata. Chi chiama ne crea uno per
 * concessionaria e per chiamata, e lo passa a ogni galleria: il conto scende.
 */
export type TettoCopieTolte = { restanti: number };

export function nuovoTettoCopieTolte(): TettoCopieTolte {
  return { restanti: SOGLIE_COPIA_FOTO.copieTolteMassimePerGiro };
}

export type EsitoGalleria =
  | { esito: "invariata" }
  | { esito: "aggiornata"; tolte: number; tolteCopiate: number; inserite: number; fileTolti: number; errore?: string }
  /**
   * La chiamata avrebbe tolto a questa concessionaria piu' foto copiate di
   * quante il tetto ne lascia: la galleria resta com'e', e chi chiama lo dice.
   */
  | { esito: "fermata-dal-tetto"; tolteCopiate: number; restanti: number }
  | { esito: "non-letta"; errore: string };

/**
 * Rimette la galleria com'e' adesso sulla sorgente, foto per foto.
 *
 * Per un veicolo importato la sorgente e' la verita': se una foto non c'e'
 * piu' li', non deve restare qui. La sincronizzazione da feed invece
 * aggiunge soltanto, e va bene per quel caso -- ma qui ha prodotto un difetto
 * vero: le prime venti vetture importate si sono portate dentro i loghi delle
 * marche e lo stesso scatto in quattro misure, e nessuna reimportazione
 * avrebbe potuto ripulirle.
 *
 * **Foto per foto, sull'identita', non sull'indirizzo** (25/09/2026). Fino a
 * quel giorno bastava che cambiasse una foto -- o che si spostasse la
 * copertina -- perche' la galleria venisse cancellata e riscritta per intero.
 * Con le foto copiate nel nostro archivio avrebbe voluto dire buttare le copie
 * a ogni ritocco del concessionario, e rimettere DealerK al loro posto. Ora:
 *
 * - una foto ancora sul sito **resta**, con la sua copia: si aggiornano solo
 *   posizione e copertina, e l'origine se e' cambiata solo nella misura o nel
 *   dominio (`chiaveDellaFoto`);
 * - una foto sparita dal sito si toglie; il suo file nel nostro archivio si
 *   cancella **solo se nessun'altra riga lo usa**;
 * - una foto nuova entra con la sua origine, e la copia la fa il programma;
 * - al massimo `copieTolteMassimePerGiro` foto copiate tolte per concessionaria
 *   e per chiamata (`tetto`): oltre, la galleria resta com'e' e chi chiama lo
 *   dice. E' la rete per un cambio dei nomi dei file da parte di DealerK.
 *
 * Se la galleria e' gia' quella giusta non si tocca niente: rifarla a ogni
 * sincronizzazione cambierebbe gli identificativi delle foto per nulla.
 */
export async function sostituisciFoto(
  supabase: ApiSupabaseClient,
  dealerId: string,
  vehicleId: string,
  urls: string[],
  tetto?: TettoCopieTolte,
): Promise<EsitoGalleria> {
  // Una voce per foto: due indirizzi della stessa foto in due misure sono una.
  const volute: Array<{ url: string; chiave: string }> = [];
  for (const url of urls) {
    const pulito = String(url ?? "").trim();
    if (!pulito) continue;
    const chiave = chiaveDellaFoto(pulito);
    if (volute.some((v) => v.chiave === chiave)) continue;
    volute.push({ url: pulito, chiave });
    if (volute.length >= MAX_FOTO_VEICOLO) break;
  }
  if (volute.length === 0) return { esito: "invariata" };

  const { data: presentiGrezze, error: letturaError } = await supabase
    .from("vehicle_images")
    .select("id, image_url, origine_url, position, is_cover, copia_esito")
    .eq("vehicle_id", vehicleId)
    .eq("dealer_id", dealerId)
    .order("position", { ascending: true });

  // Senza sapere cosa c'e', non si decide cosa togliere: una galleria non letta
  // non e' una galleria vuota.
  if (letturaError) return { esito: "non-letta", errore: letturaError.message };

  const presenti = (presentiGrezze ?? []) as RigaFoto[];
  const perChiave = new Map<string, RigaFoto>();
  for (const riga of presenti) {
    const chiave = chiaveDellaFoto(riga.origine_url ?? riga.image_url);
    // Due righe con la stessa foto: la seconda e' un doppione, e si toglie.
    if (!perChiave.has(chiave)) perChiave.set(chiave, riga);
  }

  const tenute = new Set<string>();
  const aggiornamenti: Array<{ riga: RigaFoto; valori: Record<string, unknown> }> = [];
  const nuove: Array<Record<string, unknown>> = [];

  volute.forEach(({ url, chiave }, posizione) => {
    const riga = perChiave.get(chiave);
    const copertina = posizione === 0;
    if (!riga) {
      nuove.push({
        vehicle_id: vehicleId,
        dealer_id: dealerId,
        image_url: url,
        ...(eFotoEsterna(url) ? { origine_url: url } : {}),
        position: posizione,
        is_cover: copertina,
      });
      return;
    }
    tenute.add(riga.id);

    const valori: Record<string, unknown> = {};
    if (riga.position !== posizione) valori.position = posizione;
    if (Boolean(riga.is_cover) !== copertina) valori.is_cover = copertina;
    if (eFotoEsterna(url) && riga.origine_url !== url) valori.origine_url = url;
    // Una foto non ancora copiata si mostra dall'origine: se l'origine e'
    // cambiata (misura, dominio), cambia anche l'indirizzo mostrato. Una
    // copiata no: resta servita dal nostro archivio.
    if (riga.copia_esito !== "copiata" && riga.image_url !== url) valori.image_url = url;
    if (Object.keys(valori).length > 0) aggiornamenti.push({ riga, valori });
  });

  const daTogliere = presenti.filter((riga) => !tenute.has(riga.id));
  if (daTogliere.length === 0 && nuove.length === 0 && aggiornamenti.length === 0) {
    return { esito: "invariata" };
  }

  const tolteCopiate = daTogliere.filter((riga) => riga.copia_esito === "copiata").length;
  if (tetto && tolteCopiate > tetto.restanti) {
    return { esito: "fermata-dal-tetto", tolteCopiate, restanti: tetto.restanti };
  }

  const errori: string[] = [];

  // I file nel nostro archivio delle foto tolte, prima di togliere le righe:
  // la regola dell'archivio lascia cancellare un file a chi ha una riga che lo
  // nomina, e dopo la riga non c'e' piu'. Si cancella solo un file che nessun
  // altra riga -- di questa o di un'altra auto -- usa ancora.
  let fileTolti = 0;
  const percorsi = Array.from(new Set(daTogliere.map((riga) => riga.image_url).filter((u) => u && !/^https?:\/\//i.test(u))));
  if (percorsi.length > 0) {
    const idTolte = new Set(daTogliere.map((riga) => riga.id));
    const { data: usi, error: usiError } = await supabase.from("vehicle_images").select("id, image_url").in("image_url", percorsi);
    if (usiError) {
      // Non si sa se qualcun altro li usa: non si cancella niente. Un file in
      // piu' nell'archivio costa spazio; un file tolto a un'altra auto la rompe.
      errori.push(`file non controllati: ${usiError.message}`);
    } else {
      const ancoraUsati = new Set((usi ?? []).filter((u: { id: string }) => !idTolte.has(u.id)).map((u: { image_url: string }) => u.image_url));
      const liberi = percorsi.filter((p) => !ancoraUsati.has(p));
      if (liberi.length > 0) {
        const { error: rimozioneError } = await supabase.storage.from("vehicle-images").remove(liberi);
        if (rimozioneError) errori.push(`file non tolti: ${rimozioneError.message}`);
        else fileTolti = liberi.length;
      }
    }
  }

  if (daTogliere.length > 0) {
    const { error } = await supabase
      .from("vehicle_images")
      .delete()
      .eq("dealer_id", dealerId)
      .in(
        "id",
        daTogliere.map((riga) => riga.id),
      );
    if (error) errori.push(`foto non tolte: ${error.message}`);
  }

  for (const { riga, valori } of aggiornamenti) {
    const { error } = await supabase.from("vehicle_images").update(valori).eq("id", riga.id).eq("dealer_id", dealerId);
    if (error) errori.push(`foto non aggiornata: ${error.message}`);
  }

  if (nuove.length > 0) {
    const { error } = await supabase.from("vehicle_images").insert(nuove);
    if (error) errori.push(`foto non inserite: ${error.message}`);
  }

  if (tetto) tetto.restanti -= tolteCopiate;

  return {
    esito: "aggiornata",
    tolte: daTogliere.length,
    tolteCopiate,
    inserite: nuove.length,
    fileTolti,
    ...(errori.length > 0 ? { errore: errori.join("; ") } : {}),
  };
}
