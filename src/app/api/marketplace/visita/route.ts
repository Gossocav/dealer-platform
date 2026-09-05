import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { hitRateLimit } from "@/lib/api-rate-limit";
import {
  FRENO_COMPLESSIVO,
  FRENO_PER_PAGINA,
  leggiRichiestaDiVisita,
  sembraUnRobot,
} from "@/lib/visite-annunci";

/**
 * Registra una visita a un annuncio o alla pagina di una concessionaria.
 *
 * Lo chiama il browser di chi sta guardando, non il server che disegna la
 * pagina: le pagine degli annunci stanno in cache, e un contatore dentro la
 * pagina scatterebbe una volta al minuto per vettura invece che una per
 * persona. Il perche' per esteso sta in `src/lib/visite-annunci.ts`.
 *
 * **Non viene conservato niente di chi visita.** L'indirizzo di rete si usa
 * solo come chiave in memoria per i due freni, e sparisce con il processo:
 * nel database finisce un numero per vettura e per giorno, nient'altro.
 *
 * La risposta e' sempre vuota. Chi chiama sta disegnando una pagina, non ha
 * niente da fare con l'esito, e dire "questa non l'ho contata" servirebbe
 * solo a chi sta provando a gonfiare i numeri.
 */

export const dynamic = "force-dynamic";

function indirizzoDiRete(request: Request) {
  const inoltrato = request.headers.get("x-forwarded-for");
  if (inoltrato) {
    const primo = inoltrato.split(",")[0]?.trim();
    if (primo) return primo;
  }

  return request.headers.get("x-real-ip")?.trim() || request.headers.get("cf-connecting-ip")?.trim() || "";
}

export async function POST(request: Request) {
  try {
    const corpo = await request.json().catch(() => null);
    const richiesta = leggiRichiestaDiVisita(corpo);

    if (!richiesta) {
      return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
    }

    // Da qui in poi non si risponde mai di no: una visita non contata e una
    // contata si assomigliano, e chi guarda la pagina non deve accorgersi di
    // niente in nessuno dei due casi.
    const vuota = new NextResponse(null, { status: 204 });

    if (sembraUnRobot(request.headers.get("user-agent"))) {
      return vuota;
    }

    const rete = indirizzoDiRete(request) || "sconosciuto";
    if (hitRateLimit(`visita:${rete}:${richiesta.id}`, FRENO_PER_PAGINA).limited) return vuota;
    if (hitRateLimit(`visita:${rete}`, FRENO_COMPLESSIVO).limited) return vuota;

    const indirizzoSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const chiaveDiServizio = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!indirizzoSupabase || !chiaveDiServizio) {
      console.error("visita: configurazione Supabase incompleta", { errorType: "missing_env" });
      return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
    }

    // La chiave di servizio e' l'unica che puo' scrivere qui: le due funzioni
    // sono negate ad anon e ad authenticated proprio perche' con la chiave
    // pubblica del sito si potrebbero gonfiare i numeri di chiunque.
    const supabase = createClient(indirizzoSupabase, chiaveDiServizio, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { error } = await supabase.rpc(
      richiesta.tipo === "annuncio" ? "registra_visita_annuncio" : "registra_visita_concessionaria",
      richiesta.tipo === "annuncio" ? { p_vehicle_id: richiesta.id } : { p_dealer_id: richiesta.id }
    );

    if (error) {
      // Una visita persa non e' un guasto da mostrare a chi sta guardando
      // un'automobile: si annota e si tira dritto.
      console.error("visita: conteggio non riuscito", { errorType: "rpc_failed", message: error.message });
    }

    return vuota;
  } catch (errore) {
    console.error("visita: errore imprevisto", {
      errorType: "unexpected",
      message: errore instanceof Error ? errore.message : String(errore),
    });
    return NextResponse.json({ error: "Errore imprevisto." }, { status: 500 });
  }
}
