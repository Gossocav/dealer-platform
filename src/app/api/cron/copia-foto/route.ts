import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { caricaTutto } from "@/lib/carica-tutto";
import { leggiRisposta, promemoriaAppuntamento, serverDellaFoto, type FotoInCoda, type RisultatoTentativo } from "@/lib/copia-foto";
import { eseguiGiro } from "@/lib/copia-foto-giro";
import { SOGLIE_COPIA_FOTO } from "@/lib/copia-foto-soglie";
import { normalizzaMisuraFoto } from "@/lib/dealer-site-import";
import { chiaveDellaFoto, eFotoEsterna } from "@/lib/identita-foto";
import { isMarketplaceVehiclePublishable } from "@/lib/public-marketplace";
import { segnalaErrore } from "@/lib/segnala-errore";
import { fetchWithSsrfProtection, IndirizzoNonAmmesso } from "@/lib/ssrf-protection";

/**
 * La copia delle foto nel nostro archivio: una chiamata, un giro.
 *
 * Il perche' e le regole stanno in `supabase/MIGRAZIONI.md`, "Le foto stanno
 * su un server non nostro"; le regole in codice in `src/lib/copia-foto.ts` e
 * `src/lib/copia-foto-giro.ts`, dove si provano senza rete. Qui ci sono solo
 * le operazioni vere: leggere la coda, scaricare dall'origine, salvare
 * nell'archivio, scrivere le righe.
 *
 * Tre cose che qui dentro non si fanno, e il perche':
 *
 * - **non si scarica attraverso `/api/image-proxy`**: il proxy trasforma ogni
 *   fallimento in un 404, e la regola 2 ("solo 404 e 410 vogliono dire non
 *   esiste") diventerebbe cieca;
 * - **non si scrive una riga se l'origine e' cambiata** nel frattempo: la
 *   sincronizzazione puo' aver sostituito la foto mentre la copiavamo;
 * - **non si dichiara morta nessuna foto** finche' `morteAbilitate` e' spento:
 *   serve prima la regola che le nasconde al pubblico.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Il tempo del giro resta sotto i 60 secondi della funzione, con margine per
// le sentinelle e le scritture di fine giro.
const TEMPO_DEL_GIRO_MS = 40_000;
const TEMPO_PER_FOTO_MS = 15_000;
const BYTE_MASSIMI = 10 * 1024 * 1024;
const USER_AGENT = "KeyAuto/1.0 (+https://www.keyauto.it)";

type ApiSupabaseClient = SupabaseClient;

/** Come la sincronizzazione: chi chiama questa rotta scrive con la chiave di servizio. */
function autorizzato(request: Request): boolean {
  const segreto = process.env.CRON_SECRET;
  if (!segreto) return false;
  if (request.headers.get("authorization") === `Bearer ${segreto}`) return true;
  return request.headers.get("x-cron-secret") === segreto;
}

/** L'indirizzo con un parametro casuale: la richiesta arriva all'origine, non alla memoria di Cloudflare. */
function fuoriDallaMemoria(url: string) {
  return `${url}${url.includes("?") ? "&" : "?"}kv=${randomUUID().slice(0, 8)}`;
}

/**
 * Si chiedono JPEG e PNG, non webp ne' avif.
 *
 * Fino al 25/09/2026 qui c'era "image/avif,image/webp,...", e la rete di
 * DealerK (Cloudflare) rispondeva convertendo: il primo giro ha salvato in webp
 * 692 foto su 2.016, e 177 delle 265 copertine in vetrina. Il compositore
 * delle anteprime social legge solo JPEG e PNG, e quelle auto avevano
 * l'anteprima senza foto. La copia serve a non dipendere da DealerK: deve
 * tenere un formato che legge chiunque.
 *
 * Non e' comunque il file originale, e non va scritto che lo sia: Cloudflare
 * ricomprime anche i JPEG (`cf-polished: ok, orig_size=...`, misurato quel
 * giorno: 163 KB consegnati per un originale di 183). E' lo stesso formato,
 * non gli stessi byte.
 */
const ACCETTA = "image/jpeg,image/png;q=0.9,image/*;q=0.8";

async function chiedi(url: string, metodo: "GET" | "HEAD" = "GET") {
  return fetchWithSsrfProtection(url, {
    method: metodo,
    headers: { "User-Agent": USER_AGENT, Accept: ACCETTA },
    signal: AbortSignal.timeout(TEMPO_PER_FOTO_MS),
    cache: "no-store",
  });
}

