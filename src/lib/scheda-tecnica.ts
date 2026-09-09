import { formatText, normalizeVehicleLabelField } from "@/lib/public-marketplace";
import { normalizzaModello, ripulisciTitoloVeicolo } from "@/lib/vehicle-label";

/**
 * Le righe della scheda tecnica di un annuncio: **solo quelle che hanno
 * davvero qualcosa da dire.**
 *
 * Vive qui, e non dentro la pagina, per la stessa ragione di `vehicle-seo.ts`:
 * per poterla misurare senza disegnare mezzo marketplace.
 *
 * **Perche' le righe vuote si tolgono.** Prima si disegnavano tutte, e quelle
 * senza dato mostravano un trattino. Contate sulla produzione il 09/09/2026:
 * due righe vuote per scheda, e "Interni" era vuota su dodici schede su
 * dodici -- una riga che non ha mai detto niente a nessuno.
 *
 * Non e' una questione di bruttezza. Un trattino non e' un dato, ed e' testo
 * **identico su ogni scheda**: aggiungerne rende le pagine piu' simili fra
 * loro, che e' esattamente il problema per cui Google ne indicizza una su
 * cinque. Tolte le righe vuote, due schede si distinguono anche per quali
 * righe portano.
 *
 * **Cosa e' stato aggiunto.** Carrozzeria, posti e garanzia stavano gia' nel
 * database, venivano gia' letti dalla pagina, e non comparivano da nessuna
 * parte. La carrozzeria e' la piu' importante: e' una parola per cui la gente
 * cerca ("suv usati", "berlina diesel") e il gestionale la chiede gia' nel
 * modulo. Posti e garanzia li riempie l'importazione da file, dove la
 * concessionaria manda le colonne "posti" e "garanzia".
 *
 * **Cosa non e' stato aggiunto, di proposito.** "Disponibilita'" sta nel
 * database ed e' letta insieme alle altre, ma **non la scrive nessuno**, in
 * nessun punto del progetto: sarebbe una riga condannata a restare vuota per
 * sempre. Il posto giusto dove aggiungerla e' il giorno in cui qualcosa
 * comincia a riempirla.
 */
export type RigaSchedaTecnica = { label: string; value: string };

type VeicoloScheda = {
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  traction?: string | null;
  engine_size?: string | number | null;
  power_kw?: number | null;
  body_type?: string | null;
  doors?: string | number | null;
  seats?: number | null;
  emission_class?: string | null;
  color?: string | null;
  interior_type?: string | null;
  warranty?: string | null;
};

/** Il valore che `formatText` restituisce quando non c'e' niente da dire. */
const VUOTO = "-";

export function righeSchedaTecnica(veicolo: VeicoloScheda): RigaSchedaTecnica[] {
  /** Le maiuscole del titolo, applicate anche alla scheda tecnica. */
  const etichettaCampo = (value: string | null | undefined) =>
    value ? normalizeVehicleLabelField(value) : null;

  const tutte: RigaSchedaTecnica[] = [
    { label: "Marca", value: formatText(etichettaCampo(veicolo.brand)) },
    { label: "Modello", value: formatText(etichettaCampo(normalizzaModello(veicolo.model))) },
    // La stessa pulizia del titolo. Senza, la pagina diceva due cose diverse
    // di se stessa: intestazione "Honda Prelude P1 2.0 Advance My2025" e, tre
    // righe sotto, "Versione P1 2.0 Advance MY2025 2026" con l'anno ripetuto.
    { label: "Versione", value: formatText(etichettaCampo(ripulisciTitoloVeicolo(veicolo.version))) },
    { label: "Trazione", value: formatText(veicolo.traction) },
    { label: "Cilindrata", value: formatText(veicolo.engine_size) },
    { label: "Potenza kW", value: formatText(veicolo.power_kw) },
    { label: "Carrozzeria", value: formatText(etichettaCampo(veicolo.body_type)) },
    { label: "Porte", value: formatText(veicolo.doors) },
    { label: "Posti", value: formatText(veicolo.seats) },
    { label: "Classe Euro", value: formatText(veicolo.emission_class) },
    { label: "Colore", value: formatText(veicolo.color) },
    { label: "Interni", value: formatText(veicolo.interior_type) },
    { label: "Garanzia", value: formatText(veicolo.warranty) },
  ];

  return tutte.filter((riga) => riga.value !== VUOTO);
}
