import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lo storico di chi entra nel pannello amministrativo.
 *
 * **Il difetto che colma.** Trovato il 06/09/2026 in una verifica di
 * sicurezza: `audit_logs` registrava le operazioni sulle demo e sui veicoli,
 * ma **niente** sul pannello amministrativo. Se qualcuno provasse a
 * raggiungerlo, riuscendoci o no, non ne resterebbe traccia da nessuna parte:
 * lo si scoprirebbe per caso, o mai.
 *
 * Si puo' fare in un punto solo perche' dal 06/09/2026 tutti gli endpoint
 * `/api/admin/*` passano dalla stessa serratura (`contestoAmministratore`).
 * Prima erano sette copie, e sarebbero servite sette scritture da tenere
 * allineate -- cioe' la stessa trappola di prima.
 */

export type AzioneAmministrativa =
  /** Qualcuno con una sessione valida, che amministratore non e', ha bussato. */
  | "admin.accesso_negato"
  /** Un amministratore ha cambiato qualcosa. */
  | "admin.azione";

type Dati = {
  azione: AzioneAmministrativa;
  chiamanteId: string | null;
  percorso: string;
  metodo: string;
  motivo?: string;
};

/**
 * Scrive una riga nello storico. **Non fa mai fallire la richiesta.**
 *
 * E' un effetto collaterale, e in questo progetto un effetto collaterale
 * fallito non fa fallire una scrittura riuscita. Vale a maggior ragione qui:
 * un errore nello storico non deve poter chiudere il pannello a un
 * amministratore, ne' -- peggio -- trasformare un rifiuto in un errore
 * diverso, che direbbe a chi bussa qualcosa sul funzionamento interno.
 */
export async function registraAccessoAmministrativo(supabase: SupabaseClient, dati: Dati) {
  const riga = {
    dealer_id: null,
    actor_type: "user",
    action: dati.azione,
    entity_type: "admin_endpoint",
    entity_id: null,
    metadata_json: {
      percorso: dati.percorso,
      metodo: dati.metodo,
      ...(dati.motivo ? { motivo: dati.motivo } : {}),
      // Ripetuto qui perche' resti leggibile anche quando la colonna
      // collegata al profilo non si puo' valorizzare: vedi sotto.
      chiamante: dati.chiamanteId,
    },
  };

  try {
    const primo = await supabase.from("audit_logs").insert({
      ...riga,
      actor_profile_id: dati.chiamanteId,
      created_by: dati.chiamanteId,
    });

    if (!primo.error) return true;

    // `actor_profile_id` punta a `profiles`. Un account senza profilo -- che
    // in questo progetto capita, perche' cancellare un account lascia il
    // profilo e non viceversa -- farebbe fallire l'inserimento proprio nel
    // caso piu' sospetto: qualcuno che non dovrebbe essere li'. Meglio una
    // riga senza il collegamento che nessuna riga.
    const secondo = await supabase.from("audit_logs").insert({
      ...riga,
      actor_profile_id: null,
      created_by: null,
    });

    return !secondo.error;
  } catch {
    return false;
  }
}

/** I metodi che cambiano qualcosa: le sole letture non si registrano. */
export function cambiaQualcosa(metodo: string) {
  // Registrare anche le letture riempirebbe lo storico di rumore -- il
  // pannello ne fa parecchie a ogni schermata aperta -- e il rumore e' il
  // modo in cui uno storico smette di essere letto.
  return ["POST", "PUT", "PATCH", "DELETE"].includes(metodo.toUpperCase());
}
