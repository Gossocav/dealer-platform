import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendPlatformEmail } from "@/lib/admin-notification-email";
import { costruisciEmailPromemoria, type VoceEmail } from "@/lib/email-promemoria";
import { etichettaTipo, oggiIso, titoloPromemoria, urgenza } from "@/lib/promemoria";

/**
 * L'email del mattino: una per concessionaria, solo se c'e' qualcosa.
 *
 * Chiamata dal lavoro periodico in `.github/workflows/promemoria-mattina.yml`,
 * con lo stesso segreto della sincronizzazione notturna.
 *
 * **Una email al giorno, non una per promemoria.** Deciso col titolare il
 * 03/09/2026: avvisi separati finiscono nello spam mentale dopo tre giorni, e
 * poi in quello vero. E se non c'e' niente da ricordare non parte niente: una
 * email che dice "oggi nulla" e' il modo piu' rapido per farla ignorare anche
 * il giorno in cui invece qualcosa c'e'.
 *
 * Dentro ci vanno i promemoria in ritardo e quelli di oggi, piu' il bollo
 * letto dal conto economico -- dove sta la sua scadenza, e dove resta, perche'
 * due posti per la stessa data divergerebbero. Il conto economico e' del Piano
 * Pro, quindi il bollo lo vedono i Pro e gli Elite: il piano si controlla qui,
 * perche' il servizio scavalca le politiche del database.
 *
 * `avvisato_il` segna il giorno dell'ultimo invio: se il lavoro gira due volte,
 * il secondo giro non trova niente. Un promemoria in ritardo invece torna ogni
 * mattina finche' non lo si segna fatto, ed e' voluto.
 */

const GIORNI_IN_ARRIVO = 7;

