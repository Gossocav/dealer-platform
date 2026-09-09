/**
 * Gli indirizzi firmati delle fotografie. **Questo modulo sta sul server.**
 *
 * Qui vive `storageSigner`, che usa la chiave di servizio: quella che apre
 * tutto il database, senza nessuna regola per riga davanti.
 *
 * Fino al 06/09/2026 stava dentro `public-marketplace.ts`, con scritto sopra
 * "questo modulo lo usano soltanto pagine server: nessun componente del
 * browser lo importa". **Non era piu' vero**: sei componenti del gestionale
 * lo importavano, per prendersi funzioni innocue che stanno nello stesso
 * file (`caricaTutto`, `formattaImporto`, `giorniDiAttesa`).
 *
 * Nessun segreto e' mai uscito -- verificato sui 75 file compilati serviti al
 * browser, la chiave non compare -- perche' Next sostituisce con `undefined`
 * ogni variabile d'ambiente che non cominci per NEXT_PUBLIC_. Il pericolo era
 * un altro, e non si sarebbe visto arrivare: chi un giorno indaga perche'
 * `storageSigner` ripiega sempre sulla chiave pubblica, vede quella variabile
 * vuota nel browser e la rinomina `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`
 * per "farla funzionare", spedirebbe la chiave che apre tutto dentro ogni
 * pagina pubblica del sito. Senza errori, senza un test rosso.
 *
 * Adesso quella riga vive in un file che il browser non ha nessun motivo di
 * importare, e un test (`chiave-di-servizio-fuori-dal-browser.test.ts`)
 * percorre gli import a partire da ogni componente `"use client"` e fallisce
 * se qualcuno ci arriva.
 */

import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import { normalizzaMisuraFoto } from "@/lib/dealer-site-import";
import {
  isMarketplaceVehiclePublishable,
  logMarketplaceQueryError,
  publicSupabase,
} from "@/lib/public-marketplace";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!supabaseUrl) {
  throw new Error("Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL.");
}

export async function resolveVehicleImageUrl(rawValue?: string | null) {
  const value = String(rawValue ?? "").trim();
  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value) && !isSupabaseStorageUrl(value)) {
    // Come sopra: le foto importate quando la misura era piu' piccola
    // vengono chieste grandi lo stesso, senza toccare cio' che e' salvato.
    return `/api/image-proxy?url=${encodeURIComponent(normalizzaMisuraFoto(value))}`;
  }

  const storagePath = extractVehicleImagePath(value);

  if (!storagePath) {
    return null;
  }

  // L'indirizzo che finisce nella pagina: **stabile, non scade mai**.
  //
  // Qui prima si restituiva la firma vera, che dura un'ora. Funziona per chi
  // guarda -- apre la pagina e la foto e' li' -- ma non per un motore di
  // ricerca, che archivia l'indirizzo oggi e lo ripassa fra una settimana:
  // trova un 404, e impara che le nostre fotografie non sono affidabili.
  // L'indirizzo cambiava anche a ogni rigenerazione della pagina, quindi
  // Google non ne avrebbe mai visto due volte uno uguale.
  //
  // Adesso la pagina dichiara il *percorso* della foto e la firma se la
  // procura il proxy, al momento di servirla. Effetto secondario gradito: con
  // un indirizzo che non cambia, la copia sulla rete di distribuzione vale per
  // tutti invece che per un'ora e per una sola versione della pagina.
  return indirizzoStabileFoto(storagePath);
}

/** L'indirizzo pubblico e immutabile di una foto dell'archivio. */
export function indirizzoStabileFoto(storagePath: string) {
  return `/api/image-proxy?foto=${encodeURIComponent(storagePath)}`;
}

// The bucket-creation migration declares "vehicle-images" as public, but
// production's actual bucket is private (drifted from the migration --
// verified directly against the Storage API: `public: false`). getPublicUrl()
// alone builds a URL the browser can't actually load there ("Bucket not
// found"), which made the broken <img>'s alt text -- the vehicle's title --
// show up as visible text inside the photo box. createSignedUrl() works
// regardless of the bucket's public/private setting, so try that first and
// only fall back to the public URL if it fails.
/**
 * Chi firma gli indirizzi delle fotografie del marketplace.
 *
 * Firmava la chiave pubblica, e per farlo le serviva il permesso di leggere
 * l'archivio: lo stesso permesso che consentiva a chiunque, da internet, di
 * percorrere le cartelle dell'archivio e vedere come e' fatto dentro --
 * concessionaria, veicolo, nomi dei file. I file non si scaricavano, ma la
 * struttura era in chiaro.
 *
 * Adesso firma la chiave di servizio, che vive solo qui sul server (questo
 * modulo lo usano soltanto pagine server: nessun componente del browser lo
 * importa). Cosi' alla chiave pubblica si puo' togliere ogni accesso
 * all'archivio senza spegnere le foto del sito.
 */
const storageSigner = (() => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    // Senza chiave di servizio si resta com'era: meglio una firma fatta con
    // la chiave pubblica che un catalogo senza fotografie.
    return publicSupabase;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
})();

/**
 * La firma con cui si scaricano davvero i byte di una foto, valida un'ora.
 *
 * Non finisce piu' nelle pagine: se la procura il proxy delle immagini quando
 * deve servire la fotografia, cosi' l'indirizzo pubblico resta sempre lo
 * stesso e la firma nasce e muore dentro una singola richiesta.
 */
