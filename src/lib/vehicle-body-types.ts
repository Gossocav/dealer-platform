// L'unico elenco delle carrozzerie. Viveva copiato in tre posti -- il modulo
// di inserimento veicolo, il filtro della ricerca pubblica e le categorie in
// home -- dove una voce aggiunta in uno solo avrebbe prodotto veicoli
// impossibili da filtrare o categorie senza corrispondenza.
//
// I valori sono anche quelli scritti su vehicles.body_type: cambiarli
// significa cambiare dati gia' salvati, non solo etichette.
//
// "SUV/Pick-up" e' diventata "SUV/Pick-up/Fuoristrada" il 22/08/2026, e il
// 27/08/2026 si e' divisa in due: "SUV" da una parte, "Pick-up/Fuoristrada"
// dall'altra. Sono due cose diverse per chi cerca, e stando insieme chi voleva
// un fuoristrada si trovava davanti centoventotto SUV.
//
// Misurato prima di dividerle, rileggendo la carrozzeria dai siti delle due
// concessionarie sulle 134 automobili che stavano in quella categoria: 109
// "SUV", 19 "Crossover", 5 "Fuoristrada", nessun pick-up.
//
// **Rinominare una voce non basta a rinominarla nel database.** Il 22/08 il
// valore si era potuto cambiare perche' nessuna riga lo aveva salvato -- ma il
// vincolo `vehicles_body_type_check` e' rimasto indietro, e per cinque giorni
// il database ha rifiutato ogni SUV. Da allora c'e' un test che lega questo
// elenco al vincolo, e ogni rinomina porta con se' una migration che aggiorna
// **sia i dati sia il vincolo**.
export const VEHICLE_BODY_TYPES = [
  "SUV",
  "Pick-up/Fuoristrada",
  "Berlina",
  "Station Wagon",
  "City Car",
  "Monovolume",
  "Coupé",
  "Cabrio",
  "Furgone/Van",
] as const;

export type VehicleBodyType = (typeof VEHICLE_BODY_TYPES)[number];
