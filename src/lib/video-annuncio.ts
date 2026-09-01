/**
 * Il video dell'annuncio: un collegamento a YouTube, non un file caricato.
 *
 * Chiesto dal titolare il 01/09/2026, con la strada scelta fra le due
 * possibili. Il file caricato sarebbe costato spazio e soprattutto traffico --
 * un video di un minuto girato col telefono pesa 80-150 MB, e i 250 GB di
 * traffico compresi si esauriscono in circa duemila visualizzazioni al mese --
 * e avrebbe richiesto una conversione che non abbiamo: il verticale in 4K che
 * arriva dal telefono, servito com'e', su rete mobile si blocca.
 *
 * YouTube risolve gratis compressione, streaming adattivo e banda, e i video
 * restano sul canale del concessionario, dove gli portano visite anche da
 * fuori.
 *
 * **Si accetta solo YouTube, e non e' pigrizia.** Il sito blocca ogni
 * contenuto esterno (`default-src 'self'` in `src/proxy.ts`); per mostrare il
 * riquadro si apre un permesso, e quel permesso vale per il dominio che si
 * scrive li'. Accettare qualunque indirizzo significherebbe aprirlo a
 * chiunque, e un indirizzo che non corrisponde a quel permesso darebbe un
 * riquadro bianco senza spiegazione. Meglio dirlo al concessionario mentre
 * incolla.
 */

/** Il dominio a cui la Content-Security-Policy apre il riquadro. */
export const DOMINIO_VIDEO = "https://www.youtube-nocookie.com";

/**
 * L'identificativo del video dentro un indirizzo YouTube, in tutte le forme
 * in cui un concessionario lo puo' incollare.
 *
 * Torna null quando l'indirizzo non e' di YouTube o non contiene nessun
 * video: e' la condizione che il modulo mostra come errore, invece di salvare
 * un collegamento che poi non si apre.
 */
export function identificativoVideo(indirizzo: string | null | undefined): string | null {
  const pulito = String(indirizzo ?? "").trim();
  if (!pulito) return null;

  let url: URL;
  try {
    url = new URL(pulito.startsWith("http") ? pulito : `https://${pulito}`);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");

  // youtu.be/ID -- il collegamento che il telefono produce con "Condividi"
  if (host === "youtu.be") {
    return normalizzaIdentificativo(url.pathname.slice(1));
  }

  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;

  // youtube.com/watch?v=ID -- l'indirizzo della barra del browser
  const daParametro = url.searchParams.get("v");
  if (daParametro) return normalizzaIdentificativo(daParametro);

  // youtube.com/embed/ID, /shorts/ID, /live/ID
  const pezzi = url.pathname.split("/").filter(Boolean);
  if (pezzi.length >= 2 && ["embed", "shorts", "live", "v"].includes(pezzi[0])) {
    return normalizzaIdentificativo(pezzi[1]);
  }

  return null;
}

/**
 * Un identificativo YouTube e' fatto di undici caratteri fra lettere, cifre,
 * trattino e trattino basso. Controllarlo serve a non costruire un riquadro
 * intorno a qualcosa che YouTube non riconoscerebbe.
 */
function normalizzaIdentificativo(grezzo: string): string | null {
  const pulito = grezzo.trim();
  return /^[A-Za-z0-9_-]{11}$/.test(pulito) ? pulito : null;
}

/**
 * L'indirizzo da mettere nel riquadro.
 *
 * Si usa il dominio senza cookie: il visitatore non viene profilato da
 * YouTube finche' non preme play, ed e' la scelta coerente con il resto della
 * piattaforma, dove le misurazioni partono solo dopo il consenso.
 *
 * `rel=0` limita i video suggeriti a quelli dello stesso canale: senza,
 * a fine video comparirebbero le automobili di un concorrente dentro la
 * nostra pagina.
 */
export function indirizzoDelRiquadro(indirizzo: string | null | undefined): string | null {
  const id = identificativoVideo(indirizzo);
  return id ? `${DOMINIO_VIDEO}/embed/${id}?rel=0` : null;
}

/** L'indirizzo da salvare: normalizzato, cosi' due forme diverse diventano una. */
export function indirizzoDaSalvare(indirizzo: string | null | undefined): string | null {
  const id = identificativoVideo(indirizzo);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

/** Quello che si legge sotto il campo quando l'indirizzo non va bene. */
export const AVVISO_VIDEO_NON_VALIDO =
  "Questo non sembra un collegamento a un video YouTube. Copia l'indirizzo dalla barra del browser, oppure usa Condividi sull'app.";
