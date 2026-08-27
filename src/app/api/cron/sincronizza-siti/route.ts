import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { caricaTutto } from "@/lib/carica-tutto";
import { elencoStock, leggiPagina, PAUSA_FRA_SCHEDE_MS } from "@/lib/dealer-site-fetch";
import { parseDealerStockVehicle, type DealerSiteEntry } from "@/lib/dealer-site-import";
import { sostituisciFoto } from "@/lib/dealer-site-photos";
import {
  campiVeicoloRitrovato,
  campiVeicoloSparito,
  payloadDatiVeicolo,
  pianoRiconciliazione,
  type RigaImportata,
} from "@/lib/dealer-site-sync";
import { getDemoFeatureBlockReason, resolveDemoAccessContext } from "@/lib/demo-access";

/**
 * KeyAuto deve rispecchiare il sito della concessionaria.
 *
 * Chiamata dal lavoro periodico in .github/workflows/sincronizza-siti.yml, che
 * la richiama piu' volte di fila finche' non risponde che non c'e' piu' niente
 * da fare: una sola chiamata ha meno di un minuto, e centocinquanta schede da
 * leggere non ci stanno.
 *
 * Tre cose, in quest'ordine, e l'ordine e' il punto:
 *
 * 1. **le sparizioni, per tutte le concessionarie.** Costano una richiesta
 *    l'una -- l'indice del sito -- e sono la cosa che si vede di piu': un'auto
 *    venduta in vetrina fa chiedere informazioni per qualcosa che non esiste
 *    piu'. Vanno fatte tutte prima di qualsiasi altra cosa, altrimenti la
 *    prima concessionaria si prende il tempo e la seconda resta indietro. E'
 *    successo davvero nella prima versione di questo file.
 * 2. **le auto nuove.** Sono quelle che mancano proprio: sul sito ci sono, qui
 *    no.
 * 3. **il ripasso di quelle che ci sono gia'**: prezzo, chilometri, foto.
 *
 * Il tempo che resta dopo il primo passo si divide in parti uguali fra le
 * concessionarie, cosi' nessuna puo' affamare le altre.
 *
 * Le auto nuove entrano **pubblicate**: se il concessionario le espone sul suo
 * sito, la sua intenzione e' che si vedano. Se il piano non ha piu' posto il
 * database rifiuta l'inserimento, e qui lo si riporta invece di ritentare
 * all'infinito.
 */

export const maxDuration = 60;

// Si ferma prima del limite della funzione: meglio lasciare a meta' -- tanto
// chi chiama richiama -- che essere interrotti a scrittura iniziata.
const BUDGET_MS = 45000;

// Una scheda riletta da meno di questo si considera fresca. Serve a far
// finire il giro: senza, il lavoro si richiamerebbe all'infinito perche'
// qualcosa da rileggere c'e' sempre.
const ORE_PRIMA_DI_RILEGGERE = 6;

// Quante schede per chiamata, per sorgente. Il tempo resta il vincolo vero:
// questo evita solo di chiedere al database righe che non si faranno in tempo.
const MAX_SCHEDE_PER_GIRO = 25;

// Sotto questa soglia non vale la pena iniziare un'altra scheda.
const TEMPO_MINIMO_PER_SCHEDA_MS = 3000;

type ApiSupabaseClient = SupabaseClient;

type Sorgente = { dealer_id: string; import_source: string };

type EsitoSorgente = {
  sito: string;
  dealerId: string;
  nascoste: number;
  ripristinate: number;
  importate: number;
  rilette: number;
  nota?: string;
  /** Le scritture non riuscite, con il motivo del database. */
  errori?: string[];
};

/**
 * Autorizza chi chiama con CRON_SECRET. Due modi, come per il cron delle demo:
 * "x-cron-secret: <segreto>", che manda il lavoro di GitHub Actions, e
 * "Authorization: Bearer <segreto>" per lanciarlo a mano. Senza segreto
 * configurato non si passa: chi riesce a chiamare questo endpoint tocca lo
 * stock di ogni concessionaria, perche' scrive con la chiave di servizio.
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

async function archivioDellaSorgente(supabase: ApiSupabaseClient, sorgente: Sorgente) {
  return caricaTutto<RigaImportata>((da, a) =>
    supabase
      .from("vehicles")
      .select("id, import_source_id, status, published, import_missing_since")
      .eq("dealer_id", sorgente.dealer_id)
      .eq("import_source", sorgente.import_source)
      .range(da, a),
  );
}

async function allinea(
  supabase: ApiSupabaseClient,
  sorgente: Sorgente,
  idsSulSito: string[],
  righe: RigaImportata[],
): Promise<{ nascoste: number; ripristinate: number; nota?: string }> {
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
 * Porta dentro le automobili che sul sito ci sono e qui no.
 *
 * Entrano pubblicate: se la concessionaria le espone sul suo sito, vuole che
 * si vedano. Il tetto di annunci del piano resta a fare da freno -- se non c'e'
 * piu' posto il database rifiuta, e si smette invece di ritentare per ognuna.
 */
