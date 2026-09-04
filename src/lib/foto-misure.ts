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
 * si tiene il formato di partenza: il compositore delle anteprime social legge
 * soltanto JPEG e PNG, e servirgli webp gli faceva sollevare "Unsupported
 * image type" -- cioe' un errore al posto dell'anteprima.
 */
export function accettaWebp(intestazioneAccept: string | null | undefined) {
  return /image\/webp/i.test(String(intestazioneAccept ?? ""));
}

/**
 * Rimpicciolisce la foto prima di consegnarla.
 *
 * Solleva un errore sui formati che la libreria non sa leggere: chi la chiama
 * serve allora la foto come e' arrivata, perche' l'originale intero e'
 * comunque meglio di un buco nella pagina.
 */
export async function rimpicciolisciFoto(
  buffer: Buffer,
  larghezza: number,
  qualita: number,
  inWebp: boolean,
) {
  const { default: sharp } = await import("sharp");

  const trasformazione = sharp(buffer, { failOn: "none" })
    // Le foto scattate col telefono portano l'orientamento in una nota a
    // parte invece che nei pixel: senza questa riga, ridimensionandole
    // arriverebbero coricate.
    .rotate()
    // "withoutEnlargement" perche' la srcset chiede anche misure piu' grandi
    // dell'originale: ingrandire una foto non aggiunge dettaglio, aggiunge
    // soltanto peso da scaricare.
    .resize({ width: larghezza, withoutEnlargement: true });

  return inWebp ? trasformazione.webp({ quality: qualita }).toBuffer() : trasformazione.toBuffer();
}
