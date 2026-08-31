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
  cost_bodywork?: number | null;
  cost_workshop?: number | null;
  cost_tyres?: number | null;
  cost_preparation?: number | null;
  cost_parts?: number | null;
  cost_commission?: number | null;
  cost_other?: number | null;
  sale_price?: number | null;
};

/**
 * Le voci che compongono il costo, nell'ordine in cui le spese arrivano
 * davvero: la vettura si trasporta, si raddrizza, si mette a posto
 * meccanicamente, si prepara, e infine si vende.
 *
 * Carrozzeria, officina e gommista stanno separate dalla preparazione perche'
 * sono le tre spese piu' ricorrenti su un usato, e schiacciate dentro un'unica
 * voce non dicono niente. Separate rispondono a una domanda che il
 * concessionario si fa davvero: conviene comprare macchine che hanno bisogno
 * di lamiera, di meccanica o di gomme?
 *
 * Il gommista ha preso il posto della nota che chiedeva di spiegare a parole
 * cosa fosse l'"altro costo" -- il cui esempio era, per l'appunto,
 * "gommatura". Nessuno l'aveva mai compilata: al 31/08/2026 era vuota su tutte
 * le righe, compresa quella che aveva 500 euro di "altro" scritti dentro. Un
 * campo che chiede di spiegare a parole una cifra non si riempie; quella cifra
 * si sposta in una voce che porta gia' il suo nome.
 */
export const VOCI_DI_COSTO = [
  { campo: "cost_transport", etichetta: "Trasporto" },
  { campo: "cost_bodywork", etichetta: "Carrozzeria" },
  { campo: "cost_workshop", etichetta: "Officina" },
  { campo: "cost_tyres", etichetta: "Gommista" },
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
    numero(voci.cost_bodywork) +
    numero(voci.cost_workshop) +
    numero(voci.cost_tyres) +
    numero(voci.cost_preparation) +
    numero(voci.cost_parts) +
    numero(voci.cost_commission) +
    numero(voci.cost_other)
  );
}

/**
 * Il margine, che esiste solo quando si sanno **tutte e due** le cose: quanto
 * e' costata e a quanto e' andata.
 *
 * Senza uno dei due torna null, non zero. Zero vorrebbe dire "venduta in
 * pari", ed e' un'altra cosa: su una schermata di soldi la differenza fra
 * "non lo so" e "zero" non e' una sfumatura.
 *
 * Il prezzo d'acquisto entra in questa regola dal 31/08/2026. Prima mancando
 * valeva zero, e una vettura venduta a 11.500 senza acquisto scritto risultava
 * con 11.500 di margine -- visto su una riga vera in produzione. Nelle
 * statistiche quella cifra gonfiava il totale del mese senza che si capisse da
 * dove venisse.
 *
 * Chi ha davvero avuto un costo d'acquisto nullo scrive **0**, e il margine si
 * calcola: e' la differenza fra il campo vuoto e il campo con dentro uno zero.
 */
export function margine(voci: VociConto): number | null {
  if (typeof voci.sale_price !== "number" || !Number.isFinite(voci.sale_price)) return null;
  if (typeof voci.purchase_price !== "number" || !Number.isFinite(voci.purchase_price)) return null;
  return voci.sale_price - costoTotale(voci);
}

/**
 * Perche' il margine non si puo' ancora dire. Serve a scriverlo accanto al
 * trattino invece di lasciare il concessionario a indovinare.
 */
export function perche(voci: VociConto): string | null {
  const senzaVendita = typeof voci.sale_price !== "number" || !Number.isFinite(voci.sale_price);
  const senzaAcquisto = typeof voci.purchase_price !== "number" || !Number.isFinite(voci.purchase_price);

  if (senzaVendita && senzaAcquisto) return "mancano acquisto e vendita";
  if (senzaVendita) return "si vede dopo la vendita";
  if (senzaAcquisto) return "manca il prezzo di acquisto";
  return null;
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