async function importaNuove(
  supabase: ApiSupabaseClient,
  sorgente: Sorgente,
  nuove: DealerSiteEntry[],
  scaduto: () => boolean,
): Promise<{ importate: number; errori: string[]; restanti: number }> {
  const errori: string[] = [];
  let importate = 0;
  let esaminate = 0;

  for (const voce of nuove) {
    if (scaduto()) break;
    esaminate += 1;

    const html = await leggiPagina(voce.url);
    if (!html) {
      // Lettura non riuscita: non e' un veicolo che non va importato. Si
      // riprova alla prossima chiamata.
      esaminate -= 1;
      await new Promise((r) => setTimeout(r, PAUSA_FRA_SCHEDE_MS));
      continue;
    }

    const letto = parseDealerStockVehicle(html, voce);
    if (!letto.ok) {
      // Senza prezzo, senza foto, o e' un noleggio: sono gli stessi scarti
      // dell'importazione a mano, e non sono errori.
      await new Promise((r) => setTimeout(r, PAUSA_FRA_SCHEDE_MS));
      continue;
    }

    const adesso = new Date().toISOString();
    const { data: inserito, error } = await supabase
      .from("vehicles")
      .insert({
        ...payloadDatiVeicolo(letto.vehicle),
        dealer_id: sorgente.dealer_id,
        status: "published",
        published: true,
        import_source: sorgente.import_source,
        import_source_id: letto.vehicle.sourceId,
        import_synced_at: adesso,
        updated_at: adesso,
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error || !inserito?.id) {
      // Il tetto del piano si presenta cosi': se non c'e' piu' posto per una,
      // non ce n'e' per nessuna. Si smette e lo si dice.
      errori.push(`${letto.vehicle.sourceId}: ${error?.message ?? "inserimento non riuscito"}`);
      break;
    }

    if (letto.vehicle.images.length > 0) {
      await sostituisciFoto(supabase, sorgente.dealer_id, inserito.id, letto.vehicle.images);
    }

    importate += 1;
    await new Promise((r) => setTimeout(r, PAUSA_FRA_SCHEDE_MS));
  }

  return { importate, errori, restanti: Math.max(0, nuove.length - esaminate) };
}

/**
 * Ripassa prezzo, chilometri e fotografie delle schede meno recenti.
 *
 * L'ordinamento per "import_synced_at" con i vuoti per primi e' quello che
 * garantisce il giro completo: chi viene riletta adesso finisce in fondo alla
 * fila, e alla chiamata dopo tocca alle altre.
 */
async function rileggi(
  supabase: ApiSupabaseClient,
  sorgente: Sorgente,
  vociPerSourceId: Map<string, DealerSiteEntry>,
  scaduto: () => boolean,
): Promise<{ rilette: number; errori: string[]; restanti: boolean }> {
  const soglia = new Date(Date.now() - ORE_PRIMA_DI_RILEGGERE * 3600 * 1000).toISOString();

  const { data } = await supabase
    .from("vehicles")
    .select("id, import_source_id")
    .eq("dealer_id", sorgente.dealer_id)
    .eq("import_source", sorgente.import_source)
    .is("import_missing_since", null)
    .or(`import_synced_at.is.null,import_synced_at.lt.${soglia}`)
    .order("import_synced_at", { ascending: true, nullsFirst: true })
    .limit(MAX_SCHEDE_PER_GIRO);

  const daRileggere = (data ?? []) as Array<{ id: string; import_source_id: string | null }>;
  const errori: string[] = [];
  let rilette = 0;
  let fermata = false;

  for (const riga of daRileggere) {
    if (scaduto()) {
      fermata = true;
      break;
    }

    // La voce dell'indice e non il solo indirizzo: da li' arriva anche la
    // condizione (usata o km 0), che sta nel percorso e non nella pagina.
    // Passandone una inventata, una km 0 riletta diventerebbe "Usato".
    const voce = vociPerSourceId.get(String(riga.import_source_id ?? ""));
    if (!voce) continue;

    const html = await leggiPagina(voce.url);
    const adesso = new Date().toISOString();

    if (!html) {
      // Lettura non riuscita: non e' un veicolo cambiato. Si lascia il dato
      // com'e' e non si segna la rilettura, cosi' si riprova dopo.
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

    // Le fotografie seguono i dati: sul sito cambiano, e una galleria vecchia
    // e' visibile quanto un prezzo vecchio.
    if (letto.ok && letto.vehicle.images.length > 0) {
      await sostituisciFoto(supabase, sorgente.dealer_id, riga.id, letto.vehicle.images);
    }

    rilette += 1;
    await new Promise((r) => setTimeout(r, PAUSA_FRA_SCHEDE_MS));
  }

  // Ne restano se ci siamo fermati per tempo scaduto, o se il lotto era pieno
  // -- nel qual caso ce ne sono altre in coda.
  return { rilette, errori, restanti: fermata || daRileggere.length === MAX_SCHEDE_PER_GIRO };
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

  // Chiave di servizio perche' qui non c'e' nessuna sessione: gira da sola,
  // sul server, senza nessuno davanti allo schermo.
  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) as ApiSupabaseClient;

  const inizio = Date.now();
  const scaduto = () => Date.now() - inizio > BUDGET_MS;

  const sorgenti = await sorgentiAttive(supabase);
  const esiti = new Map<string, EsitoSorgente>();
  const lavoro: Array<{ sorgente: Sorgente; voci: DealerSiteEntry[]; righe: RigaImportata[] }> = [];

  // Primo passo, per tutte: le sparizioni. Una richiesta a testa, e sono la
  // cosa che si vede di piu'.
  for (const sorgente of sorgenti) {
    const chiave = `${sorgente.dealer_id}|${sorgente.import_source}`;
    const esito: EsitoSorgente = {
      sito: sorgente.import_source,
      dealerId: sorgente.dealer_id,
      nascoste: 0,
      ripristinate: 0,
      importate: 0,
      rilette: 0,
    };
    esiti.set(chiave, esito);

    const voci = await elencoStock(sorgente.import_source);
    if (!voci) {
      esito.nota = "sito non raggiungibile: niente toccato";
      continue;
    }

    const { righe, error } = await archivioDellaSorgente(supabase, sorgente);
    if (error) {
      esito.nota = "archivio non letto";
      continue;
    }

    const allineamento = await allinea(
      supabase,
      sorgente,
      voci.map((voce) => voce.sourceId),
      righe,
    );

    esito.nascoste = allineamento.nascoste;
    esito.ripristinate = allineamento.ripristinate;
    if (allineamento.nota) esito.nota = allineamento.nota;

    lavoro.push({ sorgente, voci, righe });
  }

  // Secondo passo: col tempo che resta, in parti uguali. Cosi' una
  // concessionaria grossa non puo' affamare le altre.
  let ancoraDaFare = false;

  for (let i = 0; i < lavoro.length; i += 1) {
    const { sorgente, voci, righe } = lavoro[i];
    const chiave = `${sorgente.dealer_id}|${sorgente.import_source}`;
    const esito = esiti.get(chiave)!;

    const rimanenti = lavoro.length - i;
    const finePorzione = Math.min(inizio + BUDGET_MS, Date.now() + (BUDGET_MS - (Date.now() - inizio)) / rimanenti);
    const scadutaPorzione = () => Date.now() > finePorzione - TEMPO_MINIMO_PER_SCHEDA_MS || scaduto();

    const gia = new Set(righe.map((riga) => String(riga.import_source_id ?? "")));
    const nuove = voci.filter((voce) => !gia.has(String(voce.sourceId)));

    if (nuove.length > 0) {
      // Il freno della demo vale anche qui: un account di prova non deve
      // riempirsi di veicoli da solo. Le sparizioni invece si fanno comunque,
      // perche' tolgono, non aggiungono.
      const contesto = await resolveDemoAccessContext(supabase, sorgente.dealer_id, {
        vehicleCount: righe.length,
      });
      const bloccoDemo = getDemoFeatureBlockReason(contesto, "import");

      if (bloccoDemo) {
        esito.nota = esito.nota ?? "importazione non consentita a questo account";
      } else {
        const esitoNuove = await importaNuove(supabase, sorgente, nuove, scadutaPorzione);
        esito.importate = esitoNuove.importate;
        if (esitoNuove.errori.length > 0) esito.errori = esitoNuove.errori;
        if (esitoNuove.restanti > 0) ancoraDaFare = true;
      }
    }

    if (!scadutaPorzione()) {
      const vociPerSourceId = new Map(voci.map((voce) => [String(voce.sourceId), voce]));
      const esitoRilettura = await rileggi(supabase, sorgente, vociPerSourceId, scadutaPorzione);
      esito.rilette = esitoRilettura.rilette;
      if (esitoRilettura.errori.length > 0) {
        esito.errori = [...(esito.errori ?? []), ...esitoRilettura.errori];
      }
      if (esitoRilettura.restanti) ancoraDaFare = true;
    } else {
      ancoraDaFare = true;
    }
  }

  return NextResponse.json({
    sorgenti: sorgenti.length,
    // Chi chiama richiama finche' questo resta vero: una chiamata sola non
    // basta a rileggere centocinquanta schede.
    ancoraDaFare,
    durataMs: Date.now() - inizio,
    esiti: [...esiti.values()],
  });
}

// Il lavoro periodico di GitHub Actions chiama in GET.
export async function GET(request: Request) {
  return handle(request);
}

// Per lanciarla a mano.
export async function POST(request: Request) {
  return handle(request);
}
