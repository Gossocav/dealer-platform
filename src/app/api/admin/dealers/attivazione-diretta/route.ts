import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { contestoAmministratore } from "@/lib/admin-api-context";
import { normalizeDemoPlanCode } from "@/lib/demo-plan-catalog";
import { NOTA_ATTIVAZIONE_DIRETTA } from "@/lib/attivazione-diretta";
import { nomeDellaColonnaMancante } from "@/lib/tabella-mancante";

/**
 * Attivare una concessionaria direttamente su un piano a pagamento, senza
 * farle aprire una prova da convertire un minuto dopo.
 *
 * Serve il giorno che un concessionario dice "ho visto, attivami il Pro". Fino
 * a oggi l'unica strada era farlo passare per la richiesta di prova: una
 * finzione che il titolare doveva recitare, e sette giorni di scadenza da
 * spegnere subito dopo.
 *
 * **Questo endpoint non riattiva nessuna macchina.** Crea soltanto la
 * richiesta -- che e' il pezzo mancante, perche' tutta l'attivazione parte da
 * li' -- gia' segnata come diretta e con il piano scelto. Poi il pannello
 * chiama in fila le due azioni che esistono e funzionano da mesi: attivazione
 * e conversione al piano. Duplicare qui quelle duecento righe avrebbe
 * significato due strade che col tempo si comportano in modo diverso, e la
 * seconda e' sempre quella meno provata.
 *
 * Il piano si registra dove il database lo cerca -- `converted_plan_code`
 * sulla riga dell'abbonamento -- perche' e' quello che leggono sia il tetto
 * degli annunci sia la serratura del conto economico. Vedi `dealer-plan.ts`.
 */

export const dynamic = "force-dynamic";

type CorpoRichiesta = {
  dealershipName?: unknown;
  contactName?: unknown;
  email?: unknown;
  phone?: unknown;
  city?: unknown;
  province?: unknown;
  planCode?: unknown;
  vehicleCount?: unknown;
  notes?: unknown;
};

function testo(valore: unknown): string {
  return String(valore ?? "").trim();
}

// Chi sta chiamando e' un amministratore? La risposta si decide in un posto
// solo: src/lib/admin-api-context.ts.
//
// Qui viveva una settima copia della stessa verifica -- e per giunta chiamata
// come il modulo comune, quindi cercando "contestoAmministratore" sembrava
// gia' a posto. Non lo era, e non era nemmeno identica alle altre sei: leggeva
// il token con `authHeader.split(" ")` invece di ritagliare il prefisso, cioe'
// la stessa serratura con una chiave diversa. E' esattamente il modo in cui
// sei copie smettono di essere sei copie uguali.
async function serraturaLocale(request: Request) {
  const contesto = await contestoAmministratore(request);

  if (contesto.errore) {
    return { errore: contesto.errore, admin: null } as const;
  }

  return { errore: null, admin: contesto.supabaseAdmin } as const;
}

/**
 * Scrive la richiesta togliendo le colonne che questo database non ha.
 *
 * Lo schema di produzione e' andato alla deriva rispetto alle migration piu'
 * di una volta: `province` e `dealership_name` esistono qui e potrebbero non
 * esistere altrove. Invece di far fallire l'attivazione per una colonna
 * accessoria, si toglie quella e si riprova -- e' lo stesso accorgimento del
 * modulo pubblico di richiesta prova.
 *
 * Il nome della colonna lo riconosce `nomeDellaColonnaMancante`, che sa
 * leggere entrambi i messaggi: qui era scritto a mano e ne riconosceva uno
 * solo, quello che il database vero non manda quasi mai.
 */
