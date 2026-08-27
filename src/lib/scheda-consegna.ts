/**
 * La scheda di consegna veicolo: il documento che il concessionario stampa e
 * fa firmare al cliente quando gli consegna l'auto.
 *
 * E' un servizio del solo Piano Elite. Il piano in vigore non si legge mai da
 * `dealers.subscription_plan` -- vedi `@/lib/dealer-plan`, quella colonna dice
 * "base" anche a chi ha attivato Elite.
 *
 * Qui c'e' soltanto la logica: chi puo' usarla e cosa finisce sul foglio. La
 * pagina disegna, questo modulo decide, e la decisione si prova senza
 * database.
 */

import { DEALER_PLAN_CODES, type DealerPlanCode } from "@/lib/dealer-plan";
import { formatRegistrationLabel } from "@/lib/vehicles";

/** I piani che comprendono la scheda di consegna. Oggi soltanto l'Elite. */
export const PIANI_CON_SCHEDA_CONSEGNA: readonly DealerPlanCode[] = ["elite"];

export function pianoIncludeSchedaConsegna(planCode: string | null | undefined) {
  const normalizzato = String(planCode ?? "").trim().toLowerCase();

  // Un codice che non riconosciamo non apre la porta: meglio negare una
  // funzione a chi ne ha diritto -- se ne accorge e lo dice -- che regalarla
  // a chi non l'ha pagata, che non lo dira' mai.
  if (!(DEALER_PLAN_CODES as readonly string[]).includes(normalizzato)) {
    return false;
  }

  return PIANI_CON_SCHEDA_CONSEGNA.includes(normalizzato as DealerPlanCode);
}

/**
 * Una riga del foglio.
 *
 * `valore: null` non e' un errore: e' una riga **da compilare a mano**. Su un
 * documento che si firma, un trattino al posto della targa e' peggio di uno
 * spazio bianco -- il trattino sembra dire "non ha targa", lo spazio dice
 * "scrivila qui". Serve davvero: dei 164 veicoli in produzione nessuno ha
 * targa o telaio salvati, perche' arrivano tutti dall'importazione.
 */
export type RigaConsegna = {
  etichetta: string;
  valore: string | null;
};

export type VeicoloDaConsegnare = {
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  plate?: string | null;
  vin?: string | null;
  registration_date?: string | null;
  registration_month?: string | null;
  year?: number | string | null;
  mileage?: number | null;
  fuel?: string | null;
  transmission?: string | null;
  color?: string | null;
  warranty?: string | null;
  equipment?: string[] | string | null;
};

function valore(input: unknown): string | null {
  const testo = String(input ?? "").trim();
  return testo.length > 0 ? testo : null;
}

export function formattaChilometri(mileage: number | null | undefined) {
  if (typeof mileage !== "number" || !Number.isFinite(mileage)) {
    return null;
  }

  return `${new Intl.NumberFormat("it-IT").format(mileage)} km`;
}

/** I dati del veicolo cosi' come vanno letti sul foglio, nell'ordine. */
export function righeVeicolo(vehicle: VeicoloDaConsegnare): RigaConsegna[] {
  const marcaModello = [valore(vehicle.brand), valore(vehicle.model)].filter(Boolean).join(" ");
  const immatricolazione =
    formatRegistrationLabel({
      registration_date: vehicle.registration_date,
      registration_month: vehicle.registration_month,
      year: vehicle.year,
    }) ?? null;

  return [
    { etichetta: "Marca e modello", valore: valore(marcaModello) },
    { etichetta: "Allestimento", valore: valore(vehicle.version) },
    { etichetta: "Targa", valore: valore(vehicle.plate) },
    { etichetta: "Numero di telaio", valore: valore(vehicle.vin) },
    { etichetta: "Immatricolazione", valore: valore(immatricolazione) },
    { etichetta: "Alimentazione", valore: valore(vehicle.fuel) },
    { etichetta: "Cambio", valore: valore(vehicle.transmission) },
    { etichetta: "Colore", valore: valore(vehicle.color) },
    { etichetta: "Chilometri a libretto", valore: formattaChilometri(vehicle.mileage) },
  ];
}

