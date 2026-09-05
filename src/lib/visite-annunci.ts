/**
 * Le regole di chi conta come visita, senza rete e senza database.
 *
 * Chiesto dal titolare il 05/09/2026: sapere dal pannello quante visite
 * riceve ogni concessionaria e ogni annuncio. Prima non si misurava niente.
 *
 * **La visita la segnala il browser, non il server.** Le pagine degli
 * annunci stanno in cache (`revalidate = 60`): un contatore dentro la pagina
 * scatterebbe una volta al minuto per vettura, non una per visitatore, e
 * produrrebbe un numero che sembra vero e non lo e' -- lo stesso difetto per
 * cui le "Visualizzazioni" ferme a zero sono state tolte dalle schede
 * veicolo. Facendola segnalare dal browser si conta una persona per volta, e
 * si escludono da soli i robot dei motori di ricerca, che non eseguono
 * quel codice: senza questo accorgimento meta' del grafico sarebbe Googlebot
 * che rilegge le 248 schede.
 *
 * **Non si raccoglie nessun dato personale**: ne' indirizzo IP, ne'
 * identificativi, ne' cookie. Solo quante volte una scheda e' stata aperta.
 */

/** Cosa e' stato visitato. */
export type TipoDiVisita = "annuncio" | "concessionaria";

export type RichiestaDiVisita = {
  tipo: TipoDiVisita;
  /** L'identificativo della vettura o della concessionaria. */
  id: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Legge quello che manda il browser, o restituisce null.
 *
 * **Della concessionaria mandata dal browser non ci si fida mai** -- per un
 * annuncio non la si chiede nemmeno: la ricava il database dalla vettura.
 * Se l'attribuzione arrivasse da fuori, chi conosce l'indirizzo del punto di
 * raccolta potrebbe assegnare visite alla concessionaria che preferisce.
 */
export function leggiRichiestaDiVisita(corpo: unknown): RichiestaDiVisita | null {
  if (!corpo || typeof corpo !== "object") return null;

  const dati = corpo as { tipo?: unknown; id?: unknown };
  const tipo = String(dati.tipo ?? "").trim();
  const id = String(dati.id ?? "").trim();

  if (tipo !== "annuncio" && tipo !== "concessionaria") return null;
  if (!UUID.test(id)) return null;

  return { tipo, id };
}

/**
 * I robot dichiarati.
 *
 * E' la seconda rete, non la prima: la prima e' che la segnalazione parte dal
 * browser, e un robot che non esegue il codice della pagina non arriva mai
 * fin qui. Questa serve per quelli che il codice lo eseguono -- l'anteprima
 * di WhatsApp, il controllo di velocita' di Google -- e per chi chiama
 * l'indirizzo a mano dichiarando cosa e'.
 *
 * Un elenco di nomi non riconoscera' mai tutto: chi vuole nascondersi si
 * dichiara "Mozilla" e passa. Serve a togliere il rumore onesto, non a
 * fermare qualcuno.
 */
const NOMI_DA_ROBOT = [
  "bot",
  "crawler",
  "spider",
  "slurp",
  "curl",
  "wget",
  "python-requests",
  "headlesschrome",
  "lighthouse",
  "pagespeed",
  "facebookexternalhit",
  "whatsapp",
  "telegrambot",
  "preview",
  "monitor",
  "pingdom",
  "uptime",
];

export function sembraUnRobot(userAgent: string | null | undefined): boolean {
  const testo = String(userAgent ?? "").trim().toLowerCase();

  // Un browser vero si presenta sempre. Una richiesta senza presentazione non
  // viene da una persona che sta guardando una pagina.
  if (testo.length === 0) return true;

  return NOMI_DA_ROBOT.some((nome) => testo.includes(nome));
}

/**
 * Quanto spesso si accetta una segnalazione dallo stesso indirizzo di rete.
 *
 * Due freni, e nessuno dei due conserva l'indirizzo: e' solo una chiave in
 * memoria del processo che sta rispondendo, e sparisce con lui.
 *
 * I numeri non sono stretti di proposito. Dietro un solo indirizzo ci puo'
 * essere un ufficio intero, e contare una visita sola per tutti falserebbe i
 * numeri nel verso opposto. Qui si vuole fermare chi chiama diecimila volte
 * per gonfiare una concessionaria, non chi guarda quindici automobili.
 *
 * E' un dosso, non un muro: su piu' processi in parallelo ognuno ha la sua
 * memoria. Per fermare davvero qualcuno servirebbe un conteggio condiviso,
 * che vorrebbe dire conservare gli indirizzi -- il prezzo non vale il rischio,
 * visto che questi numeri li guarda solo il titolare.
 */
export const FRENO_PER_PAGINA = { windowMs: 60 * 60 * 1000, maxRequests: 5 };
export const FRENO_COMPLESSIVO = { windowMs: 60 * 60 * 1000, maxRequests: 150 };
