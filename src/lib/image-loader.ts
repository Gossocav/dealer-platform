"use client";

/**
 * Chi decide l'indirizzo di ogni fotografia del sito.
 *
 * **Perche' esiste.** Le fotografie passavano dal servizio di
 * ridimensionamento di Vercel, che e' a consumo: il 04/09/2026 il pacchetto
 * compreso nel piano si e' esaurito e *tutte* le foto del sito -- home,
 * catalogo, ricerca, schede veicolo, pagine delle concessionarie -- hanno
 * smesso di comparire, con "Payment required" al posto dell'immagine. Non
 * era un guasto passeggero: una sola visita alla pagina di una concessionaria
 * con 235 auto consuma centinaia di ridimensionamenti, quindi il tetto si
 * riesaurirebbe comunque.
 *
 * Da qui in avanti le foto le serve `/api/image-proxy`, che sta sul nostro
 * server, ridimensiona da se' e non ha nessun tetto da esaurire.
 *
 * Questa funzione gira **anche nel browser** (Next la serializza per ogni
 * `<Image>`): niente lettura di variabili d'ambiente, niente accesso al
 * database, nessuna dipendenza dal server.
 */

const PERCORSO_PROXY = "/api/image-proxy";
const QUALITA_PREDEFINITA = 75;

export default function fotoDelSito({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}) {
  const misura = `w=${width}&q=${quality ?? QUALITA_PREDEFINITA}`;

  // Le foto importate dai siti delle concessionarie sono gia' incamminate sul
  // proxy da chi le ha lette dal database: qui resta solo da dirgli quanto
  // larga serve la copia. Il proxy ha sempre una parte interrogativa, quindi
  // si aggiunge con "&".
  if (src.startsWith(`${PERCORSO_PROXY}?`)) {
    return `${src}&${misura}`;
  }

  // Tutto il resto che vive altrove -- l'archivio Supabase con gli indirizzi
  // firmati, i loghi delle concessionarie -- ci passa da qui.
  if (/^https?:\/\//i.test(src)) {
    return `${PERCORSO_PROXY}?url=${encodeURIComponent(src)}&${misura}`;
  }

  // Un file del sito (un logo, un'icona) e un'immagine incorporata nella
  // pagina ("data:", "blob:") si servono come sono: sono gia' piccoli, e
  // farli rimbalzare sul proxy costerebbe una chiamata per guadagnare
  // niente.
  return src;
}
