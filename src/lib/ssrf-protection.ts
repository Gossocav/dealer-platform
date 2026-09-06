import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";

/**
 * L'unica protezione contro le richieste dirette verso l'interno.
 *
 * **Perche' esiste in questa forma.** Fino al 05/09/2026 il progetto ne aveva
 * due, diverse. Quella del proxy delle fotografie risolveva il nome e
 * ricontrollava a ogni rimbalzo; questa, che protegge le importazioni,
 * guardava soltanto il nome scritto nell'indirizzo. Misurato riproducendo la
 * vecchia funzione e passandole cio' che riceveva davvero, `URL.hostname`:
 *
 *   fermato   http://127.0.0.1/            hostname: 127.0.0.1
 *   fermato   http://2130706433/           hostname: 127.0.0.1
 *   PASSAVA   http://[::1]/                hostname: [::1]
 *   PASSAVA   http://[::ffff:127.0.0.1]/   hostname: [::ffff:7f00:1]
 *   PASSAVA   http://[fd00::1]/            hostname: [fd00::1]
 *   PASSAVA   http://100.64.0.1/           hostname: 100.64.0.1
 *   PASSAVA   http://192.0.0.1/            hostname: 192.0.0.1
 *   PASSAVA   http://interno.esempio.it/   hostname: interno.esempio.it
 *
 * Tre cose che val la pena leggere in quella tabella.
 *
 * **Ogni indirizzo IPv6 passava, compreso il piu' banale.** `URL.hostname`
 * restituisce gli IPv6 fra parentesi quadre, `[::1]`, e `isIP("[::1]")`
 * risponde "non e' un indirizzo": il ramo IPv6 di quella funzione non e' mai
 * stato raggiunto da nessuno. Era codice morto che sembrava una protezione.
 *
 * **La scrittura decimale non era un aggiramento**, contrariamente a quanto
 * si direbbe: `new URL("http://2130706433/").hostname` vale gia' `127.0.0.1`,
 * perche' l'analizzatore di indirizzi normalizza da se' le forme decimale,
 * ottale ed esadecimale. Si annota perche' e' il tipo di conclusione che si
 * dara' per buona la prossima volta senza misurarla.
 *
 * **Il buco vero era l'ultima riga.** Un nome regolarissimo che *punta* a un
 * indirizzo interno passava sempre, perche' nessuno chiedeva mai dove
 * portasse. Guardare dove porta un nome, invece di come e' scritto, chiude
 * quella strada e insieme tutte quelle che non abbiamo previsto -- comprese
 * le due righe di intervalli che qui mancavano.
 *
 * **Cosa resta scoperto, detto invece che nascosto.** Fra il momento in cui
 * si risolve il nome e il momento in cui si apre la connessione, il nome
 * viene risolto una seconda volta dal sistema. Chi controlla un server dei
 * nomi puo' rispondere due volte in modo diverso -- pubblico al controllo,
 * interno alla connessione. Chiuderla del tutto richiede di imporre alla
 * connessione l'indirizzo gia' verificato, cosa che il `fetch` di Node non
 * permette senza aggiungere una libreria. La finestra e' stretta e richiede
 * un server dei nomi complice: si accetta, e si scrive qui invece di
 * lasciar credere che non ci sia.
 */

/**
 * Gli intervalli IPv4 che non si raggiungono da qui: rete locale, indirizzi
 * di servizio, e soprattutto 169.254.0.0/16, dove vivono i servizi di
 * configurazione delle piattaforme cloud.
 */
const INTERVALLI_VIETATI_IPV4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const NOMI_VIETATI = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

const CODICI_DI_RIMBALZO = new Set([301, 302, 303, 307, 308]);

export type MotivoRifiuto =
  | "indirizzo-illeggibile"
  | "schema-non-ammesso"
  | "credenziali-nell-indirizzo"
  | "host-non-risolvibile"
  | "host-non-consentito"
  | "troppi-rimbalzi";

/**
 * Il rifiuto porta con se' il motivo, non solo un messaggio.
 *
 * Serve a chi chiama per rispondere in modo diverso: il proxy delle
 * fotografie distingue "non si risolve" (400, l'indirizzo e' sbagliato) da
 * "non e' consentito" (403, l'indirizzo e' valido ma punta dove non si va), e
 * un messaggio da confrontare come testo si romperebbe alla prima riscrittura.
 */
