/**
 * Il conto economico di un veicolo: le due somme, e come si leggono e
 * scrivono gli importi.
 *
 * Le stesse due formule vivono anche nel database, come colonne calcolate
 * (20260831010000_conto_economico_veicolo.sql). Quelle sono l'autorita': qui
 * servono a mostrare il totale mentre il concessionario digita, senza dover
 * salvare per vedere quanto sta guadagnando. Un test lega le due scritture,
 * perche' due formule che dicono cose diverse sono peggio di una sola.
 */

export type VociConto = {
  purchase_price?: number | null;
  cost_transport?: number | null;
  cost_preparation?: number | null;
  cost_parts?: number | null;
  cost_commission?: number | null;
  cost_other?: number | null;
  sale_price?: number | null;
};

/** Le voci che compongono il costo, nell'ordine in cui si compilano. */
export const VOCI_DI_COSTO = [
  { campo: "cost_transport", etichetta: "Trasporto" },
  { campo: "cost_preparation", etichetta: "Preparazione" },
  { campo: "cost_parts", etichetta: "Ricambi" },
  { campo: "cost_commission", etichetta: "Provvigione" },
  { campo: "cost_other", etichetta: "Altro" },
] as const;

function numero(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Quanto e' costata in tutto: l'acquisto piu' tutte le voci. */
export function costoTotale(voci: VociConto): number {
  return (
    numero(voci.purchase_price) +
    numero(voci.cost_transport) +
    numero(voci.cost_preparation) +
    numero(voci.cost_parts) +
    numero(voci.cost_commission) +
    numero(voci.cost_other)
  );
}

/**
 * Il margine, che esiste solo dopo la vendita.
 *
 * Senza prezzo di vendita torna null, non zero: zero vorrebbe dire "venduta
 * in pari", ed e' un'altra cosa. Su una schermata di soldi la differenza fra
 * "non lo so" e "zero" non e' una sfumatura.
 */
export function margine(voci: VociConto): number | null {
  if (typeof voci.sale_price !== "number" || !Number.isFinite(voci.sale_price)) return null;
  return voci.sale_price - costoTotale(voci);
}

/** Il margine in percentuale sul prezzo di vendita. Null se non si puo' dire. */
export function marginePercentuale(voci: VociConto): number | null {
  const m = margine(voci);
  if (m === null || !voci.sale_price) return null;
  return (m / voci.sale_price) * 100;
}

/**
 * Un importo scritto da un italiano.
 *
 * "18.000", "18000", "18.000,50" e "18000,50" sono la stessa cifra. Il punto
 * separa le migliaia e la virgola i centesimi: interpretarli all'inglese
 * trasformerebbe diciottomila euro in diciotto.
 */
export function leggiImporto(testo: string): number | null {
  const pulito = String(testo ?? "").trim().replace(/[€\s]/g, "");
  if (!pulito) return null;

  const normalizzato = pulito.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalizzato)) return null;

  const n = Number(normalizzato);
  return Number.isFinite(n) ? n : null;
}

/** Come lo scrive un italiano: 18.000,50 €. */
export function formattaImporto(valore: number | null | undefined): string {
  if (typeof valore !== "number" || !Number.isFinite(valore)) return "—";
  return `${new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valore)} €`;
}
