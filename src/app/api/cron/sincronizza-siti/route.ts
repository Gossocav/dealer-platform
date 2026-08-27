import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { caricaTutto } from "@/lib/carica-tutto";
import { elencoStock, leggiPagina, PAUSA_FRA_SCHEDE_MS } from "@/lib/dealer-site-fetch";
import { parseDealerStockVehicle, type DealerSiteEntry } from "@/lib/dealer-site-import";
import {
  campiVeicoloRitrovato,
  campiVeicoloSparito,
  payloadDatiVeicolo,
  pianoRiconciliazione,
  type RigaImportata,
} from "@/lib/dealer-site-sync";

/**
 * La sincronizzazione che gira da sola, una volta al giorno, chiamata dal
 * lavoro notturno in .github/workflows/sincronizza-siti.yml.
 *
 * Prima di questa, lo stock importato si aggiornava soltanto se qualcuno
 * apriva il pannello e premeva un bottone: un'auto venduta restava in vetrina
 * per sempre, e un prezzo ritoccato sul sito della concessionaria restava
 * quello vecchio qui.
 *
 * Fa due cose, in quest'ordine, perche' la prima costa una richiesta sola e
 * la seconda molte:
 *
 * 1. **allinea** cio' che c'e' con cio' che il sito dichiara adesso: basta la
 *    sitemap, e vale per tutto lo stock di ogni concessionaria.
 * 2. **rilegge** le schede piu' vecchie, per ripassare prezzo, chilometri e
 *    il resto -- ma solo finche' c'e' tempo. Leggere il sito di qualcun altro
 *    e' lento, e su una funzione che deve concludersi in un minuto ci stanno
 *    poche decine di pagine: si prendono le meno recenti, cosi' a giri
 *    successivi passano tutte.
 *
 * Quello che **non** fa, di proposito: non importa le auto nuove che compaiono
 * sul sito. Importare consuma il tetto di annunci del piano e obbliga a
 * scegliere se pubblicarle o tenerle in bozza: sono decisioni del
 * concessionario, non di un lavoro notturno.
 *
 * E non tocca mai la pubblicazione dei veicoli che rilegge: quello che scrive
 * arriva da "payloadDatiVeicolo", dove "status" e "published" non esistono
 * proprio.
 */

export const maxDuration = 60;

// Si ferma prima del limite della funzione: meglio lasciare a meta' e
// riprendere domani dalle stesse schede, che essere interrotti a scrittura
// iniziata.
const BUDGET_MS = 45000;

// Quante schede rileggere al massimo per ogni sorgente in un giro solo. Il
// tempo e' comunque il vincolo vero; questo evita che una concessionaria
// grossa si prenda tutto il giro a scapito delle altre.
const MAX_SCHEDE_PER_SORGENTE = 25;

type ApiSupabaseClient = SupabaseClient;

type Sorgente = { dealer_id: string; import_source: string };

type EsitoSorgente = {
  sito: string;
  dealerId: string;
  nascoste: number;
  ripristinate: number;
  rilette: number;
  nota?: string;
  /** Le scritture non riuscite, con il motivo del database. */
  errori?: string[];
};

/**
 * Autorizza chi chiama con CRON_SECRET. Due modi, come per il cron delle demo:
 * "x-cron-secret: <segreto>", che manda il lavoro notturno di GitHub Actions
 * (.github/workflows/sincronizza-siti.yml), e "Authorization: Bearer
 * <segreto>" per lanciarlo a mano. Senza segreto configurato non si passa:
 * chi riesce a chiamare questo endpoint tocca lo stock di ogni
 * concessionaria, perche' scrive con la chiave di servizio.
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (request.headers.get("authorization") === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

/** Le coppie concessionaria + sito da cui e' arrivato qualcosa. */
async function sorgentiAttive(supabase: ApiSupabaseClient): Promise<Sorgente[]> {
  const { righe } = await caricaTutto<Sorgente>((da, a) =>
    supabase
      .from("vehicles")
      .select("dealer_id, import_source")
      .not("import_source", "is", null)
      .not("dealer_id", "is", null)
      .range(da, a),
  );

  const viste = new Map<string, Sorgente>();
  for (const riga of righe) {
    const chiave = `${riga.dealer_id}|${riga.import_source}`;
    if (!viste.has(chiave)) viste.set(chiave, riga);
  }

  return [...viste.values()];
}

async function allinea(
  supabase: ApiSupabaseClient,
  sorgente: Sorgente,
  idsSulSito: string[],
): Promise<{ nascoste: number; ripristinate: number; nota?: string }> {
  const { righe, error } = await caricaTutto<RigaImportata>((da, a) =>
    supabase
      .from("vehicles")
      .select("id, import_source_id, status, published, import_missing_since")
      .eq("dealer_id", sorgente.dealer_id)
      .eq("import_source", sorgente.import_source)
      .range(da, a),
  );

  if (error) {
    return { nascoste: 0, ripristinate: 0, nota: "archivio non letto" };
  }

  const esito = pianoRiconciliazione({ idsSulSito, righe });

  if (!esito.ok) {
    // Non toccare niente e dirlo: il silenzio somiglierebbe a "tutto bene".
    return {
      nascoste: 0,
      ripristinate: 0,
      nota:
        esito.motivo === "elenco-vuoto"
          ? "il sito non ha dichiarato nessun veicolo: niente toccato"
          : `sparite ${esito.assenti} su ${esito.totale}: troppe per essere vendite, niente toccato`,
    };
  }

  const adesso = new Date();
  const { daNascondere, daRipristinare } = esito.piano;

  if (daNascondere.length > 0) {
    await supabase
      .from("vehicles")
      .update(campiVeicoloSparito(adesso))
      .eq("dealer_id", sorgente.dealer_id)
      .in("id", daNascondere);
  }

  if (daRipristinare.length > 0) {
    await supabase
      .from("vehicles")
      .update(campiVeicoloRitrovato(adesso))
      .eq("dealer_id", sorgente.dealer_id)
      .in("id", daRipristinare);
  }

  return { nascoste: daNascondere.length, ripristinate: daRipristinare.length };
}

