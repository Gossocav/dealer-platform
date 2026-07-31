// Le distanze selezionabili, separate da geo-search perche' quel modulo tira
// dentro il dataset dei comuni (oltre 350 KB). La barra di ricerca in home deve
// solo disegnare una tendina: senza questa separazione la home si porterebbe
// dietro le coordinate di tutti i comuni d'Italia per elencare dieci numeri.

export const DISTANCE_OPTIONS = [10, 25, 50, 75, 100, 150, 200, 300, 400, 500] as const;

// Quando si indica un luogo senza scegliere la distanza. 50 km e' il raggio
// entro cui in Italia si va davvero a vedere un'auto di persona.
export const DEFAULT_DISTANCE_KM = 50;

export function parseDistanceKm(value: string | null | undefined): number | null {
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) return null;
  return DISTANCE_OPTIONS.includes(parsed as (typeof DISTANCE_OPTIONS)[number]) ? parsed : null;
}
