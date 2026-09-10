import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { caricaTutto } from "@/lib/carica-tutto";
import { elencoStock, leggiPaginaConEsito, PAUSA_FRA_SCHEDE_MS } from "@/lib/dealer-site-fetch";
import { parseDealerStockVehicle, type DealerSiteEntry } from "@/lib/dealer-site-import";
import { sostituisciFoto } from "@/lib/dealer-site-photos";
import {
  campiSparitaFuoriVetrina,
  campiVeicoloRitrovato,
  campiVeicoloSparito,
  payloadDatiVeicolo,
  pianoRiconciliazione,
  type RigaImportata,
} from "@/lib/dealer-site-sync";
import { STATO_OLTRE_IL_TETTO } from "@/lib/tetto-del-piano";
import { applicaTettoDelPiano, postiLiberi } from "@/lib/tetto-del-piano-db";
import { getDemoFeatureBlockReason, resolveDemoAccessContext } from "@/lib/demo-access";
import {
  aggiungiSaltate,
  chiaveSorgente,
  leggiCursore,
  ordinaARotazione,
  percorriFila,
  serveAncora,
  sitiInRitardo,
  type Cursore,
  type EsitoFila,
  type SitoInRitardo,
} from "@/lib/sincronizzazione-turni";

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
 * concessionarie, cosi' nessuna puo' affamare le altre. **Il primo turno
 * ruota** a ogni chiamata: e' il piu' ricco, e se fosse sempre dello stesso
 * sito gli altri vivrebbero di avanzi.
 *
 * **Un sito che frena non consuma il tempo degli altri.** Dal 07/09/2026 il
 * sito di Autogepy ha risposto "troppe richieste" a quasi ogni scheda: la sua
 * fetta si consumava in letture fallite, sempre le stesse, e il flag "ancora
 * da fare" restava acceso per lui -- venti chiamate a vuoto per run, e le sue
 * 140 auto ferme per tre giorni con il riepilogo verde. Ora al primo 429 si
 * passa oltre, quello che e' fallito in questo run non si ritenta (il
 * cursore, che il chiamante ci ripassa), un sito senza progresso non tiene
 * acceso il flag, e un sito fermo da piu' di 24 ore viene detto: e' il lavoro
 * periodico a diventare rosso. Le regole stanno in
 * `src/lib/sincronizzazione-turni.ts`, con i test.
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
  /** Quando una scheda di questo sito e' stata riletta l'ultima volta. */
  ultimaSincronizzazione: string | null;
  /** Il tetto del piano, e quante auto del sito restano fuori per quello. */
  limite: number | null;
  oltreIlTetto: number;
  /** Mosse dal tetto in questa chiamata: salite in vetrina, messe da parte. */
  salite: number;
  messeDaParte: number;
  nota?: string;
  /** Le scritture non riuscite, con il motivo del database. */
  errori?: string[];
};

const pausa = () => new Promise<void>((r) => setTimeout(r, PAUSA_FRA_SCHEDE_MS));

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

/** Il cursore che il chiamante ci ripassa, se ce l'ha. In GET non c'e'. */
async function cursoreDallaRichiesta(request: Request): Promise<Cursore> {
  if (request.method !== "POST") return leggiCursore(null);
  try {
    const corpo = (await request.json()) as { cursore?: unknown } | null;
    return leggiCursore(corpo?.cursore);
  } catch {
    return leggiCursore(null);
  }
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
    const chiave = chiaveSorgente(riga);
    if (!viste.has(chiave)) viste.set(chiave, riga);
  }

  // In un ordine stabile: la rotazione ha senso solo se l'elenco di partenza
  // e' lo stesso a ogni chiamata, e il database non lo garantisce.
  return [...viste.values()].sort((a, b) => chiaveSorgente(a).localeCompare(chiaveSorgente(b)));
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

