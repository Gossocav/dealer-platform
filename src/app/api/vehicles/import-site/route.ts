import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { caricaTutto } from "@/lib/carica-tutto";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { getDemoFeatureBlockReason, resolveDemoAccessContext } from "@/lib/demo-access";
import { messaggioDelTetto, STATO_OLTRE_IL_TETTO } from "@/lib/tetto-del-piano";
import { applicaTettoDelPiano, limiteDelPiano, postiLiberi } from "@/lib/tetto-del-piano-db";
import {
  elencoStockConEsito,
  leggiPagina,
  normalizzaSitoConcessionaria,
  PAUSA_FRA_SCHEDE_MS,
  spiegaElencoNonLetto,
} from "@/lib/dealer-site-fetch";
import { parseDealerStockVehicle, schedaNuovaDaImportare, type DealerSiteVehicle } from "@/lib/dealer-site-import";
import { leggiBloccoMotork } from "@/lib/blocco-motork";
import { scriviDalSito, dalSito } from "@/lib/provenienza-dati";
import { indirizzoDellaScheda, segnalaAIndexNow } from "@/lib/indexnow";
import { nuovoTettoCopieTolte, sostituisciFoto } from "@/lib/dealer-site-photos";
import { segnalaErrore } from "@/lib/segnala-errore";
import {
  COLONNE_DA_RILEGGERE,
  campiDalBloccoRicco,
  campiSparitaFuoriVetrina,
  campiVeicoloRitrovato,
  campiVeicoloSparito,
  payloadDatiVeicolo,
  pianoRiconciliazione,
  type RigaDaRileggere,
  type RigaImportata,
  valoriInArchivio,
} from "@/lib/dealer-site-sync";

/**
 * Importa lo stock usato dal sito che la concessionaria ha gia'.
 *
 * Tre azioni distinte, e la distinzione conta: "analizza" guarda e non scrive
 * niente, "importa" scrive un lotto alla volta -- cosi' si vede cosa
 * arriverebbe prima che arrivi qualcosa -- e "riconcilia" non porta dentro
 * niente: toglie dalla vetrina cio' che sul sito non c'e' piu'.
 *
 * A lotti perche' leggere il sito di qualcun altro non e' istantaneo: qualche
 * secondo a scheda. Un lotto per richiesta sta dentro i limiti di tempo del
 * server, e fa vedere l'avanzamento invece di lasciare davanti a una
 * schermata ferma.
 */

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

/**
 * I campi di servizio della scheda. I **dati** del veicolo non stanno qui:
 * passano da `scriviDalSito`, che lascia stare quelli corretti dal
 * concessionario. Prima questa funzione li riscriveva tutti a ogni
 * reimportazione, esattamente come faceva la sincronizzazione notturna
 * (difetto del 15/09/2026): il concessionario correggeva un prezzo, premeva
 * "Importa dal sito" per far entrare due auto nuove, e la correzione spariva.
 */