function estensione(tipo: string) {
  if (/png/i.test(tipo)) return "png";
  if (/webp/i.test(tipo)) return "webp";
  // Un avif chiamato ".jpg" sarebbe un file che dice di essere un'altra cosa.
  if (/avif/i.test(tipo)) return "avif";
  return "jpg";
}

/**
 * La rete per la porta che nessuno ha contato: chiunque abbia scritto una foto
 * esterna senza origine, la sua foto entra in coda lo stesso. La stessa
 * condizione della migration del 25/09/2026 (`eFotoEsterna`).
 */
async function riempiOrigini(supabase: ApiSupabaseClient) {
  const { righe, error } = await caricaTutto<{ id: string; image_url: string }>((da, a) =>
    supabase.from("vehicle_images").select("id, image_url").is("origine_url", null).ilike("image_url", "http%").order("id").range(da, a),
  );
  if (error) return { riempite: 0, errore: error.message };
  let riempite = 0;
  for (const riga of righe.filter((r) => eFotoEsterna(r.image_url))) {
    const { error: scrittura } = await supabase.from("vehicle_images").update({ origine_url: riga.image_url }).eq("id", riga.id).is("origine_url", null);
    if (!scrittura) riempite += 1;
  }
  return { riempite, errore: null };
}

type VeicoloDellaFoto = { published: boolean | null; status: string | null; import_missing_since: string | null; dealers: { status: string | null } | null };

type RigaCoda = Omit<FotoInCoda, "inVetrina" | "uscitaDalSito"> & {
  // PostgREST consegna l'auto collegata come oggetto; i tipi della libreria
  // la dichiarano come elenco. Si accettano tutte e due le forme.
  vehicles: VeicoloDellaFoto | VeicoloDellaFoto[] | null;
};

async function leggiCoda(supabase: ApiSupabaseClient) {
  return caricaTutto<RigaCoda>((da, a) =>
    supabase
      .from("vehicle_images")
      .select(
        "id, vehicle_id, dealer_id, image_url, origine_url, position, is_cover, copia_esito, copia_tentativi, copia_primo_tentativo, copia_ultimo_tentativo, copia_primo_non_esiste, vehicles!inner(published, status, import_missing_since, dealers(status))",
      )
      .not("origine_url", "is", null)
      .or("copia_esito.is.null,copia_esito.eq.non-riuscita")
      // Un ordine stabile serve a caricaTutto: senza, due blocchi possono
      // consegnare due volte la stessa riga e saltarne un'altra.
      .order("id")
      .range(da, a) as unknown as PromiseLike<{ data: RigaCoda[] | null; error: { message: string } | null }>,
  );
}

/** Carica sharp una volta: se manca, e' un guasto del programma, non delle foto. */
async function caricaSharp() {
  const { default: sharp } = await import("sharp");
  return sharp;
}

