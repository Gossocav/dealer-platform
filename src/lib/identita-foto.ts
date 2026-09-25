/**
 * Quando due indirizzi sono la stessa fotografia.
 *
 * **Non e' l'indirizzo.** Per una foto DealerK l'indirizzo contiene la misura
 * (`/images/1600x0/2396/x.jpg`) e il dominio, e tutti e due cambiano senza che
 * la foto cambi. Il 22/08/2026 la misura e' passata da 800 a 1600 px per
 * decisione nostra, e il ripasso ha riscritto tutte le gallerie: con le foto
 * copiate nel nostro archivio, un confronto sull'indirizzo intero avrebbe
 * buttato via 3.233 copie e rimesso DealerK al loro posto -- cioe' esattamente
 * il guasto da cui la copia protegge (`supabase/MIGRAZIONI.md`, "Le foto stanno
 * su un server non nostro").
 *
 * L'identita' di una foto DealerK e' **la cartella e il nome del file**: la
 * stessa chiave che il lettore dei siti usa gia' per riconoscere una foto fra
 * le sue misure. La cartella resta dentro perche' due concessionarie possono
 * avere file con lo stesso nome.
 */

const PERCORSO_FOTO_DEALERK = "/dealer/datafiles/vehicle/images/";
const INDIRIZZO_COMPLETO = /^https?:\/\//i;

export function chiaveDellaFoto(indirizzo: string): string {
  const valore = String(indirizzo ?? "").trim();

  const [, dopo] = valore.split(PERCORSO_FOTO_DEALERK);
  if (dopo !== undefined) {
    // <misura>/<cartella>/<file>: la misura si toglie, il resto e' la foto.
    const pezzi = dopo.split(/[?#]/)[0].split("/").filter(Boolean);
    if (pezzi.length >= 3) return `dealerk:${pezzi.slice(1).join("/")}`;
  }

  if (INDIRIZZO_COMPLETO.test(valore)) {
    try {
      const url = new URL(valore);
      return `url:${url.host.toLowerCase()}${url.pathname}`;
    } catch {
      return `url:${valore}`;
    }
  }

  return `archivio:${valore.replace(/^\/+/, "")}`;
}

/**
 * Una foto che viene da fuori, e quindi ha un'origine da ricordare e da
 * copiare. La stessa condizione della migration del 25/09/2026
 * (`20260925100000_le_foto_ricordano_da_dove_vengono.sql`): un indirizzo
 * completo, che non sia del nostro archivio ne' del nostro sito.
 */
export function eFotoEsterna(indirizzo: string): boolean {
  const valore = String(indirizzo ?? "").trim();
  return (
    INDIRIZZO_COMPLETO.test(valore) &&
    !/^https?:\/\/[^/]*supabase\.co\//i.test(valore) &&
    !/^https?:\/\/([^/]*\.)?keyauto\.it\//i.test(valore)
  );
}
