/**
 * Tenere allineato lo stock importato con il sito da cui e' arrivato.
 *
 * Due cose che il solo "importa" non fa:
 *
 * 1. **Le vendute non sparivano.** Un'automobile che non c'e' piu' sul sito
 *    della concessionaria e' quasi sempre venduta, ma restava in vetrina su
 *    KeyAuto. Il 27 agosto 2026 erano sette su centoquarantasette: un cliente
 *    poteva chiedere informazioni per un'auto che non esiste piu'.
 * 2. **Niente si aggiornava da solo.** Il prezzo che il concessionario cambia
 *    sul suo sito restava quello vecchio qui finche' qualcuno non premeva un
 *    bottone.
 *
 * Questo modulo non parla col database e non legge la rete: prende l'elenco
 * di cio' che il sito dichiara adesso e le righe che abbiamo noi, e dice cosa
 * cambiare. Cosi' la parte che decide si puo' provare davvero, mentre chi
 * scrive si limita a eseguire.
 */

import type { DealerSiteVehicle } from "@/lib/dealer-site-import";
import { canonicalizeVehicleColorLabel } from "@/lib/vehicle-colors";
import { canonicalizeVehicleBodyType } from "@/lib/vehicle-import";
import { derivaVersioneDalTitolo, normalizzaModello } from "@/lib/vehicle-label";

export type RigaImportata = {
  id: string;
  import_source_id: string | null;
  status: string | null;
  published: boolean | null;
  import_missing_since: string | null;
};

export type PianoRiconciliazione = {
  /** Erano in vetrina, il sito non le dichiara piu': si tolgono. */
  daNascondere: string[];
  /** Le avevamo tolte noi e il sito le dichiara di nuovo: tornano in vetrina. */
  daRipristinare: string[];
};

export type EsitoRiconciliazione =
  | { ok: true; piano: PianoRiconciliazione }
  | { ok: false; motivo: "elenco-vuoto" | "sparizione-sospetta"; assenti: number; totale: number };

/**
 * Sotto questa soglia non si applica il freno della sparizione in massa: con
 * poche auto in archivio "piu' della meta' sono sparite" e' un fatto normale
 * -- tre vendute su cinque -- e non l'indizio di un sito che ha cambiato
 * indirizzi.
 */
export const SOGLIA_ARCHIVIO_PICCOLO = 10;

/**
 * Cosa cambiare, dato quello che il sito dichiara adesso.
 *
 * Le due reti di sicurezza sono il cuore di questa funzione, e stanno qui
 * invece che nell'endpoint proprio per poterle provare:
 *
 * - **elenco vuoto**: se il sito non dichiara niente non e' che ha venduto
 *   tutto, e' che non si e' lasciato leggere. Non si tocca nulla.
 * - **sparizione sospetta**: se piu' della meta' dello stock risulta sparito
 *   in un colpo solo, la spiegazione probabile non e' una svendita ma un sito
 *   che ha rifatto gli indirizzi. Si ferma e lo si segnala, invece di
 *   svuotare il marketplace di una concessionaria.
 *
 * Si nascondono soltanto le automobili **pubblicate**: quelle gia' fuori
 * vetrina non hanno niente da correggere, e lasciandole stare il ripristino
 * puo' rimetterle esattamente com'erano -- pubblicate -- senza doversi
 * ricordare da dove venivano.
 */
export function pianoRiconciliazione(input: {
  idsSulSito: readonly string[];
  righe: readonly RigaImportata[];
}): EsitoRiconciliazione {
  const sulSito = new Set(input.idsSulSito.map((id) => String(id).trim()).filter(Boolean));
  const assenti = input.righe.filter((riga) => !sulSito.has(String(riga.import_source_id ?? "").trim()));

  if (sulSito.size === 0) {
    return { ok: false, motivo: "elenco-vuoto", assenti: assenti.length, totale: input.righe.length };
  }

  if (input.righe.length >= SOGLIA_ARCHIVIO_PICCOLO && assenti.length * 2 > input.righe.length) {
    return { ok: false, motivo: "sparizione-sospetta", assenti: assenti.length, totale: input.righe.length };
  }

  return {
    ok: true,
    piano: {
      daNascondere: assenti
        .filter((riga) => riga.import_missing_since === null && eraInVetrina(riga))
        .map((riga) => riga.id),
      daRipristinare: input.righe
        .filter((riga) => sulSito.has(String(riga.import_source_id ?? "").trim()))
        .filter((riga) => riga.import_missing_since !== null)
        .map((riga) => riga.id),
    },
  };
}