function payloadVeicolo(v: DealerSiteVehicle, dealerId: string, host: string, status: "draft" | "published" | typeof STATO_OLTRE_IL_TETTO) {
  return {
    dealer_id: dealerId,
    status,
    published: status === "published",
    import_source: host,
    import_source_id: v.sourceId,
    // Appena riletta dal sito: non e' sparita, e sappiamo di quando e' la
    // lettura. La data serve alla sincronizzazione notturna per sapere quali
    // schede sono le piu' vecchie.
    import_missing_since: null,
    import_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Toglie dalla vetrina le automobili che il sito della concessionaria non
 * dichiara piu', e rimette quelle che ci sono tornate.
 *
 * Sta qui e non dentro l'importazione a lotti perche' vuole l'elenco
 * **intero** del sito: fatta su un lotto di cinque direbbe che le altre
 * centoquaranta sono sparite. Costa una sola richiesta -- la sitemap -- e
 * quindi si puo' fare in un colpo anche su uno stock grosso.
 *
 * Le due reti di sicurezza (elenco vuoto, sparizione in massa) stanno in
 * "pianoRiconciliazione", dove si possono provare.
 */
async function riconcilia(
  supabase: ApiSupabaseClient,
  dealerId: string,
  host: string,
  idsSulSito: string[],
  /** Con la chiave di servizio: il tetto del piano si legge solo con quella. */
  supabaseTetto: ApiSupabaseClient | null,
) {
  const { righe, troncato, error } = await caricaTutto<RigaImportata>((da, a) =>
    supabase
      .from("vehicles")
      .select("id, import_source_id, status, published, import_missing_since")
      .eq("dealer_id", dealerId)
      .eq("import_source", host)
      .range(da, a),
  );

  if (error) {
    return NextResponse.json({ error: "Non siamo riusciti a leggere il tuo archivio." }, { status: 500 });
  }

  const esito = pianoRiconciliazione({ idsSulSito, righe });

  if (!esito.ok) {
    // Un messaggio che dice cosa e' successo e cosa NON abbiamo fatto: il
    // silenzio qui somiglierebbe a "e' andato tutto bene".
    const messaggio =
      esito.motivo === "elenco-vuoto"
        ? `Il sito ${host} non ha dichiarato nessun veicolo: non l'abbiamo toccato. Riprova fra qualche minuto.`
        : `Su ${host} risultano sparite ${esito.assenti} auto su ${esito.totale}: sono troppe perche' sia una vendita. ` +
          "Di solito vuol dire che il sito ha cambiato gli indirizzi delle schede. Non abbiamo tolto niente dalla vetrina.";
    return NextResponse.json({ error: messaggio }, { status: 409 });
  }

  const adesso = new Date();
  const { daNascondere, daRipristinare, daSegnareSparite } = esito.piano;

  if (daNascondere.length > 0) {
    const { error: erroreNascondi } = await supabase
      .from("vehicles")
      .update(campiVeicoloSparito(adesso))
      .eq("dealer_id", dealerId)
      .in("id", daNascondere);

    if (erroreNascondi) {
      return NextResponse.json({ error: "Non siamo riusciti ad aggiornare i veicoli." }, { status: 500 });
    }
  }

  if (daRipristinare.length > 0) {
    // Se questo non riesce non si annulla quanto sopra: sono due correzioni
    // indipendenti, e averne fatta una sola e' meglio che nessuna.
    await supabase
      .from("vehicles")
      .update(campiVeicoloRitrovato(adesso))
      .eq("dealer_id", dealerId)
      .in("id", daRipristinare);
  }

  if (daSegnareSparite.length > 0) {
    await supabase
      .from("vehicles")
      .update(campiSparitaFuoriVetrina(adesso))
      .eq("dealer_id", dealerId)
      .in("id", daSegnareSparite);
  }

  // Un posto liberato da una sparizione va alla prossima in fila; un'auto
  // tornata sul sito torna in fila, non in vetrina. La regola decide.
  const tetto = supabaseTetto ? await applicaTettoDelPiano(supabaseTetto, dealerId) : null;

  return NextResponse.json({
    site: host,
    nascoste: daNascondere.length,
    ripristinate: daRipristinare.length,
    inArchivio: righe.length,
    sulSito: idsSulSito.length,
    troncato,
    tetto: tetto
      ? { limite: tetto.limite, oltreIlTetto: tetto.oltreIlTetto, salite: tetto.salite, messaggio: messaggioDelTetto(tetto.limite, tetto.oltreIlTetto) }
      : null,
  });
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

    const host = normalizzaSitoConcessionaria(body?.site);
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

    // Il tetto del piano si legge e si applica con la chiave di servizio:
    // `resolve_dealer_listing_cap` e' riservata a quella (05/09/2026), e le
    // scritture della regola devono poter togliere dalla vetrina anche
    // un'auto inserita a mano. Tutto il resto continua a passare dalla
    // sessione dell'utente, con la protezione per riga a fare da guardia.
    const chiaveDiServizio = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseTetto = chiaveDiServizio
      ? (createClient(supabaseUrl, chiaveDiServizio, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        }) as ApiSupabaseClient)
      : null;

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

    // Tre motivi diversi per non aver letto l'elenco, e tre frasi diverse:
    // in due casi su tre l'indirizzo e' giusto, e dirgli di verificarlo lo
    // manda via (`spiegaElencoNonLetto`, con la misura del 23/09/2026).
    const elenco = await elencoStockConEsito(host);
    if (!elenco.ok) {
      return NextResponse.json({ error: spiegaElencoNonLetto(elenco, host), motivo: elenco.motivo }, { status: 502 });
    }
    const voci = elenco.voci;

    if (body?.action === "analyze") {
      return NextResponse.json({
        site: host,
        totale: voci.length,
        usate: voci.filter((v) => v.condition === "Usato").length,
        km0: voci.filter((v) => v.condition === "Km/0").length,
      });
    }

    if (body?.action !== "import" && body?.action !== "riconcilia") {
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

    if (body?.action === "riconcilia") {
      return await riconcilia(supabase, dealerId, host, voci.map((voce) => voce.sourceId), supabaseTetto);
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
    // Il tetto delle foto copiate tolte vale per questo lotto: la stessa rete
    // della sincronizzazione, per la stessa ragione.
    const tettoFoto = nuovoTettoCopieTolte();
    // Chi chiede "pubblicata" ne ha diritto finche' c'e' posto; le altre
    // entrano lo stesso, in fila per il tetto (`src/lib/tetto-del-piano.ts`):
    // a fine lotto la regola decide chi sta in vetrina, usate per prime.
    const limite = status === "published" && supabaseTetto ? await limiteDelPiano(supabaseTetto, dealerId) : null;
    let posti = status === "published" ? await postiLiberi(supabase, dealerId, limite) : null;
    // Le auto entrate o cambiate in questo giro: a fine lotto si segnalano ai
    // motori che accettano IndexNow, cosi' un annuncio nuovo non aspetta che
    // qualcuno passi a rileggere la sitemap.
    const idDaSegnalare: string[] = [];

    for (const voce of lotto) {
      const html = await leggiPagina(voce.url);

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
      const payload = payloadVeicolo(veicolo, dealerId, host, status === "published" && posti !== null && posti <= 0 ? STATO_OLTRE_IL_TETTO : status) as Record<string, unknown>;

      const { data: esistente } = await supabase
        .from("vehicles")
        .select(COLONNE_DA_RILEGGERE)
        .eq("dealer_id", dealerId)
        .eq("import_source", host)
        .eq("import_source_id", veicolo.sourceId)
        .limit(1)
        .maybeSingle<RigaDaRileggere>();

      // Un'auto nuova senza foto proprie non entra; una gia' in archivio si
      // aggiorna nei dati, e la sua galleria resta com'e'.
      if (!esistente) {
        const nuova = schedaNuovaDaImportare(letto);
        if (!nuova.ok) {
          esiti.push({ sourceId: voce.sourceId, url: voce.url, esito: "saltato", motivo: nuova.reason });
          await new Promise((r) => setTimeout(r, PAUSA_FRA_SCHEDE_MS));
          continue;
        }
      }

      let vehicleId = esistente?.id ?? null;

      // Quello che il sito dice oggi, campo per campo, con il blocco ricco
      // quando c'e'. Sulla scheda gia' in archivio si scrive solo cio' che
      // il concessionario non ha corretto; su una nuova si scrive tutto.
      const scrittura = scriviDalSito(
        esistente?.origine_dati ?? {},
        esistente ? valoriInArchivio(esistente) : {},
        { ...dalSito(payloadDatiVeicolo(veicolo)), ...campiDalBloccoRicco(leggiBloccoMotork(html, veicolo.sourceId)) },
        new Date().toISOString().slice(0, 10),
      );
      const { entered_on: ingresso, ...datiDalSito } = scrittura.daScrivere;
      const daScrivere = { ...datiDalSito, origine_dati: scrittura.origineDati, ...payload };

      if (vehicleId) {
        const { error } = await supabase.from("vehicles").update(daScrivere).eq("id", vehicleId).eq("dealer_id", dealerId);
        // Anche un aggiornamento occupa un posto, se porta in vetrina un'auto
        // che in vetrina non era: scalare il conto solo sugli inserimenti
        // lasciava superare il tetto da chi reimportava il proprio sito.
        if (!error && payload.status === "published" && posti !== null && posti > 0) posti -= 1;
        if (error) {
          esiti.push({ sourceId: veicolo.sourceId, url: voce.url, esito: "saltato", motivo: error.message });
          continue;
        }
        esiti.push({ sourceId: veicolo.sourceId, url: voce.url, esito: "aggiornato", titolo: veicolo.name });
        idDaSegnalare.push(vehicleId);
      } else {
        const { data: inserito, error } = await supabase
          .from("vehicles")
          .insert(daScrivere)
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
        if (status === "published" && posti !== null && posti > 0) posti -= 1;
        esiti.push({ sourceId: veicolo.sourceId, url: voce.url, esito: "importato", titolo: veicolo.name });
        idDaSegnalare.push(vehicleId);
      }

      // La data d'ingresso sta su un'altra tabella, e si scrive solo se il
      // sito la dichiara e la provenienza dice che si puo'.
      if (vehicleId && ingresso) {
        const { error: erroreIngresso } = await supabase
          .from("vehicle_acquisitions")
          .upsert({ vehicle_id: vehicleId, dealer_id: dealerId, entered_on: String(ingresso) }, { onConflict: "vehicle_id" });
        if (erroreIngresso) segnalaErrore("import-site: data d'ingresso non scritta", erroreIngresso, { vehicleId });
      }

      if (vehicleId && veicolo.images.length > 0) {
        const galleria = await sostituisciFoto(supabase, dealerId, vehicleId, veicolo.images, tettoFoto);
        // "Meglio se riesce": la scheda e' gia' scritta. Ma una galleria
        // fermata o fallita si dice, non si lascia intendere che sia a posto.
        if (galleria.esito === "fermata-dal-tetto" || galleria.esito === "non-letta" || (galleria.esito === "aggiornata" && galleria.errore)) {
          segnalaErrore("import-site: galleria non aggiornata", new Error(galleria.esito), { vehicleId, galleria });
        }
      }

      await new Promise((r) => setTimeout(r, PAUSA_FRA_SCHEDE_MS));
    }

    // Effetto collaterale, nel senso stretto che questo progetto da' alla
    // parola: un'auto importata correttamente resta importata anche se Bing
    // non risponde. `segnalaAIndexNow` non solleva mai, e il suo esito finisce
    // nella risposta solo perche' si possa leggere nei registri.
    const segnalazione = await segnalaAIndexNow(idDaSegnalare.map(indirizzoDellaScheda));

    // A fine lotto la regola del tetto sistema la vetrina: chi ha chiesto
    // "pubblicata" per 81 auto con un piano da 50 vede 50 usate in vetrina,
    // non le prime 50 dell'indice.
    const tetto = status === "published" && supabaseTetto ? await applicaTettoDelPiano(supabaseTetto, dealerId, limite) : null;

    return NextResponse.json({
      site: host,
      totale: voci.length,
      offset,
      elaborati: lotto.length,
      prossimoOffset: offset + lotto.length,
      finito: offset + lotto.length >= voci.length,
      esiti,
      segnalazione,
      tetto: tetto ? { limite: tetto.limite, oltreIlTetto: tetto.oltreIlTetto, messaggio: messaggioDelTetto(tetto.limite, tetto.oltreIlTetto) } : null,
    });
  } catch (error) {
    console.error("import-site error", error);
    return NextResponse.json({ error: "Errore imprevisto durante l'importazione dal sito." }, { status: 500 });
  }
}
