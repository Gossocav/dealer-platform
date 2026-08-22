/**
 * Qual e' il piano in vigore per una concessionaria.
 *
 * La domanda ha una risposta sola, ma nel database sta scritta in due posti,
 * e uno dei due mente. `dealers.subscription_plan` e' una colonna vecchia che
 * la conversione da demo ad abbonato **non tocca mai**: resta al valore della
 * registrazione, quindi dice "base" anche a chi ha attivato Elite.
 *
 * Il piano vero sta sulla riga dell'abbonamento. Il database lo sa gia' -- la
 * funzione che decide quanti annunci si possono pubblicare legge quella e
 * ignora la colonna vecchia (supabase/migrations/20260727020000_enforce_listing_limits.sql).
 * Il pannello amministrativo invece leggeva la colonna vecchia, e mostrava
 * "Base" a una concessionaria Elite: un dato falso, non mancante.
 *
 * Questa funzione tiene lo stesso ordine di precedenza del database, in un
 * posto solo, cosi' le due risposte non possono divergere.
 */
export const DEALER_PLAN_CODES = ["base", "pro", "elite"] as const;

export type DealerPlanCode = (typeof DEALER_PLAN_CODES)[number];

const ETICHETTE: Record<DealerPlanCode, string> = {
  base: "Base",
  pro: "Pro",
  elite: "Elite",
};

function normalizza(value: unknown): DealerPlanCode | null {
  const testo = String(value ?? "").trim().toLowerCase();
  return (DEALER_PLAN_CODES as readonly string[]).includes(testo) ? (testo as DealerPlanCode) : null;
}

export type PlanSources = {
  /** Il piano scelto al momento della conversione: e' quello che vale. */
  convertedPlanCode?: string | null;
  /** Il profilo con cui gira la demo, finche' non e' convertita. */
  demoProfileCode?: string | null;
  /** `dealers.subscription_plan`, la colonna vecchia: ultima spiaggia. */
  legacyPlanCode?: string | null;
};

export function resolveActivePlanCode(sources: PlanSources): DealerPlanCode | null {
  return (
    normalizza(sources.convertedPlanCode) ??
    normalizza(sources.demoProfileCode) ??
    normalizza(sources.legacyPlanCode)
  );
}

/**
 * L'etichetta da mostrare. Un piano che non riconosciamo non diventa un
 * trattino silenzioso: si vede il codice cosi' com'e', perche' "non lo so"
 * detto per intero e' meglio di un dato che sembra assente.
 */
export function formatPlanLabel(value: string | null | undefined) {
  const codice = normalizza(value);
  if (codice) return ETICHETTE[codice];

  const grezzo = String(value ?? "").trim();
  return grezzo.length > 0 ? grezzo : "-";
}