function eraInVetrina(riga: RigaImportata) {
  return riga.status === "published" || (riga.published === true && !riga.status);
}

/** Come si presenta un'auto tolta dalla vetrina perche' non e' piu' sul sito. */
export function campiVeicoloSparito(adesso: Date) {
  return {
    // "In revisione" e non "Venduto": che sia stata venduta e' probabile, non
    // certo, e un veicolo dichiarato venduto finirebbe nei conti delle
    // vendite come se fosse successo davvero. "Archiviato" nemmeno: dallo
    // stato archiviato non si torna indietro, e queste devono poter tornare
    // in vetrina da sole se ricompaiono sul sito.
    status: "in_review",
    published: false,
    import_missing_since: adesso.toISOString(),
    updated_at: adesso.toISOString(),
  };
}

/** Come si presenta un'auto che il sito dichiara di nuovo. */
export function campiVeicoloRitrovato(adesso: Date) {
  return {
    status: "published",
    published: true,
    import_missing_since: null,
    updated_at: adesso.toISOString(),
  };
}

/**
 * I soli dati del veicolo, senza niente che riguardi la pubblicazione.
 *
 * Serve a tenere una sorgente sola per la mappatura sito -> nostre colonne,
 * usata sia dall'importazione a mano sia dalla sincronizzazione notturna. La
 * seconda **non deve poter toccare `status` e `published`**: girando da sola
 * di notte, un errore li' toglierebbe dal marketplace lo stock di una
 * concessionaria senza che nessuno abbia chiesto niente. Tenendoli fuori di
 * qui, non puo' proprio farlo.
 */
export function payloadDatiVeicolo(v: DealerSiteVehicle) {
  return {
    brand: v.brand,
    // La versione non arriva separata: il sito da' un titolo intero. Prima ci
    // finiva dentro tal quale, e siccome marca e modello sono gia' due campi a
    // parte, l'intestazione dell'annuncio li diceva due volte -- "Hyundai
    // Tucson Hyundai Tucson" -- su ogni veicolo importato.
    //
    // Adesso si scrive solo quello che il titolo aggiunge davvero
    // ("1.6 CRDi Xline"): niente troncamenti inventati, si toglie solo cio'
    // che e' gia' scritto nei campi accanto.
    // Il modello come lo dichiara il sito, ma leggibile: alcuni lo mettono
    // nei dati strutturati con la forma dell'indirizzo, `range-rover-evoque`.
    model: normalizzaModello(v.model),
    // L'indirizzo della scheda serve a riconoscere il nome della
    // concessionaria dentro al titolo: sul suo sito ci sta di diritto, qui e'
    // rumore che occupa lo spazio buono del titolo.
    version: derivaVersioneDalTitolo(v.name, v.brand, v.model, { sorgente: v.url }),
    price: v.price,
    mileage: v.mileage,
    fuel: v.fuel,
    transmission: v.transmission,
    doors: v.doors,
    seats: v.seats,
    color: canonicalizeVehicleColorLabel(v.color ?? "") || null,
    // Senza carrozzeria un veicolo non compare in "Esplora per categoria" ne'
    // nel filtro della ricerca avanzata: e' invisibile a chi cerca per tipo.
    // Il sito la scrive a modo suo ("Berlina due volumi", "Furgoni/Van") e la
    // tabella dei sinonimi la riporta alle nostre.
    body_type: canonicalizeVehicleBodyType(v.bodyType ?? "") || null,
    year: v.year,
    // Il mese sta a se' e non dentro registration_date: quella e' una data
    // piena, e per scriverla servirebbe un giorno che nessuno ci ha dato.
    // Un "1 gennaio" inventato comparirebbe sulle schede come se fosse il
    // giorno vero dell'immatricolazione.
    registration_month: v.registrationMonth,
    vehicle_condition: v.condition,
    vehicle_category: "Auto",
    description: v.description,
  };
}