async function handle(request: Request) {
  if (!autorizzato(request)) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chiave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !chiave) {
    return NextResponse.json({ error: "Configurazione del server incompleta." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, chiave, { auth: { persistSession: false, autoRefreshToken: false } }) as ApiSupabaseClient;

  const corpo = (await request.json().catch(() => null)) as { iniziatoIl?: string } | null;
  const iniziatoIl = corpo?.iniziatoIl && !Number.isNaN(Date.parse(corpo.iniziatoIl)) ? new Date(corpo.iniziatoIl) : null;
  const adesso = new Date();
  const scadenza = Date.now() + TEMPO_DEL_GIRO_MS;

  let sharp: Awaited<ReturnType<typeof caricaSharp>>;
  try {
    sharp = await caricaSharp();
  } catch (errore) {
    // Senza la libreria delle immagini ogni foto risulterebbe illeggibile e il
    // giro direbbe "non era la foto" 4.825 volte. E' un guasto nostro, e si dice.
    segnalaErrore("copia-foto: sharp non disponibile", errore);
    return NextResponse.json({ error: "La libreria delle immagini non si carica: nessuna foto provata." }, { status: 500 });
  }

  const origini = await riempiOrigini(supabase);

  const { righe, troncato, error } = await leggiCoda(supabase);
  if (error) {
    // Una coda non letta non e' una coda vuota.
    return NextResponse.json({ error: `Coda non letta: ${error.message}` }, { status: 500 });
  }

  const coda: FotoInCoda[] = righe.map(({ vehicles, ...riga }) => {
    const veicolo = Array.isArray(vehicles) ? vehicles[0] : vehicles;
    return {
      ...riga,
      copia_tentativi: Number(riga.copia_tentativi ?? 0),
      inVetrina: isMarketplaceVehiclePublishable({
        published: veicolo?.published,
        status: veicolo?.status,
        dealerStatus: veicolo?.dealers?.status ?? null,
      }),
      uscitaDalSito: Boolean(veicolo?.import_missing_since),
    };
  });

  const esito = await eseguiGiro(
    coda,
    {
      scaduto: () => Date.now() > scadenza,
      pausa: () => new Promise((r) => setTimeout(r, SOGLIE_COPIA_FOTO.pausaFraRichiesteMs)),

      copia: async (f): Promise<RisultatoTentativo | { tipo: "archivio"; motivo: string }> => {
        const indirizzo = normalizzaMisuraFoto(f.origine_url);
        let risposta: Response;
        try {
          risposta = await chiedi(indirizzo);
        } catch (errore) {
          if (errore instanceof IndirizzoNonAmmesso) return { tipo: "non-raggiunta", motivo: "indirizzo rifiutato dalla protezione di rete" };
          return { tipo: "non-raggiunta", motivo: errore instanceof Error ? errore.name : "rete" };
        }

        let lettura = leggiRisposta({ stato: risposta.status, retryAfter: risposta.headers.has("retry-after"), mitigata: risposta.headers.has("cf-mitigated") });

        if (lettura === "non-esiste") {
          // Cloudflare tiene in memoria anche un 404: prima di crederci si
          // chiede all'origine, con un parametro casuale.
          await risposta.body?.cancel().catch(() => {});
          try {
            risposta = await chiedi(fuoriDallaMemoria(indirizzo));
          } catch {
            return { tipo: "non-raggiunta", motivo: "404 non riconfermato: rete" };
          }
          lettura = leggiRisposta({ stato: risposta.status, retryAfter: risposta.headers.has("retry-after"), mitigata: risposta.headers.has("cf-mitigated") });
          if (lettura === "non-esiste") return { tipo: "non-esiste", stato: risposta.status };
          if (lettura !== "da-verificare") return { tipo: "non-raggiunta", motivo: `404 non riconfermato (${risposta.status})` };
        }
        if (lettura === "fermati") {
          await risposta.body?.cancel().catch(() => {});
          return { tipo: "fermati", stato: risposta.status };
        }
        if (lettura === "non-raggiunta") {
          await risposta.body?.cancel().catch(() => {});
          return { tipo: "non-raggiunta", motivo: `http ${risposta.status}` };
        }

        // Che sia davvero la foto: stesso percorso dopo i rimbalzi, un'immagine
        // che si decodifica. Un 200 con un segnaposto "hotlink vietato" non e'
        // una copia: con la copia diventerebbe definitivo. La larghezza no:
        // vedi `originiPerSegnaposto` in copia-foto-soglie.
        if (risposta.url && chiaveDellaFoto(risposta.url) !== chiaveDellaFoto(indirizzo)) {
          await risposta.body?.cancel().catch(() => {});
          return { tipo: "non-era-la-foto", motivo: "rimbalzo verso un altro indirizzo" };
        }
        const tipo = risposta.headers.get("content-type") ?? "";
        if (!/^image\//i.test(tipo)) {
          await risposta.body?.cancel().catch(() => {});
          return { tipo: "non-era-la-foto", motivo: `non e' un'immagine (${tipo || "senza tipo"})` };
        }
        const byte = Buffer.from(await risposta.arrayBuffer());
        if (byte.length === 0 || byte.length > BYTE_MASSIMI) return { tipo: "non-era-la-foto", motivo: `peso ${byte.length} byte` };

        let larghezza = 0;
        try {
          larghezza = (await sharp(byte, { failOn: "none" }).metadata()).width ?? 0;
        } catch {
          return { tipo: "non-era-la-foto", motivo: "immagine illeggibile" };
        }
        if (larghezza <= 0) return { tipo: "non-era-la-foto", motivo: "immagine senza dimensioni" };

        const sha256 = createHash("sha256").update(byte).digest("hex");

        // La stessa impronta su tante origini diverse dello stesso server e' un
        // segnaposto, non una foto.
        const host = serverDellaFoto(f.origine_url);
        const { data: stesse } = await supabase
          .from("vehicle_images")
          .select("origine_url")
          .eq("copia_sha256", sha256)
          .ilike("origine_url", `https://${host}/%`)
          .neq("origine_url", f.origine_url)
          .limit(20);
        const altreOrigini = new Set((stesse ?? []).map((r: { origine_url: string }) => r.origine_url));
        if (altreOrigini.size >= SOGLIE_COPIA_FOTO.originiPerSegnaposto - 1) {
          return { tipo: "non-era-la-foto", motivo: `la stessa immagine gia' su ${altreOrigini.size} altre origini: un segnaposto` };
        }

        const percorso = `${f.dealer_id}/${f.vehicle_id}/${sha256}.${estensione(tipo)}`;
        const { error: salvataggio } = await supabase.storage.from("vehicle-images").upload(percorso, byte, { contentType: tipo, upsert: true });
        if (salvataggio) return { tipo: "archivio", motivo: salvataggio.message };

        return { tipo: "copiata", sha256, byte: byte.length, percorso };
      },

      segnaCopiata: async (f, copia, istante) => {
        const { data, error: scrittura } = await supabase
          .from("vehicle_images")
          .update({
            image_url: copia.percorso,
            copia_esito: "copiata",
            copia_sha256: copia.sha256,
            copia_byte: copia.byte,
            copia_tentativi: f.copia_tentativi + 1,
            copia_primo_tentativo: f.copia_primo_tentativo ?? istante.toISOString(),
            copia_ultimo_tentativo: istante.toISOString(),
            copia_ultimo_motivo: "200",
          })
          .eq("id", f.id)
          .eq("origine_url", f.origine_url)
          .or("copia_esito.is.null,copia_esito.eq.non-riuscita")
          .select("id");
        if (scrittura) {
          segnalaErrore("copia-foto: riga della copia non scritta", scrittura, { id: f.id });
          return false;
        }
        return (data ?? []).length > 0;
      },

      scrivi: async (f, valori) => {
        const { error: scrittura } = await supabase
          .from("vehicle_images")
          .update(valori)
          .eq("id", f.id)
          .eq("origine_url", f.origine_url)
          .or("copia_esito.is.null,copia_esito.eq.non-riuscita");
        if (scrittura) segnalaErrore("copia-foto: esito non scritto", scrittura, { id: f.id });
      },

      sentinelle: async (host) => {
        const { data } = await supabase
          .from("vehicle_images")
          .select("origine_url, vehicle_id, vehicles!inner(import_missing_since)")
          .eq("copia_esito", "copiata")
          .ilike("origine_url", `https://${host}/%`)
          .is("vehicles.import_missing_since", null)
          .limit(300);
        // Dieci auto diverse, non dieci foto della stessa auto.
        const perAuto = new Map<string, string>();
        for (const riga of (data ?? []) as Array<{ origine_url: string; vehicle_id: string }>) {
          if (!perAuto.has(riga.vehicle_id)) perAuto.set(riga.vehicle_id, riga.origine_url);
          if (perAuto.size >= SOGLIE_COPIA_FOTO.sentinelle) break;
        }
        return Promise.all(
          Array.from(perAuto.values()).map(async (origine) => {
            try {
              const r = await chiedi(fuoriDallaMemoria(normalizzaMisuraFoto(origine)), "HEAD");
              return { ok: r.ok && /^image\//i.test(r.headers.get("content-type") ?? ""), dallaMemoria: r.headers.get("cf-cache-status") === "HIT" };
            } catch {
              return { ok: false, dallaMemoria: false };
            }
          }),
        );
      },

      morteRecenti: async (host) => {
        const { count } = await supabase
          .from("vehicle_images")
          .select("id", { count: "exact", head: true })
          .eq("copia_esito", "sorgente-morta")
          .gte("copia_ultimo_tentativo", new Date(adesso.getTime() - 24 * 3600 * 1000).toISOString())
          .ilike("origine_url", `https://${host}/%`);
        // Un conto non letto non vuol dire zero morte: vuol dire tetto pieno.
        return count ?? SOGLIE_COPIA_FOTO.morteMassimeIn24Ore;
      },
    },
    { adesso, iniziatoIl },
  );

  const copiate = Object.values(esito.server).reduce((somma, s) => somma + s.copiate, 0);

  return NextResponse.json({
    iniziatoIl: iniziatoIl?.toISOString() ?? null,
    origini,
    coda: esito.coda,
    codaTroncata: troncato,
    provate: esito.provate,
    copiate,
    finitoIlTempo: esito.finitoIlTempo,
    // Un'altra chiamata serve solo se il tempo e' finito con foto ancora da provare.
    ancoraDaFare: esito.finitoIlTempo,
    server: esito.server,
    morteAbilitate: SOGLIE_COPIA_FOTO.morteAbilitate,
    promemoria: promemoriaAppuntamento(adesso, SOGLIE_COPIA_FOTO.dataVerifica),
  });
}

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (errore) {
    segnalaErrore("copia-foto: giro interrotto", errore);
    return NextResponse.json({ error: "Giro di copia interrotto da un errore inatteso." }, { status: 500 });
  }
}
