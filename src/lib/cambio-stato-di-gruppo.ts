/**
 * Chi puo' essere pubblicato o rimesso in bozza tutto insieme, e chi no.
 *
 * Nasce da una richiesta precisa del titolare (04/09/2026): un bottone che
 * pubblica o mette in bozza l'intero parco auto con un clic. La pagina mostra
 * nove veicoli per volta, quindi con duecento automobili l'azione sui
 * selezionati vuole ventotto passaggi.
 *
 * **La macchina a stati non protegge nessuno, qui.** Verificato chiamandola:
 * da `sold`, `delivered`, `reserved`, `negotiating` e `archived` il passaggio
 * a "pubblicato" e a "bozza" risulta consentito. Ha senso per un comando dato
 * su una vettura sola, guardandola: e' il concessionario che decide. Non ha
 * nessun senso per un comando che ne tocca duecento senza guardarle, dove
 * quelle vetture non le ha scelte nessuno:
 *
 * - una **venduta** rimessa online tornerebbe in vendita su KeyAuto, e messa
 *   in bozza uscirebbe dai conti delle vendite e dal conto economico, che si
 *   fondano su `status = 'sold'`;
 * - una **prenotata** o **in trattativa** perderebbe l'impegno preso con il
 *   cliente, che nello stato e' l'unica cosa che lo registra;
 * - una **da controllare** (`in_review`) e' li' perche' e' sparita dal sito
 *   della concessionaria: ripubblicarla in massa disferebbe in silenzio il
 *   lavoro della sincronizzazione notturna.
 *
 * Quindi il comando di gruppo tocca **soltanto** le due sponde del passaggio
 * che dichiara: pubblica le bozze, rimette in bozza le pubblicate. Tutto il
 * resto resta dov'e', e viene detto quante sono e perche'.
 */

import { getVehicleStateLabel, resolveVehicleLifecycleState } from "@/lib/vehicle-state-machine";

/** Il verso del comando: quello che il concessionario ha chiesto. */
export type VersoDelCambio = "published" | "draft";

export type RigaPerCambioStato = {
  status?: string | null;
  published?: boolean | null;
};

export type PianoDiGruppo<T> = {
  /** Le vetture su cui si agisce davvero. */
  daCambiare: T[];
  /** Quante restano dove sono, e in che stato: "2 vendute, 1 prenotata". */
  lasciateStare: Array<{ stato: string; quante: number }>;
  /** Quante erano gia' nello stato richiesto: non e' un problema, e' un non-fare. */
  giaCosi: number;
};

/**
 * Divide il parco in "si tocca" e "non si tocca", senza toccare niente.
 *
 * Non decide se una scheda e' pubblicabile (foto, prezzo): quello lo dice
 * `evaluateVehicleHealth`, che serve una vettura per volta e va chiamato
 * dopo. Qui si guarda solo lo stato.
 */
export function pianoCambioStatoDiGruppo<T extends RigaPerCambioStato>(
  righe: readonly T[],
  verso: VersoDelCambio
): PianoDiGruppo<T> {
  const partenzaAmmessa = verso === "published" ? "draft" : "published";

  const daCambiare: T[] = [];
  const conteggi = new Map<string, number>();
  let giaCosi = 0;

  for (const riga of righe) {
    const stato = resolveVehicleLifecycleState(riga.status, riga.published ?? null);

    if (stato === verso) {
      giaCosi += 1;
      continue;
    }

    if (stato === partenzaAmmessa) {
      daCambiare.push(riga);
      continue;
    }

    const etichetta = getVehicleStateLabel(stato);
    conteggi.set(etichetta, (conteggi.get(etichetta) ?? 0) + 1);
  }

  return {
    daCambiare,
    lasciateStare: Array.from(conteggi, ([stato, quante]) => ({ stato, quante })).sort(
      (a, b) => b.quante - a.quante
    ),
    giaCosi,
  };
}

/** "3 vendute, 1 prenotata": la coda del riepilogo, o null se non c'e' niente da dire. */
export function riassumiLasciateStare(lasciateStare: PianoDiGruppo<unknown>["lasciateStare"]): string | null {
  if (lasciateStare.length === 0) return null;
  return lasciateStare.map(({ stato, quante }) => `${quante} ${stato.toLowerCase()}`).join(", ");
}
