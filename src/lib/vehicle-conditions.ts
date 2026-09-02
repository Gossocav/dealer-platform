/**
 * Le condizioni di una vettura: nuova, usata, chilometri zero, aziendale.
 *
 * **Sorgente unica.** I valori scritti qui sono anche quelli che finiscono
 * nella colonna `vehicle_condition` del database, e i filtri confrontano per
 * uguaglianza esatta: un "usato" minuscolo o un "KM 0" non corrisponderebbero
 * a niente. Tutte e tre le strade che scrivono una vettura passano di qui --
 * il modulo di inserimento, l'importazione da file e la sincronizzazione dal
 * sito della concessionaria -- e per questo un filtro per uguaglianza
 * funziona.
 *
 * L'elenco stava dentro `vehicle-import.ts`, che e' il posto in cui e' nato ma
 * non quello a cui appartiene: serve anche ai filtri del gestionale, e quel
 * file importa gia' da `vehicles.ts`. Metterlo qui evita la dipendenza
 * circolare, ed e' la stessa forma di `vehicle-body-types.ts`.
 */

export const VEHICLE_CONDITION_VALUES = ["Nuovo", "Usato", "Aziendale", "Km/0"] as const;

export type VehicleCondition = (typeof VEHICLE_CONDITION_VALUES)[number];

/**
 * Come si chiamano al plurale, che e' come si leggono in una tendina di
 * filtro: si sceglie fra "le usate" e "le aziendali", non fra "usato" e
 * "aziendale".
 */
export const VEHICLE_CONDITION_LABELS: Record<VehicleCondition, string> = {
  Nuovo: "Nuove",
  Usato: "Usate",
  "Km/0": "Km 0",
  Aziendale: "Aziendali",
};