/** L'ultima scheda riletta di questo sito, per dire da quanto e' fermo. */
async function ultimaSincronizzazione(supabase: ApiSupabaseClient, sorgente: Sorgente): Promise<string | null> {
  const { data } = await supabase
    .from("vehicles")
    .select("import_synced_at")
    .eq("dealer_id", sorgente.dealer_id)
    .eq("import_source", sorgente.import_source)
    .not("import_synced_at", "is", null)
    .order("import_synced_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ import_synced_at: string | null }>();
  return data?.import_synced_at ?? null;
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
  const { daNascondere, daRipristinare, daSegnareSparite } = esito.piano;

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

  if (daSegnareSparite.length > 0) {
    await supabase
      .from("vehicles")
      .update(campiSparitaFuoriVetrina(adesso))
      .eq("dealer_id", sorgente.dealer_id)
      .in("id", daSegnareSparite);
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
  postiLiberi: number | null,
  scaduto: () => boolean,
): Promise<{ fila: EsitoFila; errori: string[] }> {
  const errori: string[] = [];
  // Quante possono entrare pubblicate adesso. Le altre entrano lo stesso, in
  // fila per il tetto: al prossimo giro la regola decide chi sale, e a un'usata
  // arrivata dopo non tocca restare fuori solo perche' e' arrivata dopo.
  let posti = postiLiberi;

  const fila = await percorriFila({
    voci: nuove,
    scaduto,
    pausa,
    leggi: (voce) => leggiPaginaConEsito(voce.url),
    elabora: async (voce, html) => {
      const letto = parseDealerStockVehicle(html, voce);
      if (!letto.ok) {
        // Senza prezzo, senza foto, o e' un noleggio: sono gli stessi scarti
        // dell'importazione a mano, e non sono errori.
        return "saltata";
      }

      const adesso = new Date().toISOString();
      const inVetrina = posti === null || posti > 0;
      const { data: inserito, error } = await supabase
        .from("vehicles")
        .insert({
          ...payloadDatiVeicolo(letto.vehicle),
          dealer_id: sorgente.dealer_id,
          status: inVetrina ? "published" : STATO_OLTRE_IL_TETTO,
          published: inVetrina,
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
        return "fermati";
      }

      if (inVetrina && posti !== null) posti -= 1;

      if (letto.vehicle.images.length > 0) {
        await sostituisciFoto(supabase, sorgente.dealer_id, inserito.id, letto.vehicle.images);
      }
      return "fatta";
    },
  });

  return { fila, errori };
}

/**
 * Ripassa prezzo, chilometri e fotografie delle schede meno recenti.
 *
 * L'ordinamento per "import_synced_at" con i vuoti per primi e' quello che
 * garantisce il giro completo: chi viene riletta adesso finisce in fondo alla
 * fila, e alla chiamata dopo tocca alle altre. Le schede la cui pagina non si
 * e' letta **non** vengono segnate -- non sono state rilette -- e per questo
 * il cursore le tiene fuori dalla fila per il resto del run: altrimenti
 * resterebbero in testa e ogni chiamata ricomincerebbe da loro.
 */
async function rileggi(
  supabase: ApiSupabaseClient,
  sorgente: Sorgente,
  vociPerSourceId: Map<string, DealerSiteEntry>,
  saltate: readonly string[],
  scaduto: () => boolean,
): Promise<{ fila: EsitoFila; errori: string[]; codaPiena: boolean }> {
  const soglia = new Date(Date.now() - ORE_PRIMA_DI_RILEGGERE * 3600 * 1000).toISOString();

  let interrogazione = supabase
    .from("vehicles")
    .select("id, import_source_id")
    .eq("dealer_id", sorgente.dealer_id)
    .eq("import_source", sorgente.import_source)
    .is("import_missing_since", null)
    .or(`import_synced_at.is.null,import_synced_at.lt.${soglia}`);

  if (saltate.length > 0) {
    interrogazione = interrogazione.not("import_source_id", "in", `(${saltate.map((id) => `"${id}"`).join(",")})`);
  }

  const { data } = await interrogazione
    .order("import_synced_at", { ascending: true, nullsFirst: true })
    .limit(MAX_SCHEDE_PER_GIRO);

  const daRileggere = (data ?? []) as Array<{ id: string; import_source_id: string | null }>;
  const errori: string[] = [];

  // La voce dell'indice e non il solo indirizzo: da li' arriva anche la
  // condizione (usata o km 0), che sta nel percorso e non nella pagina.
  // Passandone una inventata, una km 0 riletta diventerebbe "Usato".
  const voci = daRileggere
    .map((riga) => ({ riga, voce: vociPerSourceId.get(String(riga.import_source_id ?? "")) }))
    .filter((coppia): coppia is { riga: { id: string; import_source_id: string | null }; voce: DealerSiteEntry } => Boolean(coppia.voce))
    .map(({ riga, voce }) => ({ ...voce, rigaId: riga.id }));

  const fila = await percorriFila({
    voci,
    scaduto,
    pausa,
    leggi: (voce) => leggiPaginaConEsito(voce.url),
    elabora: async (voce, html) => {
      const letto = parseDealerStockVehicle(html, voce);
      const adesso = new Date().toISOString();

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
        .eq("id", voce.rigaId)
        .eq("dealer_id", sorgente.dealer_id)
        .select("id");

      if (error) {
        if (errori.length < 5) errori.push(`${voce.sourceId}: ${error.message}`);
        return "saltata";
      }

      if ((toccate ?? []).length === 0) {
        if (errori.length < 5) errori.push(`${voce.sourceId}: nessuna riga aggiornata`);
        return "saltata";
      }

      // Le fotografie seguono i dati: sul sito cambiano, e una galleria vecchia
      // e' visibile quanto un prezzo vecchio.
      if (letto.ok && letto.vehicle.images.length > 0) {
        await sostituisciFoto(supabase, sorgente.dealer_id, voce.rigaId, letto.vehicle.images);
      }

      return "fatta";
    },
  });

  // Se il lotto era pieno ce ne sono altre in coda, oltre a quelle rimaste qui.
  return { fila, errori, codaPiena: daRileggere.length === MAX_SCHEDE_PER_GIRO };
}

function notaPerFermata(fermataPer: EsitoFila["fermataPer"], cosa: "importazione" | "rilettura"): string | null {
  if (fermataPer === "freno") return `il sito frena le nostre richieste (429): ${cosa} rimandata alla prossima chiamata`;
  if (fermataPer === "letture-fallite") return `tre schede di fila non lette: ${cosa} rimandata alla prossima chiamata`;
  return null;
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

  let cursore = await cursoreDallaRichiesta(request);
  const sorgenti = ordinaARotazione(await sorgentiAttive(supabase), chiaveSorgente, cursore.dopo);
  const esiti = new Map<string, EsitoSorgente>();
  const lavoro: Array<{ sorgente: Sorgente; voci: DealerSiteEntry[]; righe: RigaImportata[] }> = [];

  // Primo passo, per tutte: le sparizioni. Una richiesta a testa, e sono la
  // cosa che si vede di piu'.
  for (const sorgente of sorgenti) {
    const chiave = chiaveSorgente(sorgente);
    const esito: EsitoSorgente = {
      sito: sorgente.import_source,
      dealerId: sorgente.dealer_id,
      nascoste: 0,
      ripristinate: 0,
      importate: 0,
      rilette: 0,
      ultimaSincronizzazione: null,
      limite: null,
      oltreIlTetto: 0,
      salite: 0,
      messeDaParte: 0,
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

    const tetto = await applicaTettoDelPiano(supabase, sorgente.dealer_id);
    esito.limite = tetto.limite;
    esito.oltreIlTetto = tetto.oltreIlTetto;
    esito.salite = tetto.salite;
    esito.messeDaParte = tetto.messeDaParte;
    if (tetto.errori.length > 0) esito.errori = tetto.errori;

    lavoro.push({ sorgente, voci, righe });
  }

  // Secondo passo: col tempo che resta, in parti uguali. Cosi' una
  // concessionaria grossa non puo' affamare le altre.
  let ancoraDaFare = false;

  for (let i = 0; i < lavoro.length; i += 1) {
    const { sorgente, voci, righe } = lavoro[i];
    const chiave = chiaveSorgente(sorgente);
    const esito = esiti.get(chiave)!;
    const saltate = cursore.saltate[chiave] ?? [];

    const rimanenti = lavoro.length - i;
    const finePorzione = Math.min(inizio + BUDGET_MS, Date.now() + (BUDGET_MS - (Date.now() - inizio)) / rimanenti);
    const scadutaPorzione = () => Date.now() > finePorzione - TEMPO_MINIMO_PER_SCHEDA_MS || scaduto();

    const gia = new Set(righe.map((riga) => String(riga.import_source_id ?? "")));
    const daSaltare = new Set(saltate);
    const nuove = voci.filter((voce) => !gia.has(String(voce.sourceId)) && !daSaltare.has(String(voce.sourceId)));

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
        // I posti liberi adesso: il tetto meno le pubblicate, dopo che la regola
        // ha gia' sistemato l'archivio nel primo passo.
        const posti = await postiLiberi(supabase, sorgente.dealer_id, esito.limite);

        const { fila, errori } = await importaNuove(supabase, sorgente, nuove, posti, scadutaPorzione);
        esito.importate = fila.fatte;
        if (errori.length > 0) esito.errori = [...(esito.errori ?? []), ...errori];
        cursore = aggiungiSaltate(cursore, chiave, fila.fallite);

        if (fila.fermataPer === "tetto") {
          // Il database ha rifiutato lo stesso: il conto dei posti era sbagliato
          // o il piano e' cambiato nel frattempo. Non sono "da fare".
          esito.nota = "il database ha rifiutato un inserimento per il tetto del piano";
        }
        const nota = notaPerFermata(fila.fermataPer, "importazione");
        if (nota) esito.nota = nota;

        if (serveAncora(fila)) ancoraDaFare = true;
        // Il sito ci ha chiesto di rallentare, o e' giu': il resto del suo
        // turno va agli altri. Rileggerlo adesso sarebbe insistere.
        if (fila.fermataPer === "freno" || fila.fermataPer === "letture-fallite") {
          esito.ultimaSincronizzazione = await ultimaSincronizzazione(supabase, sorgente);
          continue;
        }
      }
    }

    if (!scadutaPorzione()) {
      const vociPerSourceId = new Map(voci.map((voce) => [String(voce.sourceId), voce]));
      const { fila, errori, codaPiena } = await rileggi(supabase, sorgente, vociPerSourceId, saltate, scadutaPorzione);
      esito.rilette = fila.fatte;
      if (errori.length > 0) esito.errori = [...(esito.errori ?? []), ...errori];
      cursore = aggiungiSaltate(cursore, chiave, fila.fallite);

      const nota = notaPerFermata(fila.fermataPer, "rilettura");
      if (nota) esito.nota = nota;

      if (serveAncora({ ...fila, restanti: fila.restanti + (codaPiena ? MAX_SCHEDE_PER_GIRO : 0) })) ancoraDaFare = true;
    } else {
      // Il tempo e' finito prima del suo turno: alla prossima chiamata la
      // rotazione lo mette per primo.
      ancoraDaFare = true;
    }

    esito.ultimaSincronizzazione = await ultimaSincronizzazione(supabase, sorgente);
  }

  // Anche per chi e' rimasto fuori dal secondo passo: un sito non raggiungibile
  // e' proprio quello che rischia di essere fermo da giorni.
  for (const [chiave, esito] of esiti) {
    if (esito.ultimaSincronizzazione === null) {
      const sorgente = sorgenti.find((s) => chiaveSorgente(s) === chiave)!;
      esito.ultimaSincronizzazione = await ultimaSincronizzazione(supabase, sorgente);
    }
  }

  const inRitardo: SitoInRitardo[] = sitiInRitardo([...esiti.values()], new Date());

  return NextResponse.json({
    sorgenti: sorgenti.length,
    // Chi chiama richiama finche' questo resta vero: una chiamata sola non
    // basta a rileggere centocinquanta schede.
    ancoraDaFare,
    // Da ripassare cosi' com'e' alla chiamata successiva.
    cursore: { ...cursore, dopo: sorgenti[0] ? chiaveSorgente(sorgenti[0]) : cursore.dopo },
    // I siti fermi da piu' di 24 ore. Il lavoro periodico li legge e diventa
    // rosso: e' l'unica cosa che manca a un riepilogo per essere letto.
    sitiInRitardo: inRitardo,
    durataMs: Date.now() - inizio,
    esiti: [...esiti.values()],
  });
}

// Il lavoro periodico di GitHub Actions chiama in POST, con il cursore.
export async function POST(request: Request) {
  return handle(request);
}

// Per lanciarla a mano, senza cursore.
export async function GET(request: Request) {
  return handle(request);
}
