/**
 * Andare a prendere le pagine sul sito della concessionaria.
 *
 * Sta a se' perche' lo usano in due: l'importazione che il concessionario
 * lancia a mano e la sincronizzazione che gira di notte. Erano dentro
 * l'endpoint dell'importazione, e la sincronizzazione avrebbe dovuto
 * riscriverle -- due copie della stessa attesa e degli stessi tentativi, che
 * col tempo divergono.
 *
 * Qui dentro c'e' solo la rete: chi legge cosa c'e' scritto nelle pagine sta
 * in "dealer-site-import", che non tocca ne' rete ne' database.
 */

const SITEMAP_USATO = "auto_usate_0-sitemap.xml";

// Il sito della concessionaria non e' un fornitore su cui contare: interrogato
// in fretta smette di rispondere. Misurato sul sito vero -- leggendo 154
// schede di fila ventidue tornavano vuote; rilette con calma c'erano tutte.
export const PAUSA_FRA_SCHEDE_MS = 400;
const TENTATIVI_PER_SCHEDA = 2;
const TIMEOUT_SCHEDA_MS = 15000;
const PAUSA_FRA_TENTATIVI_MS = 800;

import { parseDealerStockSitemap, type DealerSiteEntry } from "@/lib/dealer-site-import";

/**
 * Il solo nome del sito, senza percorsi ne' parametri.
 *
 * Gli indirizzi veri li costruiamo noi: cosi' questa funzione non si puo'
 * usare per far leggere al server un indirizzo qualsiasi.
 */
export function normalizzaSitoConcessionaria(value: unknown) {
  const grezzo = String(value ?? "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!grezzo || /\s/.test(grezzo)) return null;

  const host = grezzo.split("/")[0].toLowerCase();
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host.replace(/^www\./, "") : null;
}

export async function leggiPagina(url: string, tentativi = TENTATIVI_PER_SCHEDA): Promise<string | null> {
  for (let i = 0; i < tentativi; i += 1) {
    try {
      const risposta = await fetch(url, {
        headers: { "User-Agent": "KeyAuto/1.0 (+https://www.keyauto.it)" },
        signal: AbortSignal.timeout(TIMEOUT_SCHEDA_MS),
      });
      if (risposta.ok) return await risposta.text();
    } catch {
      // Si ritenta: vedi la nota sulla pausa qui sopra.
    }
    if (i + 1 < tentativi) await new Promise((r) => setTimeout(r, PAUSA_FRA_TENTATIVI_MS));
  }
  return null;
}

/**
 * L'elenco di cio' che il sito dichiara adesso.
 *
 * Restituisce null quando la lettura non e' riuscita, e un elenco vuoto solo
 * se il sito ha davvero risposto senza veicoli. La distinzione non e'
 * pedante: chi allinea lo stock, davanti a null, non deve toccare niente.
 */
export async function elencoStock(host: string): Promise<DealerSiteEntry[] | null> {
  const xml = await leggiPagina(`https://www.${host}/${SITEMAP_USATO}`);
  if (!xml) return null;
  return parseDealerStockSitemap(xml, host);
}
