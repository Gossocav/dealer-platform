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
import { publicSupabase } from "@/lib/public-marketplace";

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

   return resolveVehicleImageUrlByStoragePath(storagePath);
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

const resolveVehicleImageUrlByStoragePath = cache(async (storagePath: string) => {
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
