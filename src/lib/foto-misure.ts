/**
 * Le misure con cui si servono le fotografie, e chi le rimpicciolisce.
 *
 * **Perche' esiste.** Il ridimensionamento lo faceva il servizio di Vercel,
 * che e' a consumo. Il 04/09/2026 il pacchetto compreso nel piano si e'
 * esaurito e *tutte* le foto del sito hanno smesso di comparire in una volta:
 * home, catalogo, ricerca, schede veicolo, pagine delle concessionarie, con
 * "Payment required" al posto dell'immagine. Non era passeggero: una sola
 * visita alla pagina di una concessionaria con 235 auto consuma centinaia di
 * ridimensionamenti, quindi il tetto si sarebbe riesaurito comunque.
 *
 * Da qui in avanti lo facciamo noi, dentro `/api/image-proxy`.
 */

// Le larghezze che una pagina puo' chiedere sono esattamente quelle che Next
// scrive nella "srcset" (i valori predefiniti di images.imageSizes e
// images.deviceSizes): nessun altro numero comparirebbe nel sito. Si
// controllano uno per uno perche' accettarne di arbitrari vorrebbe dire
// lasciare a chiunque il modo di far ridimensionare la stessa foto in
// diecimila misure diverse -- un lavoro sul nostro server, e una copia nella
// cache, per ciascuna.
export const LARGHEZZE_FOTO_AMMESSE = [
  16, 32, 48, 64, 96, 128, 256, 384,
  640, 750, 828, 1080, 1200, 1920, 2048, 3840,
] as const;

const AMMESSE = new Set<number>(LARGHEZZE_FOTO_AMMESSE);

export const QUALITA_FOTO_PREDEFINITA = 75;

/** La larghezza chiesta, oppure niente: allora la foto si serve com'e'. */
export function larghezzaFotoRichiesta(valore: string | null | undefined) {
  const numero = Number(valore ?? "");
  return Number.isInteger(numero) && AMMESSE.has(numero) ? numero : null;
}

export function qualitaFotoRichiesta(valore: string | null | undefined) {
  const numero = Number(valore ?? "");
  return Number.isInteger(numero) && numero >= 1 && numero <= 100 ? numero : QUALITA_FOTO_PREDEFINITA;
}

/**
 * Ogni browser dichiara "image/webp" fra i formati che accetta. Chi non lo fa
 * riceve JPEG o PNG: il compositore delle anteprime social legge soltanto
 * quelli, e servirgli webp gli faceva sollevare "Unsupported image type" --
 * cioe' un errore al posto dell'anteprima. Vedi `vaTrasformata`.
 */
export function accettaWebp(intestazioneAccept: string | null | undefined) {
  return /image\/webp/i.test(String(intestazioneAccept ?? ""));
}

/**
 * Perche' una foto e' stata consegnata come e' arrivata.
 *
 * Serve a distinguere due guasti che da fuori si vedono identici -- la foto
 * pesa quanto l'originale -- e che si curano in modi opposti: la libreria non
 * c'e' dove il sito e' pubblicato, oppure c'e' ma quella foto non la sa
 * leggere. Il 04/09/2026 sono state consegnate intere in produzione mentre in
 * locale, anche nella versione compilata, si rimpicciolivano: senza saperlo,
 * l'unico modo per capirlo era indovinare.
 *
 * Sono categorie, non messaggi: un messaggio di errore porta dentro i percorsi
 * del server, e questo valore finisce in un'intestazione che leggono tutti.
 */
export type MotivoFotoIntera = "modulo-assente" | "formato-illeggibile" | "altro";

export function motivoFotoIntera(errore: unknown): MotivoFotoIntera {
  const messaggio = errore instanceof Error ? errore.message : String(errore);

  if (/cannot find module|module_not_found|sharp module|no such file/i.test(messaggio)) {
    return "modulo-assente";
  }

  if (/unsupported image|image format|input file|bad seek|decoder/i.test(messaggio)) {
    return "formato-illeggibile";
  }

  return "altro";
}

/** I formati che legge chiunque: ogni browser, il compositore delle anteprime. */
const LEGGIBILE_DA_TUTTI = /^image\/(jpeg|jpg|png)\b/i;

/**
 * Se una foto va passata dalla libreria prima di consegnarla.
 *
 * Quando e' chiesta una misura, sempre. Senza misura, solo quando chi chiede
 * non legge il webp e la foto non e' in un formato che legge chiunque.
 *
 * **Perche' il secondo caso.** Il 25/09/2026 la copia delle foto nel nostro
 * archivio ha salvato in webp 692 foto su 2.016: le chiedeva dicendo di
 * accettare il webp, e la rete di DealerK le convertiva. L'anteprima social
 * chiede la foto senza misura e sa leggere solo JPEG e PNG: 177 auto in
 * vetrina su 265 con la copertina copiata avevano l'anteprima senza foto --
 * visto aprendo quella della Hyundai Bayon di Autogepy, solo testo, mentre una
 * copertina ancora su DealerK l'aveva.
 */
export function vaTrasformata(richiesta: { larghezza: number | null; webp: boolean; tipo: string }) {
  if (richiesta.larghezza) return true;
  return !richiesta.webp && !LEGGIBILE_DA_TUTTI.test(richiesta.tipo);
}

/**
 * Prepara la foto da consegnare: la rimpicciolisce se e' chiesta una misura, e
 * la porta in un formato che chi chiede sa leggere. Restituisce anche il tipo,
 * perche' puo' non essere quello di partenza.
 *
 * - chi legge il webp riceve webp;
 * - chi non lo legge riceve JPEG e PNG come sono arrivati, e ogni altro
 *   formato -- webp, avif -- convertito in JPEG. Fino al 25/09/2026 riceveva
 *   "il formato di partenza", che andava bene finche' le partenze erano tutte
 *   JPEG: con le foto copiate in webp gli arrivava un webp.
 *
 * Solleva un errore sui formati che la libreria non sa leggere: chi la chiama
 * serve allora la foto come e' arrivata, perche' l'originale intero e'
 * comunque meglio di un buco nella pagina.
 */
export async function rimpicciolisciFoto(
  buffer: Buffer,
  larghezza: number | null,
  qualita: number,
  inWebp: boolean,
): Promise<{ corpo: Buffer; tipo: string }> {
  const { default: sharp } = await import("sharp");

  // Le foto scattate col telefono portano l'orientamento in una nota a parte
  // invece che nei pixel: senza questa riga, ridimensionandole arriverebbero
  // coricate.
  let trasformazione = sharp(buffer, { failOn: "none" }).rotate();
  if (larghezza) {
    // "withoutEnlargement" perche' la srcset chiede anche misure piu' grandi
    // dell'originale: ingrandire una foto non aggiunge dettaglio, aggiunge
    // soltanto peso da scaricare.
    trasformazione = trasformazione.resize({ width: larghezza, withoutEnlargement: true });
  }

  if (inWebp) return { corpo: await trasformazione.webp({ quality: qualita }).toBuffer(), tipo: "image/webp" };

  // JPEG e PNG escono nel loro formato, esattamente come prima.
  const { format } = await sharp(buffer, { failOn: "none" }).metadata();
  if (format === "jpeg" || format === "png") return { corpo: await trasformazione.toBuffer(), tipo: `image/${format}` };

  // Webp, avif e il resto: un JPEG, su fondo bianco dove l'immagine era
  // trasparente -- il JPEG la trasparenza non la conosce.
  return {
    corpo: await trasformazione.flatten({ background: "#ffffff" }).jpeg({ quality: qualita }).toBuffer(),
    tipo: "image/jpeg",
  };
}
