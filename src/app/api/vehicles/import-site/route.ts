import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { caricaTutto } from "@/lib/carica-tutto";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { getDemoFeatureBlockReason, resolveDemoAccessContext } from "@/lib/demo-access";
import {
  elencoStock,
  leggiPagina,
  normalizzaSitoConcessionaria,
  PAUSA_FRA_SCHEDE_MS,
} from "@/lib/dealer-site-fetch";
import { parseDealerStockVehicle, type DealerSiteVehicle } from "@/lib/dealer-site-import";
import { sostituisciFoto } from "@/lib/dealer-site-photos";
import {
  campiVeicoloRitrovato,
  campiVeicoloSparito,
  payloadDatiVeicolo,
  pianoRiconciliazione,
  type RigaImportata,
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

function payloadVeicolo(v: DealerSiteVehicle, dealerId: string, host: string, status: "draft" | "published") {
  return {
    ...payloadDatiVeicolo(v),
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
  const { daNascondere, daRipristinare } = esito.piano;

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

  return NextResponse.json({
    site: host,
    nascoste: daNascondere.length,
    ripristinate: daRipristinare.length,
    inArchivio: righe.length,
    sulSito: idsSulSito.length,
    troncato,
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
      return await riconcilia(supabase, dealerId, host, voci.map((voce) => voce.sourceId));
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
        await sostituisciFoto(supabase, dealerId, vehicleId, veicolo.images);
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