export class IndirizzoNonAmmesso extends Error {
  motivo: MotivoRifiuto;

  constructor(motivo: MotivoRifiuto, messaggio: string) {
    super(messaggio);
    this.name = "IndirizzoNonAmmesso";
    this.motivo = motivo;
  }
}

function ipv4ANumero(ip: string): number | null {
  const parti = ip.split(".");
  if (parti.length !== 4) return null;

  let numero = 0;
  for (const parte of parti) {
    if (!/^\d{1,3}$/.test(parte)) return null;
    const ottetto = Number(parte);
    if (ottetto > 255) return null;
    numero = (numero << 8) + ottetto;
  }

  return numero >>> 0;
}

export function indirizzoVietatoIPv4(ip: string): boolean {
  const numero = ipv4ANumero(ip);
  if (numero === null) return true; // illeggibile -> si chiude

  for (const [base, bit] of INTERVALLI_VIETATI_IPV4) {
    const baseNumero = ipv4ANumero(base);
    if (baseNumero === null) continue;
    const maschera = bit === 0 ? 0 : (0xffffffff << (32 - bit)) >>> 0;
    if ((numero & maschera) === (baseNumero & maschera)) return true;
  }

  return false;
}

function leggiIPv6(testo: string): number[] | null {
  let resto = testo;

  const zona = resto.indexOf("%");
  if (zona !== -1) resto = resto.slice(0, zona);

  // Una coda IPv4 (per esempio ::ffff:127.0.0.1) diventa due gruppi esadecimali.
  const punto = resto.indexOf(".");
  if (punto !== -1) {
    const ultimoDuePunti = resto.lastIndexOf(":", punto);
    if (ultimoDuePunti === -1) return null;
    const incorporato = ipv4ANumero(resto.slice(ultimoDuePunti + 1));
    if (incorporato === null) return null;
    const alto = ((incorporato >>> 16) & 0xffff).toString(16);
    const basso = (incorporato & 0xffff).toString(16);
    resto = `${resto.slice(0, ultimoDuePunti + 1)}${alto}:${basso}`;
  }

  const meta = resto.split("::");
  if (meta.length > 2) return null;

  const leggiGruppi = (segmento: string): number[] | null => {
    if (segmento === "") return [];
    const gruppi: number[] = [];
    for (const gruppo of segmento.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(gruppo)) return null;
      gruppi.push(parseInt(gruppo, 16));
    }
    return gruppi;
  };

  const testa = leggiGruppi(meta[0]);
  if (testa === null) return null;

  if (meta.length === 1) {
    return testa.length === 8 ? testa : null;
  }

  const coda = leggiGruppi(meta[1]);
  if (coda === null) return null;

  const mancanti = 8 - testa.length - coda.length;
  if (mancanti < 0) return null;

  return [...testa, ...new Array(mancanti).fill(0), ...coda];
}

export function indirizzoVietatoIPv6(ip: string): boolean {
  const gruppi = leggiIPv6(ip);
  if (!gruppi) return true; // illeggibile -> si chiude

  // ::ffff:a.b.c.d -> vale l'IPv4 che porta dentro.
  if (gruppi.slice(0, 5).every((g) => g === 0) && gruppi[5] === 0xffff) {
    const incorporato = `${(gruppi[6] >> 8) & 0xff}.${gruppi[6] & 0xff}.${(gruppi[7] >> 8) & 0xff}.${gruppi[7] & 0xff}`;
    return indirizzoVietatoIPv4(incorporato);
  }

  // :: e ::1
  if (gruppi.every((g) => g === 0)) return true;
  if (gruppi.slice(0, 7).every((g) => g === 0) && gruppi[7] === 1) return true;

  // fe80::/10, indirizzi di collegamento locale
  if ((gruppi[0] & 0xffc0) === 0xfe80) return true;

  // fc00::/7, indirizzi locali unici
  if ((gruppi[0] & 0xfe00) === 0xfc00) return true;

  return false;
}

/**
 * Dove porta davvero questo nome?
 *
 * Un indirizzo IP scritto per esteso risolve su se' stesso, quindi la stessa
 * strada copre sia i nomi sia gli indirizzi, comprese le scritture che non
 * somigliano a un indirizzo (decimale, ottale, esadecimale): a decidere e'
 * cio' che torna dalla risoluzione, non com'era scritto.
 */