/** Cosa si e' potuto stabilire su una fotografia chiesta al proxy. */
export type EsitoControlloFoto = "pubblica" | "non-pubblica" | "non-lo-so";

/**
 * L'identificativo del veicolo, ricavato dal percorso della fotografia.
 *
 * Il percorso lo costruisce il pannello al caricamento
 * (`vehicle-editor-page.tsx`) nella forma `<utente>/<veicolo>/<file>`: il
 * veicolo e' li' dentro, quindi non serve cercarlo. Se un giorno la forma
 * cambiasse, qui si smette di riconoscerlo e la fotografia viene rifiutata --
 * rumorosamente, non in silenzio.
 */
function idVeicoloDalPercorso(percorso: string): string | null {
  const pezzi = percorso.split("/");
  if (pezzi.length < 3) return null;

  const forse = pezzi[1].trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(forse) ? forse : null;
}

/**
 * La fotografia appartiene a un annuncio che un visitatore puo' vedere?
 *
 * **Quale difetto chiude.** Dal 09/09/2026 il proxy firma un percorso invece
 * di ricevere un indirizzo gia' firmato (#292): serviva a dare a Google un
 * indirizzo immutabile, e su quello non si torna indietro. Ma firmava
 * **qualunque cosa** stesse nel secchio, senza guardare di chi fosse.
 *
 * La motivazione scritta allora -- "quel secchio contiene soltanto fotografie
 * di annunci gia' pubblici" -- e' stata verificata il 09/09/2026 e non era
 * vera. Nel secchio c'erano nove file di tre veicoli: uno pubblicato, uno **in
 * bozza** e uno **cancellato**. Provate dal sito pubblico senza credenziali,
 * le due che non dovevano uscire rispondevano `HTTP 200 image/jpeg`.
 *
 * La regola qui e' la stessa che decide se un'auto compare in vetrina
 * (`isMarketplaceVehiclePublishable`): veicolo pubblicato, stato pubblicabile,
 * concessionaria attiva. Non se ne scrive una seconda, altrimenti un giorno
 * le due direbbero cose diverse.
 *
 * **Il controllo non rallenta le pagine.** La risposta del proxy resta in
 * cache sulla rete di consegna per un mese, quindi questa lettura avviene una
 * volta per fotografia ogni mese, non a ogni visita. Ed e' una lettura per
 * chiave primaria.
 *
 * **Se il database non risponde si lascia passare** (`"non-lo-so"`), e va
 * detto invece che nascosto. Rifiutare a ogni singhiozzo del database
 * farebbe sparire *tutte* le fotografie del sito e farebbe registrare errori
 * ai motori di ricerca -- un danno certo e visibile, in cambio di una
 * protezione che comunque richiede di conoscere gia' un percorso fatto di
 * codici casuali. Chi chiama conserva la risposta per poco, cosi' una
 * decisione presa alla cieca non resta appesa per un mese.
 */
export const fotoDiUnAnnuncioPubblico = cache(async (storagePath: string): Promise<EsitoControlloFoto> => {
  const veicoloId = idVeicoloDalPercorso(storagePath);

  if (!veicoloId) {
    return "non-pubblica";
  }

  const esito = await publicSupabase
    .from("vehicles")
    .select("published, status, dealers!inner(status)")
    .eq("id", veicoloId)
    .maybeSingle<{ published: boolean | null; status: string | null; dealers: { status: string | null } | null }>();

  if (esito.error) {
    logMarketplaceQueryError("foto: controllo pubblicazione", esito.error);
    return "non-lo-so";
  }

  // Nessuna riga vuol dire due cose, e nessuna delle due autorizza: il
  // veicolo non esiste piu', oppure non e' visibile a un visitatore.
  if (!esito.data) {
    return "non-pubblica";
  }

  return isMarketplaceVehiclePublishable({
    published: esito.data.published,
    status: esito.data.status,
    dealerStatus: esito.data.dealers?.status ?? null,
  })
    ? "pubblica"
    : "non-pubblica";
});

export const firmaFotoVeicolo = cache(async (storagePath: string) => {
  if (!storagePath) {
    return null;
  }

  const { data: signedData, error: signedError } = await storageSigner.storage
    .from("vehicle-images")
    .createSignedUrl(storagePath, 60 * 60);

  if (!signedError && signedData?.signedUrl) {
    return signedData.signedUrl;
  }

  const { data: publicUrlData } = storageSigner.storage.from("vehicle-images").getPublicUrl(storagePath);
  return publicUrlData.publicUrl || null;
});

function extractVehicleImagePath(value: string) {
  if (!value) return null;

  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const parsed = new URL(value);
      const publicPrefix = "/storage/v1/object/public/vehicle-images/";
      const signedPrefix = "/storage/v1/object/sign/vehicle-images/";

      if (parsed.pathname.includes(publicPrefix)) {
        const path = parsed.pathname.split(publicPrefix)[1];
        return path ? decodeURIComponent(path) : null;
      }

      if (parsed.pathname.includes(signedPrefix)) {
        const path = parsed.pathname.split(signedPrefix)[1];
        return path ? decodeURIComponent(path) : null;
      }

      return null;
    } catch {
      return null;
    }
  }

  return value.replace(/^\/+/, "").replace(/^vehicle-images\//, "");
}

function isSupabaseStorageUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.hostname === "supabase.co" || parsed.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}