/**
 * Ripassa i dati delle schede meno recenti, finche' resta tempo.
 *
 * L'ordinamento per "import_synced_at" con i vuoti per primi e' quello che
 * garantisce il giro completo: chi viene riletta oggi finisce in fondo alla
 * fila, e domani tocca alle altre.
 */
async function rileggi(
  supabase: ApiSupabaseClient,
  sorgente: Sorgente,
  vociPerSourceId: Map<string, DealerSiteEntry>,
  scaduto: () => boolean,
): Promise<{ rilette: number; errori: string[] }> {
  const { data } = await supabase
    .from("vehicles")
    .select("id, import_source_id")
    .eq("dealer_id", sorgente.dealer_id)
    .eq("import_source", sorgente.import_source)
    .is("import_missing_since", null)
    .order("import_synced_at", { ascending: true, nullsFirst: true })
    .limit(MAX_SCHEDE_PER_SORGENTE);

  const daRileggere = (data ?? []) as Array<{ id: string; import_source_id: string | null }>;
  let rilette = 0;
  const errori: string[] = [];

  for (const riga of daRileggere) {
    if (scaduto()) break;

    // La voce della sitemap e non il solo indirizzo: da li' arriva anche la
    // condizione (usata o km 0), che sta nel percorso e non nella pagina.
    // Passandone una inventata, una km 0 riletta diventerebbe "Usato".
    const voce = vociPerSourceId.get(String(riga.import_source_id ?? ""));
    if (!voce) continue;

    const html = await leggiPagina(voce.url);
    const adesso = new Date().toISOString();

    if (!html) {
      // Lettura non riuscita: non e' un veicolo cambiato. Si lascia il dato
      // com'e' e non si segna la rilettura, cosi' domani riprova questa.
      await new Promise((r) => setTimeout(r, PAUSA_FRA_SCHEDE_MS));
      continue;
    }

    const letto = parseDealerStockVehicle(html, voce);

    // Anche una scheda che oggi non si lascia interpretare -- succede quando
    // il sito le toglie le fotografie -- va segnata come riletta: altrimenti
    // resterebbe in testa alla fila per sempre, bloccando le altre.
    const campi = letto.ok
      ? { ...payloadDatiVeicolo(letto.vehicle), import_synced_at: adesso, updated_at: adesso }
      : { import_synced_at: adesso };

    // L'esito si guarda, e si guarda anche **quante righe** ha toccato: una
    // scrittura rifiutata -- o che non trova la riga -- somiglia in tutto a
    // una sincronizzazione riuscita, ed e' il modo peggiore di accorgersene.
    const { data: toccate, error } = await supabase
      .from("vehicles")
      .update(campi)
      .eq("id", riga.id)
      .eq("dealer_id", sorgente.dealer_id)
      .select("id");

    if (error) {
      if (errori.length < 5) errori.push(`${riga.import_source_id}: ${error.message}`);
      continue;
    }

    if ((toccate ?? []).length === 0) {
      if (errori.length < 5) errori.push(`${riga.import_source_id}: nessuna riga aggiornata`);
      continue;
    }

    rilette += 1;
    await new Promise((r) => setTimeout(r, PAUSA_FRA_SCHEDE_MS));
  }

  return { rilette, errori };
}

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Accesso negato." }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRole) {
    return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
  }

  // Chiave di servizio perche' qui non c'e' nessuna sessione: gira di notte,
  // sul server, senza nessuno davanti allo schermo.
  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) as ApiSupabaseClient;

  const inizio = Date.now();
  const scaduto = () => Date.now() - inizio > BUDGET_MS;

  const sorgenti = await sorgentiAttive(supabase);
  const esiti: EsitoSorgente[] = [];

  for (const sorgente of sorgenti) {
    if (scaduto()) break;

    const voci = await elencoStock(sorgente.import_source);

    if (!voci) {
      esiti.push({
        sito: sorgente.import_source,
        dealerId: sorgente.dealer_id,
        nascoste: 0,
        ripristinate: 0,
        rilette: 0,
        nota: "sito non raggiungibile: niente toccato",
      });
      continue;
    }

    const allineamento = await allinea(
      supabase,
      sorgente,
      voci.map((voce) => voce.sourceId),
    );

    const vociPerSourceId = new Map(voci.map((voce) => [String(voce.sourceId), voce]));
    const rilettura = scaduto()
      ? { rilette: 0, errori: [] as string[] }
      : await rileggi(supabase, sorgente, vociPerSourceId, scaduto);

    esiti.push({
      sito: sorgente.import_source,
      dealerId: sorgente.dealer_id,
      nascoste: allineamento.nascoste,
      ripristinate: allineamento.ripristinate,
      rilette: rilettura.rilette,
      ...(allineamento.nota ? { nota: allineamento.nota } : {}),
      ...(rilettura.errori.length > 0 ? { errori: rilettura.errori } : {}),
    });
  }

  return NextResponse.json({
    sorgenti: sorgenti.length,
    esaminate: esiti.length,
    durataMs: Date.now() - inizio,
    esiti,
  });
}

// Il lavoro notturno di GitHub Actions chiama in GET.
export async function GET(request: Request) {
  return handle(request);
}

// Per lanciarla a mano quando serve.
export async function POST(request: Request) {
  return handle(request);
}
