/**
 * Quale piano apre quale funzione. **Sorgente unica.**
 *
 * Fino al 01/09/2026 c'era una funzione riservata sola -- la scheda consegna
 * -- e la regola stava dentro il modulo che la disegnava. Con il conto
 * economico riservato al Pro le funzioni riservate diventano sette, sparse fra
 * pagine, voci di menu e riquadri: scritte una per una accanto a quello che
 * governano, prima o poi una di quelle regole diverge dalle altre, e la
 * schermata che se ne dimentica e' proprio quella che regala la funzione.
 *
 * Qui c'e' l'elenco, e nient'altro. Chi disegna chiede, questo modulo
 * risponde, e la risposta si prova senza database.
 *
 * **Il piano non si legge mai da `dealers.subscription_plan`** -- quella
 * colonna dice "base" anche a una concessionaria Elite. Si legge con
 * `usePianoInVigore`, che lo chiede al server.
 *
 * **Questa e' la prima delle due serrature.** Nasconde i comandi a chi non ha
 * il piano, il che basta perche' nessuno ci arrivi per sbaglio, ma non
 * impedisce a chi sa come si fa di leggere i propri dati con la chiave
 * pubblica del sito. La seconda serratura sta nel database, ed e' quella che
 * conta davvero.
 */

import { DEALER_PLAN_CODES, type DealerPlanCode } from "@/lib/dealer-plan";

/**
 * Le funzioni che non sono di tutti i piani.
 *
 * Il nome dice cosa fa il concessionario, non quale schermata la mostra: una
 * funzione compare in piu' posti -- il conto economico sta nella scheda del
 * veicolo, nelle statistiche, in due pagine e in due stampe -- e devono
 * aprirsi e chiudersi tutti insieme.
 */
export type FunzioneDiPiano =
  /** Scrivere e leggere il conto economico di una vettura, e tutto cio' che ne deriva. */
  | "conto-economico"
  /** L'archivio delle vendite, mese per mese e anno per anno. */
  | "vendite"
  /** I giorni di giacenza del parco auto. */
  | "giacenza"
  /** Il foglio da far firmare al cliente alla consegna. */
  | "scheda-consegna"
  /** La vetrina a rotazione sulla home di KeyAuto. */
  | "vetrina-home"
  /** Il video dell'automobile sull'annuncio. */
  | "video-annuncio"
  /** La perizia di una vettura che si sta comprando. */
  | "perizia";

/**
 * Da quale piano in su ogni funzione e' compresa.
 *
 * Si dichiara la **soglia** e non l'elenco dei piani perche' i piani sono
 * cumulativi: chi paga di piu' non perde mai niente, e un elenco permetterebbe
 * di scrivere per sbaglio una funzione che c'e' nel Pro e non nell'Elite.
 */
const SOGLIA: Record<FunzioneDiPiano, DealerPlanCode> = {
  "conto-economico": "pro",
  vendite: "pro",
  giacenza: "pro",
  "scheda-consegna": "elite",
  "vetrina-home": "elite",
  "video-annuncio": "elite",
  perizia: "pro",
};

/** I piani dal piu' piccolo al piu' grande. Serve a confrontarli. */
const SCALA: readonly DealerPlanCode[] = ["base", "pro", "elite"];

function normalizza(planCode: string | null | undefined): DealerPlanCode | null {
  const pulito = String(planCode ?? "").trim().toLowerCase();
  return (DEALER_PLAN_CODES as readonly string[]).includes(pulito) ? (pulito as DealerPlanCode) : null;
}

/**
 * Il piano in vigore comprende questa funzione?
 *
 * Un codice che non riconosciamo non apre la porta: meglio negare una funzione
 * a chi ne ha diritto -- se ne accorge e lo dice -- che regalarla a chi non
 * l'ha pagata, che non lo dira' mai.
 */
export function pianoComprende(planCode: string | null | undefined, funzione: FunzioneDiPiano): boolean {
  const piano = normalizza(planCode);
  if (!piano) return false;

  return SCALA.indexOf(piano) >= SCALA.indexOf(SOGLIA[funzione]);
}

/** Il piano piu' economico che comprende la funzione: serve a dirlo a schermo. */
export function pianoMinimoPer(funzione: FunzioneDiPiano): DealerPlanCode {
  return SOGLIA[funzione];
}

/** "Piano Pro", "Piano Elite": come si nomina a chi legge. */
export function nomeDelPiano(piano: DealerPlanCode): string {
  return `Piano ${piano.charAt(0).toUpperCase()}${piano.slice(1)}`;
}

/**
 * La frase da mostrare a chi arriva su una funzione che il suo piano non
 * comprende.
 *
 * Dice **quale piano serve** e cosa ci si fa, invece di limitarsi a negare:
 * chi legge deve capire cosa gli manca, non solo che gli manca qualcosa.
 */
export function spiegazioneFunzioneChiusa(funzione: FunzioneDiPiano): string {
  const minimo = nomeDelPiano(pianoMinimoPer(funzione));

  const cosaFa: Record<FunzioneDiPiano, string> = {
    "conto-economico":
      "Il conto economico dice quanto ti e' costata ogni vettura, voce per voce, e quanto ci hai guadagnato quando la vendi.",
    vendite: "L'archivio delle vendite mostra quanto hai venduto e quanto hai guadagnato, mese per mese e anno per anno.",
    giacenza: "La giacenza dice da quanti giorni e' ferma ogni automobile, e quanto capitale hai fermo in piazzale.",
    "scheda-consegna":
      "La scheda consegna e' il documento da stampare e far firmare al cliente quando gli consegni l'automobile.",
    "vetrina-home": "La vetrina mette una tua vettura in cima alla pagina principale di KeyAuto, a rotazione.",
    "video-annuncio":
      "Il video dell'automobile sull'annuncio: chi guarda la scheda lo apre senza uscire dalla pagina, e vede la vettura muoversi invece che in fotografia.",
    perizia:
      "La perizia e' la scheda con cui controlli una vettura prima di comprarla: carrozzeria pannello per pannello, gomme, meccanica e interni, con il conto di quanto costa rimetterla a posto. Resta salvata, e si ristampa il giorno che il venditore contesta.",
  };

  return `${cosaFa[funzione]} E' compresa a partire dal ${minimo}.`;
}
