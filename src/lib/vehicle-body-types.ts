// L'unico elenco delle carrozzerie. Viveva copiato in tre posti -- il modulo
// di inserimento veicolo, il filtro della ricerca pubblica e le categorie in
// home -- dove una voce aggiunta in uno solo avrebbe prodotto veicoli
// impossibili da filtrare o categorie senza corrispondenza.
//
// I valori sono anche quelli scritti su vehicles.body_type: cambiarli
// significa cambiare dati gia' salvati, non solo etichette.
export const VEHICLE_BODY_TYPES = [
  "SUV/Pick-up",
  "Berlina",
  "Station Wagon",
  "City Car",
  "Monovolume",
  "Coupé",
  "Cabrio",
  "Furgone/Van",
] as const;

export type VehicleBodyType = (typeof VEHICLE_BODY_TYPES)[number];