export async function assertHostPubblico(hostname: string): Promise<void> {
  // URL.hostname mette gli IPv6 fra parentesi quadre ("[::1]"): si tolgono,
  // cosi' sia la risoluzione sia il controllo vedono l'indirizzo nudo.
  const host = hostname.replace(/^\[/, "").replace(/\]$/, "").trim().toLowerCase();

  if (!host) {
    throw new IndirizzoNonAmmesso("host-non-risolvibile", "Host non risolvibile");
  }

  if (NOMI_VIETATI.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new IndirizzoNonAmmesso("host-non-consentito", "Host non consentito");
  }

  let risultati: LookupAddress[];
  try {
    risultati = await lookup(host, { all: true });
  } catch {
    throw new IndirizzoNonAmmesso("host-non-risolvibile", "Host non risolvibile");
  }

  if (risultati.length === 0) {
    throw new IndirizzoNonAmmesso("host-non-risolvibile", "Host non risolvibile");
  }

  // Basta **un** indirizzo vietato per fermare tutto: un nome che risponde
  // con piu' indirizzi puo' farne uscire uno diverso a ogni richiesta.
  for (const { address, family } of risultati) {
    const vietato = family === 6 ? indirizzoVietatoIPv6(address) : indirizzoVietatoIPv4(address);
    if (vietato) {
      throw new IndirizzoNonAmmesso("host-non-consentito", "Host non consentito");
    }
  }
}

/**
 * I controlli sulla forma dell'indirizzo, senza rete.
 *
 * Resta sincrona di proposito: la chiamano gia' quattro punti del codice, e
 * la parte che ha bisogno della rete -- sapere dove porta il nome -- sta
 * dentro `fetchWithSsrfProtection`, cioe' nel momento in cui la connessione
 * si apre davvero. Controllare all'apertura, e non prima, e' anche piu'
 * giusto: fra i due momenti l'indirizzo puo' cambiare, per esempio a un
 * rimbalzo.
 */
export function parseAndValidateExternalHttpUrl(rawValue: string | URL): URL {
  let indirizzo: URL;

  try {
    indirizzo = rawValue instanceof URL ? new URL(rawValue.toString()) : new URL(String(rawValue ?? "").trim());
  } catch {
    throw new IndirizzoNonAmmesso("indirizzo-illeggibile", "Indirizzo non leggibile.");
  }

  if (indirizzo.protocol !== "http:" && indirizzo.protocol !== "https:") {
    throw new IndirizzoNonAmmesso("schema-non-ammesso", "Only HTTP/HTTPS URLs are allowed.");
  }

  if (indirizzo.username || indirizzo.password) {
    throw new IndirizzoNonAmmesso("credenziali-nell-indirizzo", "URL userinfo is not allowed.");
  }

  return indirizzo;
}

/**
 * Come `fetch`, ma nessun rimbalzo esce dal controllo.
 *
 * I rimbalzi si seguono a mano proprio per questo: un indirizzo pubblico che
 * risponde "vai qui" indicando un indirizzo interno e' il modo piu' semplice
 * di aggirare un controllo fatto una volta sola all'inizio.
 */
export async function fetchWithSsrfProtection(
  input: string | URL,
  init: RequestInit & { maxRedirects?: number } = {}
) {
  const { maxRedirects = 5, ...restoInit } = init;

  let indirizzoCorrente = parseAndValidateExternalHttpUrl(input);

  for (let rimbalzo = 0; rimbalzo <= maxRedirects; rimbalzo += 1) {
    await assertHostPubblico(indirizzoCorrente.hostname);

    const risposta = await fetch(indirizzoCorrente.toString(), {
      ...restoInit,
      redirect: "manual",
    });

    if (!CODICI_DI_RIMBALZO.has(risposta.status)) {
      return risposta;
    }

    const destinazione = risposta.headers.get("location");
    if (!destinazione) {
      throw new IndirizzoNonAmmesso("indirizzo-illeggibile", "Redirect without location header.");
    }

    // Il corpo di un rimbalzo non serve a nessuno: lasciarlo aperto tiene
    // impegnata la connessione fino al tempo scaduto.
    await risposta.body?.cancel().catch(() => {});

    indirizzoCorrente = parseAndValidateExternalHttpUrl(new URL(destinazione, indirizzoCorrente));
  }

  throw new IndirizzoNonAmmesso("troppi-rimbalzi", "Too many redirects.");
}