/**
 * Le dotazioni, che nel database stanno a volte come elenco e a volte come
 * una riga sola separata da virgole.
 */
export function dotazioniVeicolo(equipment: string[] | string | null | undefined): string[] {
  if (Array.isArray(equipment)) {
    return equipment.map((voce) => String(voce).trim()).filter(Boolean);
  }

  return String(equipment ?? "")
    .split(/[,;\n]/)
    .map((voce) => voce.trim())
    .filter(Boolean);
}

export type ConcessionariaInIntestazione = {
  legal_name?: string | null;
  name?: string | null;
  address?: string | null;
  zip_code?: string | null;
  city?: string | null;
  province?: string | null;
  vat_number?: string | null;
  phone?: string | null;
  email?: string | null;
};

/**
 * L'intestazione: chi consegna. Le righe vuote non si stampano affatto --
 * qui, a differenza dei dati del veicolo, non c'e' niente da scrivere a mano:
 * o il dato c'e' in anagrafica o quella riga non serve.
 */
export function righeConcessionaria(dealer: ConcessionariaInIntestazione): string[] {
  const luogo = [valore(dealer.zip_code), valore(dealer.city)].filter(Boolean).join(" ");
  const provincia = valore(dealer.province);
  const riga = [luogo, provincia ? `(${provincia})` : null].filter(Boolean).join(" ");
  const partitaIva = valore(dealer.vat_number);

  return [
    valore(dealer.address),
    valore(riga),
    partitaIva ? `P. IVA ${partitaIva}` : null,
    valore(dealer.phone),
    valore(dealer.email),
  ].filter((voce): voce is string => voce !== null);
}

export type ClienteInConsegna = {
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  fiscal_code?: string | null;
  vat_number?: string | null;
  address?: string | null;
  zip_code?: string | null;
  city?: string | null;
  province?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
};

/**
 * Chi ritira. Un cliente scelto dall'archivio riempie le righe; senza
 * cliente scelto restano tutte vuote, da compilare a mano al momento della
 * consegna -- che e' il caso normale finche' l'anagrafica non e' popolata.
 */
export function righeCliente(cliente: ClienteInConsegna | null): RigaConsegna[] {
  const nome = cliente
    ? valore(cliente.company) ?? valore([valore(cliente.first_name), valore(cliente.last_name)].filter(Boolean).join(" "))
    : null;

  const luogo = cliente
    ? valore(
        [
          valore(cliente.address),
          [valore(cliente.zip_code), valore(cliente.city)].filter(Boolean).join(" "),
          valore(cliente.province) ? `(${cliente.province})` : null,
        ]
          .filter(Boolean)
          .join(" - ")
      )
    : null;

  return [
    { etichetta: "Intestatario", valore: nome },
    { etichetta: "Codice fiscale / P. IVA", valore: cliente ? valore(cliente.fiscal_code) ?? valore(cliente.vat_number) : null },
    { etichetta: "Residenza / sede", valore: luogo },
    { etichetta: "Telefono", valore: cliente ? valore(cliente.mobile) ?? valore(cliente.phone) : null },
    { etichetta: "Email", valore: cliente ? valore(cliente.email) : null },
  ];
}

/** L'etichetta con cui un cliente compare nella tendina di scelta. */
export function etichettaCliente(cliente: ClienteInConsegna & { id?: string }) {
  const nome = valore(cliente.company) ?? valore([valore(cliente.first_name), valore(cliente.last_name)].filter(Boolean).join(" "));
  const luogo = valore(cliente.city);

  if (!nome) {
    return "Cliente senza nome";
  }

  return luogo ? `${nome} - ${luogo}` : nome;
}
