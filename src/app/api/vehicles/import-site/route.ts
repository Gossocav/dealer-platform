import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { getDemoFeatureBlockReason, resolveDemoAccessContext } from "@/lib/demo-access";
import {
  parseDealerStockSitemap,
  parseDealerStockVehicle,
  type DealerSiteEntry,
  type DealerSiteVehicle,
} from "@/lib/dealer-site-import";
import { canonicalizeVehicleColorLabel } from "@/lib/vehicle-colors";
import { upsertVehicleImages } from "@/app/api/vehicles/import-feed/route";

/**
 * Importa lo stock usato dal sito che la concessionaria ha gia'.
 *
 * Due azioni distinte, e la distinzione conta: "analizza" guarda e non scrive
 * niente, "importa" scrive un lotto alla volta. Cosi' si vede cosa arriverebbe
 * prima che arrivi qualcosa.
 *
 * A lotti perche' leggere il sito di qualcun altro non e' istantaneo: qualche
 * secondo a scheda. Un lotto per richiesta sta dentro i limiti di tempo del
 * server, e fa vedere l'avanzamento invece di lasciare davanti a una
 * schermata ferma.
 */

const SITEMAP_USATO = "auto_usate_0-sitemap.xml";

// Il sito della concessionaria non e' un fornitore su cui contare: interrogato
// in fretta smette di rispondere. Misurato sul sito vero -- leggendo 154
// schede di fila ventidue tornavano vuote; rilette con calma c'erano tutte.
const PAUSA_FRA_SCHEDE_MS = 400;
const TENTATIVI_PER_SCHEDA = 2;
const TIMEOUT_SCHEDA_MS = 15000;
const MAX_LOTTO = 25;

// Senza i tipi generati dello schema il client inferisce "never" per i
// payload di inserimento: stessa dichiarazione usata dalla sincronizzazione
// da feed.
type ApiSupabaseClient = SupabaseClient;

type EsitoScheda = {
  sourceId: string;
  url: string;
  esito: "importato" | "aggiornato" | "saltato" | "lettura-fallita";
  motivo?: string;
  titolo?: string;
};

function normalizzaSito(value: unknown) {
  const grezzo = String(value ?? "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!grezzo || /\s/.test(grezzo)) return null;

  // Solo il nome del sito: niente percorsi, niente parametri. Gli indirizzi
  // veri li costruiamo noi, cosi' questa funzione non si puo' usare per far
  // leggere al server un indirizzo qualsiasi.
  const host = grezzo.split("/")[0].toLowerCase();
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host.replace(/^www\./, "") : null;
}

async function leggi(url: string, tentativi = TENTATIVI_PER_SCHEDA): Promise<string | null> {
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
    if (i + 1 < tentativi) await new Promise((r) => setTimeout(r, 800));
  }
  return null;
}

async function elencoStock(host: string): Promise<DealerSiteEntry[] | null> {
  const xml = await leggi(`https://www.${host}/${SITEMAP_USATO}`);
  if (!xml) return null;
  return parseDealerStockSitemap(xml);
}