function autorizzato(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (request.headers.get("authorization") === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

function indirizzoPiattaforma() {
  return String(process.env.APP_BASE_URL ?? "https://www.keyauto.it").replace(/\/$/, "");
}

type RigaPromemoria = {
  id: string;
  dealer_id: string;
  tipo: string | null;
  titolo: string | null;
  note: string | null;
  scade_il: string;
  vehicle: { plate: string | null; brand: string | null; model: string | null } | null;
  lead: { first_name: string | null; last_name: string | null } | null;
  customer: { first_name: string | null; last_name: string | null; company: string | null } | null;
};

function riferimento(riga: RigaPromemoria): string | null {
  if (riga.vehicle) {
    const pezzi = [riga.vehicle.plate, riga.vehicle.brand, riga.vehicle.model].map((p) => String(p ?? "").trim());
    const testo = pezzi.filter(Boolean).join(" ");
    if (testo) return testo;
  }

  if (riga.lead) {
    const testo = [riga.lead.first_name, riga.lead.last_name].map((p) => String(p ?? "").trim()).filter(Boolean).join(" ");
    if (testo) return testo;
  }

  if (riga.customer) {
    const societa = String(riga.customer.company ?? "").trim();
    if (societa) return societa;
    const testo = [riga.customer.first_name, riga.customer.last_name]
      .map((p) => String(p ?? "").trim())
      .filter(Boolean)
      .join(" ");
    if (testo) return testo;
  }

  return null;
}

/**
 * Il bollo scaduto o in scadenza oggi, per le concessionarie che hanno il
 * conto economico. Non e' un promemoria salvato: si ricava dalla data che sta
 * gia' li', e per questo torna ogni mattina finche' non la si aggiorna.
 */
async function bolliDaRicordare(admin: SupabaseClient, oggi: string) {
  const letto = await admin
    .from("vehicle_economics")
    .select("dealer_id, bollo_expires_on, vehicles!inner(plate, brand, model)")
    .not("bollo_expires_on", "is", null)
    .lte("bollo_expires_on", oggi)
    .returns<
      Array<{
        dealer_id: string;
        bollo_expires_on: string;
        vehicles: { plate: string | null; brand: string | null; model: string | null } | null;
      }>
    >();

  if (letto.error) {
    console.error("promemoria:bolli", letto.error);
    return new Map<string, VoceEmail[]>();
  }

  const perConcessionaria = new Map<string, VoceEmail[]>();

  for (const riga of letto.data ?? []) {
    const vettura = [riga.vehicles?.plate, riga.vehicles?.brand, riga.vehicles?.model]
      .map((p) => String(p ?? "").trim())
      .filter(Boolean)
      .join(" ");

    const voci = perConcessionaria.get(riga.dealer_id) ?? [];
    voci.push({ titolo: "Bollo", tipo: "Bollo", scade_il: riga.bollo_expires_on, riferimento: vettura || null });
    perConcessionaria.set(riga.dealer_id, voci);
  }

  return perConcessionaria;
}

export async function POST(request: Request) {
  if (!autorizzato(request)) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const adesso = new Date();
  const oggi = oggiIso(adesso);

  const scadenzaInArrivo = new Date(adesso.getTime() + GIORNI_IN_ARRIVO * 24 * 60 * 60 * 1000);

  // Da avvisare: quelli scaduti e quelli di oggi, che non siano gia' stati
  // messi nell'email di stamattina.
  const daAvvisare = await admin
    .from("promemoria")
    .select(
      "id, dealer_id, tipo, titolo, note, scade_il, vehicle:vehicles(plate, brand, model), lead:leads(first_name, last_name), customer:customers(first_name, last_name, company)"
    )
    .eq("stato", "aperto")
    .lte("scade_il", oggi)
    .or(`avvisato_il.is.null,avvisato_il.lt.${oggi}`)
    .order("scade_il", { ascending: true })
    .returns<RigaPromemoria[]>();

  if (daAvvisare.error) {
    console.error("promemoria:lettura", daAvvisare.error);
    return NextResponse.json({ error: "Errore lettura promemoria." }, { status: 500 });
  }

  const inArrivo = await admin
    .from("promemoria")
    .select("dealer_id")
    .eq("stato", "aperto")
    .gt("scade_il", oggi)
    .lte("scade_il", oggiIso(scadenzaInArrivo))
    .returns<Array<{ dealer_id: string }>>();

  const contaInArrivo = new Map<string, number>();
  for (const riga of inArrivo.data ?? []) {
    contaInArrivo.set(riga.dealer_id, (contaInArrivo.get(riga.dealer_id) ?? 0) + 1);
  }

  const bolli = await bolliDaRicordare(admin, oggi);

  // Le concessionarie coinvolte: quelle con qualcosa da ricordare, piu' quelle
  // che hanno solo il bollo scaduto.
  const identificativi = new Set<string>([
    ...(daAvvisare.data ?? []).map((riga) => riga.dealer_id),
    ...bolli.keys(),
  ]);

  if (identificativi.size === 0) {
    return NextResponse.json({ inviate: 0, concessionarie: 0 }, { status: 200 });
  }

  const concessionarie = await admin
    .from("dealers")
    .select("id, name, legal_name, email")
    .in("id", [...identificativi])
    .returns<Array<{ id: string; name: string | null; legal_name: string | null; email: string | null }>>();

  if (concessionarie.error) {
    console.error("promemoria:concessionarie", concessionarie.error);
    return NextResponse.json({ error: "Errore lettura concessionarie." }, { status: 500 });
  }

  let inviate = 0;
  let senzaEmail = 0;
  const avvisati: string[] = [];

  for (const concessionaria of concessionarie.data ?? []) {
    const email = String(concessionaria.email ?? "").trim();

    if (!email) {
      // Senza indirizzo non si manda niente, e non si segna niente come
      // avvisato: il giorno che l'indirizzo ci sara', quei promemoria devono
      // ancora partire.
      senzaEmail += 1;
      continue;
    }

    const suoi = (daAvvisare.data ?? []).filter((riga) => riga.dealer_id === concessionaria.id);

    // Il bollo lo vedono solo i piani che hanno il conto economico: il
    // servizio scavalca le politiche del database, quindi il controllo si fa
    // qui a mano.
    let suoiBolli: VoceEmail[] = [];
    const bolliDellaConcessionaria = bolli.get(concessionaria.id);

    if (bolliDellaConcessionaria && bolliDellaConcessionaria.length > 0) {
      const piano = await admin.rpc("dealer_plan_in_force", { p_dealer_id: concessionaria.id });
      const codice = String(piano.data ?? "").toLowerCase();
      if (codice === "pro" || codice === "elite") suoiBolli = bolliDellaConcessionaria;
    }

    const voci: VoceEmail[] = [
      ...suoi.map((riga) => ({
        titolo: titoloPromemoria(riga),
        tipo: etichettaTipo(riga.tipo),
        scade_il: riga.scade_il,
        riferimento: riferimento(riga),
        note: riga.note,
      })),
      ...suoiBolli,
    ];

    const scaduti = voci.filter((voce) => urgenza(voce.scade_il, adesso)?.scaduto);
    const diOggi = voci.filter((voce) => urgenza(voce.scade_il, adesso)?.oggi);

    const contenuto = costruisciEmailPromemoria({
      nomeConcessionaria: String(concessionaria.name ?? concessionaria.legal_name ?? "").trim(),
      scaduti,
      oggi: diOggi,
      inArrivo: contaInArrivo.get(concessionaria.id) ?? 0,
      indirizzoPiattaforma: indirizzoPiattaforma(),
      adesso,
    });

    if (!contenuto) continue;

    const esito = await sendPlatformEmail({ toEmail: email, subject: contenuto.oggetto, html: contenuto.html });

    if (!esito.ok) {
      // Non si segna come avvisato quello che non e' partito: domani si
      // riprova, invece di perderlo per sempre.
      console.error("promemoria:invio", concessionaria.id, esito);
      continue;
    }

    inviate += 1;
    avvisati.push(...suoi.map((riga) => riga.id));
  }

  // Il timbro si mette solo su quello che e' davvero partito, e in fondo:
  // un errore qui non deve impedire l'invio, che e' gia' avvenuto.
  if (avvisati.length > 0) {
    const timbro = await admin.from("promemoria").update({ avvisato_il: oggi }).in("id", avvisati);
    if (timbro.error) console.error("promemoria:timbro", timbro.error);
  }

  return NextResponse.json(
    { inviate, concessionarie: concessionarie.data?.length ?? 0, promemoriaAvvisati: avvisati.length, senzaEmail },
    { status: 200 }
  );
}
