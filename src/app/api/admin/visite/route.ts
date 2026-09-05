import { NextResponse } from "next/server";
import { contestoAmministratore } from "@/lib/admin-api-context";
import { caricaTutto } from "@/lib/carica-tutto";
import {
  andamentoGiornaliero,
  annunciPiuVisti,
  giornoMenoGiorni,
  visitePerConcessionaria,
  type RigaDiVisita,
} from "@/lib/statistiche-visite";

/**
 * Le visite di ogni concessionaria, per il pannello amministrativo.
 *
 * Chiesto dal titolare il 05/09/2026. Restituisce tutto in una risposta sola
 * -- quadro per concessionaria, andamento e automobili piu' viste -- perche'
 * i dati sono pochi e una schermata che fa quattro richieste in fila e' una
 * schermata che si vede caricare a pezzi.
 */

export const dynamic = "force-dynamic";

/** Quanti giorni si guardano indietro. Trenta e' la finestra piu' lunga mostrata. */
const GIORNI = 30;

type RigaDealer = { id: string; name: string | null; legal_name: string | null; status: string | null };
type RigaLead = { dealer_id: string | null };
type RigaVeicolo = { id: string; brand: string | null; model: string | null; version: string | null };

/** Il giorno italiano, lo stesso che scrive il database. */
function oggiInItalia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function GET(request: Request) {
  try {
    const contesto = await contestoAmministratore(request);
    if (contesto.errore) return contesto.errore;

    const supabase = contesto.supabaseAdmin;
    const oggi = oggiInItalia();
    const da = giornoMenoGiorni(oggi, GIORNI - 1);

    // Trenta giorni per 250 annunci fanno fino a settemilacinquecento righe, e
    // il database ne consegna mille per richiesta senza dirlo: senza
    // `caricaTutto` il pannello mostrerebbe i primi mille giorni-vettura e
    // direbbe che le visite sono meno di quelle vere.
    const visite = await caricaTutto<RigaDiVisita>(async (inizio, fine) => {
      const { data, error } = await supabase
        .from("marketplace_views")
        .select("dealer_id, vehicle_id, view_day, views_count")
        .gte("view_day", da)
        .order("view_day", { ascending: false })
        .range(inizio, fine);

      return { data: (data ?? []) as RigaDiVisita[], error };
    });

    if (visite.error) {
      return NextResponse.json(
        { error: visite.error.message || "Errore nella lettura delle visite." },
        { status: 500 }
      );
    }

    const concessionarie = await supabase
      .from("dealers")
      .select("id, name, legal_name, status")
      .returns<RigaDealer[]>();

    if (concessionarie.error) {
      return NextResponse.json(
        { error: concessionarie.error.message || "Errore nella lettura delle concessionarie." },
        { status: 500 }
      );
    }

    // Le richieste ricevute nello stesso periodo. Accanto alle visite dicono
    // la cosa che serve davvero: quante visite servono per un contatto.
    const contatti = await supabase
      .from("leads")
      .select("dealer_id")
      .gte("created_at", `${da}T00:00:00Z`)
      .returns<RigaLead[]>();

    // Un errore qui non fa fallire la schermata: si resta senza il rapporto,
    // che e' un dato mancante e non un dato falso.
    const contattiPerDealer: Record<string, number> = {};
    if (!contatti.error) {
      for (const riga of contatti.data ?? []) {
        const chiave = String(riga.dealer_id ?? "").trim();
        if (chiave) contattiPerDealer[chiave] = (contattiPerDealer[chiave] ?? 0) + 1;
      }
    }

    const elenco = (concessionarie.data ?? []).map((riga) => ({
      id: riga.id,
      nome: String(riga.legal_name ?? riga.name ?? "").trim() || "Concessionaria senza nome",
    }));

    const quadri = visitePerConcessionaria({
      righe: visite.righe,
      concessionarie: elenco,
      contattiPerDealer,
      oggi,
    });

    // Le automobili piu' viste di ciascuna, con il nome invece del codice.
    const classifiche = new Map(quadri.map((q) => [q.dealerId, annunciPiuVisti({ righe: visite.righe, dealerId: q.dealerId, oggi })]));
    const idDaNominare = Array.from(new Set(Array.from(classifiche.values()).flat().map((v) => v.vehicleId)));

    const nomi = new Map<string, string>();
    if (idDaNominare.length > 0) {
      const veicoli = await supabase
        .from("vehicles")
        .select("id, brand, model, version")
        .in("id", idDaNominare)
        .returns<RigaVeicolo[]>();

      for (const riga of veicoli.data ?? []) {
        nomi.set(riga.id, [riga.brand, riga.model, riga.version].filter(Boolean).join(" ").trim());
      }
    }

    return NextResponse.json(
      {
        oggi,
        giorni: GIORNI,
        troncato: visite.troncato,
        concessionarie: quadri.map((quadro) => ({
          ...quadro,
          annunciPiuVisti: (classifiche.get(quadro.dealerId) ?? []).map((annuncio) => ({
            ...annuncio,
            // Un annuncio cancellato dopo essere stato visto non ha piu' un
            // nome: si mostra che e' stato tolto, invece di una riga vuota.
            etichetta: nomi.get(annuncio.vehicleId) || "Annuncio non piu' disponibile",
          })),
        })),
        andamento: andamentoGiornaliero({ righe: visite.righe, oggi, giorni: GIORNI }),
      },
      { status: 200 }
    );
  } catch (errore) {
    console.error("admin/visite: errore imprevisto", {
      errorType: "unexpected",
      message: errore instanceof Error ? errore.message : String(errore),
    });
    return NextResponse.json({ error: "Errore imprevisto." }, { status: 500 });
  }
}