async function inserisciRichiesta(admin: SupabaseClient, payload: Record<string, unknown>) {
  const corrente = { ...payload };

  for (let tentativo = 1; tentativo <= 4; tentativo += 1) {
    const esito = await admin.from("demo_requests").insert(corrente).select("id").single<{ id: string }>();

    if (!esito.error) return { id: esito.data?.id ?? null, error: null };

    const nome = nomeDellaColonnaMancante(esito.error.message);

    if (!nome || !(nome in corrente)) return { id: null, error: esito.error };

    delete corrente[nome];
  }

  return { id: null, error: { message: "Troppe colonne mancanti nella tabella delle richieste." } };
}

export async function POST(request: Request) {
  const { errore, admin } = await serraturaLocale(request);
  if (errore || !admin) return errore ?? NextResponse.json({ error: "Non autorizzato." }, { status: 403 });

  let corpo: CorpoRichiesta;
  try {
    corpo = (await request.json()) as CorpoRichiesta;
  } catch {
    return NextResponse.json({ error: "Richiesta non leggibile." }, { status: 400 });
  }

  const dealershipName = testo(corpo.dealershipName);
  const contactName = testo(corpo.contactName);
  const email = testo(corpo.email).toLowerCase();
  const phone = testo(corpo.phone);
  const city = testo(corpo.city);
  const province = testo(corpo.province).toUpperCase();
  const planCode = normalizeDemoPlanCode(corpo.planCode);
  const vehicleCount = testo(corpo.vehicleCount) || "n.d.";
  const notes = testo(corpo.notes);

  // Gli stessi campi che il modulo pubblico pretende: l'attivazione li usa
  // tutti per costruire la concessionaria, e uno mancante la lascerebbe a
  // meta'. La provincia serve alla ricerca per distanza.
  const mancanti = [
    ["nome della concessionaria", dealershipName],
    ["referente", contactName],
    ["email", email],
    ["telefono", phone],
    ["citta", city],
    ["provincia", province],
  ]
    .filter(([, valore]) => !valore)
    .map(([campo]) => campo);

  if (mancanti.length > 0) {
    return NextResponse.json({ error: `Mancano questi dati: ${mancanti.join(", ")}.` }, { status: 400 });
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "L'indirizzo email non e valido." }, { status: 400 });
  }

  if (!planCode) {
    return NextResponse.json({ error: "Scegli un piano fra Base, Pro ed Elite." }, { status: 400 });
  }

  // Un account gia' esistente con questa email non si tocca: riattivarlo da
  // qui lo riporterebbe indietro a una prova, e con esso il piano che sta
  // pagando. Meglio fermarsi e dirlo.
  const gia = await admin.from("dealers").select("id, name, account_type").eq("email", email).maybeSingle<{
    id: string;
    name: string | null;
    account_type: string | null;
  }>();

  if (gia.error) {
    return NextResponse.json({ error: "Errore nella verifica degli account esistenti." }, { status: 500 });
  }

  if (gia.data) {
    return NextResponse.json(
      {
        error: `Esiste gia un account con questa email (${gia.data.name ?? "senza nome"}). Cambia il piano dalla scheda della concessionaria invece di attivarla di nuovo.`,
      },
      { status: 409 }
    );
  }

  // La nota non e' solo per chi legge: da qui l'attivazione riconosce che il
  // concessionario non ha chiesto nessuna prova, e gli manda una sola email --
  // quella per impostare la password -- invece delle due della demo.
  const nota = [NOTA_ATTIVAZIONE_DIRETTA, notes]
    .filter(Boolean)
    .join(" ");

  const inserimento = await inserisciRichiesta(admin, {
    dealership_name: dealershipName,
    company_name: dealershipName,
    contact_name: contactName,
    email,
    phone,
    city,
    province,
    vehicle_count: vehicleCount,
    interested_plan_code: planCode,
    message: nota,
    status: "pending",
  });

  if (inserimento.error || !inserimento.id) {
    console.error("attivazione-diretta:insert", inserimento.error);
    return NextResponse.json({ error: "Non e stato possibile creare la richiesta. Riprova." }, { status: 500 });
  }

  return NextResponse.json({ requestId: inserimento.id, planCode }, { status: 201 });
}
