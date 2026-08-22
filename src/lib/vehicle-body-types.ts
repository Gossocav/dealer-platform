// L'unico elenco delle carrozzerie. Viveva copiato in tre posti -- il modulo
// di inserimento veicolo, il filtro della ricerca pubblica e le categorie in
// home -- dove una voce aggiunta in uno solo avrebbe prodotto veicoli
// impossibili da filtrare o categorie senza corrispondenza.
//
// I valori sono anche quelli scritti su vehicles.body_type: cambiarli
// significa cambiare dati gia' salvati, non solo etichette.
//
// "SUV/Pick-up" e' diventata "SUV/Pick-up/Fuoristrada" il 22/08/2026 su
// richiesta: chi cerca un fuoristrada non lo trovava nell'elenco e non
// immaginava che stesse sotto "SUV". L'importazione gia' portava qui
// "fuoristrada", "offroad" e "crossover" -- mancava solo che si vedesse.
//
// Il valore vecchio si e' potuto cambiare senza toccare il database perche'
// nessun veicolo lo aveva salvato: verificato in produzione prima di
// rinominarlo, 22 veicoli, nessuno con questa carrozzeria. Se un domani se ne
// rinomina un'altra, quel controllo va rifatto -- e se qualche riga la usa,
// serve prima una migration che aggiorni i dati.
export const VEHICLE_BODY_TYPES = [
  "SUV/Pick-up/Fuoristrada",
  "Berlina",
  "Station Wagon",
  "City Car",
  "Monovolume",
  "Coupé",
  "Cabrio",
  "Furgone/Van",
] as const;

export type VehicleBodyType = (typeof VEHICLE_BODY_TYPES)[number];