function payloadVeicolo(v: DealerSiteVehicle, dealerId: string, host: string, status: "draft" | "published") {
  return {
    dealer_id: dealerId,
    brand: v.brand,
    model: v.model,
    // La versione non arriva separata dal titolo: meglio il titolo intero che
    // un troncamento inventato.
    version: v.name || null,
    price: v.price,
    mileage: v.mileage,
    fuel: v.fuel,
    transmission: v.transmission,
    doors: v.doors,
    seats: v.seats,
    color: canonicalizeVehicleColorLabel(v.color ?? "") || null,
    year: v.year,
    vehicle_condition: v.condition,
    vehicle_category: "Auto",
    description: v.description,
    status,
    published: status === "published",
    import_source: host,
    import_source_id: v.sourceId,
    updated_at: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      action?: string;
      site?: string;
      offset?: number;
      limit?: number;
      status?: string;
    } | null;

    const host = normalizzaSito(body?.site);
    if (!host) {
      return NextResponse.json({ error: "Indirizzo del sito non valido. Esempio: autogepy.it" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: "Configurazione Supabase incompleta." }, { status: 500 });
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }) as ApiSupabaseClient;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.id) {
      return NextResponse.json({ error: "Utente non autenticato." }, { status: 401 });
    }

    const dealerId = await resolveDealerIdFromTenantSources(supabase, user.id, {
      activeDealerId: String(request.headers.get("x-active-dealer-id") ?? "").trim() || null,
    });

    if (!dealerId) {
      return NextResponse.json({ error: "Dealer non associato al profilo utente." }, { status: 400 });
    }

    const voci = await elencoStock(host);
    if (!voci) {
      return NextResponse.json(
        { error: `Non siamo riusciti a leggere l'elenco veicoli di ${host}. Verifica l'indirizzo.` },
        { status: 502 },
      );
    }

    if (body?.action === "analyze") {
      return NextResponse.json({
        site: host,
        totale: voci.length,
        usate: voci.filter((v) => v.condition === "Usato").length,
        km0: voci.filter((v) => v.condition === "Km/0").length,
      });
    }

    if (body?.action !== "import") {
      return NextResponse.json({ error: "Azione non riconosciuta." }, { status: 400 });
    }

    const { count: vehicleCount } = await supabase
      .from("vehicles")
      .select("id", { count: "exact", head: true })
      .eq("dealer_id", dealerId);

    const demoContext = await resolveDemoAccessContext(supabase, dealerId, { vehicleCount: vehicleCount ?? 0 });
    const demoBlock = getDemoFeatureBlockReason(demoContext, "import");
    if (demoBlock) {
      return NextResponse.json({ error: demoBlock.message }, { status: 403 });
    }

    // Le bozze non consumano il tetto del piano, che conta solo i pubblicati:
    // e' il modo prudente di provare un caricamento grosso.
    const status = body?.status === "published" ? "published" : "draft";
    const offset = Math.max(0, Number(body?.offset ?? 0) || 0);
    const limit = Math.min(MAX_LOTTO, Math.max(1, Number(body?.limit ?? 5) || 5));

    // Il lotto si ricava dall'elenco vero letto adesso, non da quello che
    // manda il browser: cosi' nessuno puo' far leggere al server un indirizzo
    // a piacere.
    const lotto = voci.slice(offset, offset + limit);
    const esiti: EsitoScheda[] = [];

    for (const voce of lotto) {
      const html = await leggi(voce.url);

      if (!html) {
        // Non e' un veicolo che non c'e': e' una lettura andata male. La
        // distinzione sembra pedante e non lo e' -- quando ci sara' la
        // rimozione delle vendute, scambiare le due cose farebbe sparire dal
        // marketplace automobili perfettamente in vendita.
        esiti.push({ sourceId: voce.sourceId, url: voce.url, esito: "lettura-fallita" });
        continue;
      }

      const letto = parseDealerStockVehicle(html, voce);
      if (!letto.ok) {
        esiti.push({ sourceId: voce.sourceId, url: voce.url, esito: "saltato", motivo: letto.reason });
        await new Promise((r) => setTimeout(r, PAUSA_FRA_SCHEDE_MS));
        continue;
      }

      const veicolo = letto.vehicle;
      // Il client Supabase qui non ha i tipi generati dello schema: senza
      // questo, inserimento e aggiornamento non accettano nessun oggetto.
      // Stessa soluzione gia' usata dalla sincronizzazione da feed.
      const payload = payloadVeicolo(veicolo, dealerId, host, status) as Record<string, unknown>;

      const { data: esistente } = await supabase
        .from("vehicles")
        .select("id")
        .eq("dealer_id", dealerId)
        .eq("import_source", host)
        .eq("import_source_id", veicolo.sourceId)
        .limit(1)
        .maybeSingle<{ id: string }>();

      let vehicleId = esistente?.id ?? null;

      if (vehicleId) {
        const { error } = await supabase.from("vehicles").update(payload).eq("id", vehicleId).eq("dealer_id", dealerId);
        if (error) {
          esiti.push({ sourceId: veicolo.sourceId, url: voce.url, esito: "saltato", motivo: error.message });
          continue;
        }
        esiti.push({ sourceId: veicolo.sourceId, url: voce.url, esito: "aggiornato", titolo: veicolo.name });
      } else {
        const { data: inserito, error } = await supabase
          .from("vehicles")
          .insert(payload)
          .select("id")
          .maybeSingle<{ id: string }>();

        if (error || !inserito?.id) {
          esiti.push({
            sourceId: veicolo.sourceId,
            url: voce.url,
            esito: "saltato",
            motivo: error?.message ?? "inserimento non riuscito",
          });
          continue;
        }
        vehicleId = inserito.id;
        esiti.push({ sourceId: veicolo.sourceId, url: voce.url, esito: "importato", titolo: veicolo.name });
      }

      if (vehicleId && veicolo.images.length > 0) {
        await upsertVehicleImages(supabase, dealerId, vehicleId, veicolo.images);
      }

      await new Promise((r) => setTimeout(r, PAUSA_FRA_SCHEDE_MS));
    }

    return NextResponse.json({
      site: host,
      totale: voci.length,
      offset,
      elaborati: lotto.length,
      prossimoOffset: offset + lotto.length,
      finito: offset + lotto.length >= voci.length,
      esiti,
    });
  } catch (error) {
    console.error("import-site error", error);
    return NextResponse.json({ error: "Errore imprevisto durante l'importazione dal sito." }, { status: 500 });
  }
}
