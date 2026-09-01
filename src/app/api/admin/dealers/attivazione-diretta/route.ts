import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";
import { normalizeDemoPlanCode } from "@/lib/demo-plan-catalog";

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

function estraiToken(authHeader: string | null) {
  if (!authHeader) return null;
  const [schema, token] = authHeader.split(" ");
  return schema?.toLowerCase() === "bearer" && token ? token : null;
}

async function contestoAmministratore(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return { errore: NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 }), admin: null } as const;
  }

  const token = estraiToken(request.headers.get("authorization"));
  if (!token) {
    return { errore: NextResponse.json({ error: "Sessione non valida." }, { status: 401 }), admin: null } as const;
  }

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return { errore: NextResponse.json({ error: "Utente non autenticato." }, { status: 401 }), admin: null } as const;
  }

  let autorizzato = isPlatformAdminRole(resolveUserRoleFromMetadata(data.user));

  if (!autorizzato) {
    const profilo = await admin.from("profiles").select("role").eq("id", data.user.id).maybeSingle<{ role: string | null }>();
    if (profilo.error) {
      return { errore: NextResponse.json({ error: "Errore verifica autorizzazioni." }, { status: 500 }), admin: null } as const;
    }
    autorizzato = isPlatformAdminRole(profilo.data?.role);
  }

  if (!autorizzato) {
    return { errore: NextResponse.json({ error: "Non autorizzato." }, { status: 403 }), admin: null } as const;
  }

  return { errore: null, admin } as const;
}

/**
 * Scrive la richiesta togliendo le colonne che questo database non ha.
 *
 * Lo schema di produzione e' andato alla deriva rispetto alle migration piu'
 * di una volta: `province` e `dealership_name` esistono qui e potrebbero non
 * esistere altrove. Invece di far fallire l'attivazione per una colonna
 * accessoria, si toglie quella e si riprova -- e' lo stesso accorgimento del
 * modulo pubblico di richiesta prova.
 */
async function inserisciRichiesta(admin: SupabaseClient, payload: Record<string, unknown>) {
  const corrente = { ...payload };

  for (let tentativo = 1; tentativo <= 4; tentativo += 1) {
    const esito = await admin.from("demo_requests").insert(corrente).select("id").single<{ id: string }>();

    if (!esito.error) return { id: esito.data?.id ?? null, error: null };

    const colonnaMancante = /column "([a-z_]+)" of relation "demo_requests" does not exist/i.exec(esito.error.message ?? "");
    const nome = colonnaMancante?.[1];

    if (!nome || !(nome in corrente)) return { id: null, error: esito.error };

    delete corrente[nome];
  }

  return { id: null, error: { message: "Troppe colonne mancanti nella tabella delle richieste." } };
}

export async function POST(request: Request) {
  const { errore, admin } = await contestoAmministratore(request);
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

  const nota = [
    "Attivazione diretta dal pannello amministrativo: la concessionaria non ha chiesto la prova.",
    notes,
  ]
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
