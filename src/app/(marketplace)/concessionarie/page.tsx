import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES,
  MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES,
  formatPrice,
  logMarketplaceQueryError,
  publicSupabase,
  resolveDealerLocality,
  resolveDealerSlug,
  resolveVehicleImages,
  toAbsoluteUrl,
  type MarketplaceDealer,
  type MarketplaceVehicle,
} from "@/lib/public-marketplace";
import { resolveVehicleImageUrl } from "@/lib/marketplace-foto-firmate";
import { tabellaNonAncoraCreata } from "@/lib/tabella-mancante";

// Cinque minuti: l'elenco delle concessionarie cambia molto piu' di rado del
// catalogo dei veicoli.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Concessionarie partner",
  description:
    "Le concessionarie verificate di KeyAuto: sfoglia i partner in tutta Italia e i veicoli che ognuno ha pubblicato.",
  alternates: { canonical: toAbsoluteUrl("/concessionarie") },
  openGraph: {
    title: "Concessionarie partner | KeyAuto",
    description: "Le concessionarie verificate di KeyAuto, con i veicoli pubblicati da ognuna.",
    url: toAbsoluteUrl("/concessionarie"),
    type: "website",
    images: ["/opengraph-image"],
  },
};

/**
 * Le automobili che si scaricano, e a cosa servono **adesso**.
 *
 * Servivano a due cose e una delle due era sbagliata: facevano da copertina
 * alle schede, e da questo elenco si contavano i veicoli di ogni
 * concessionaria e se ne calcolavano i prezzi. Al 19/09/2026 le pubblicate
 * erano 279 e questo tetto 240: **i numeri a video erano falsi** --
 * AUTOGEPY mostrava 114 automobili invece di 135, e il prezzo minimo di De
 * Lorenzi 7.500 euro invece di 5.800.
 *
 * Adesso i numeri li conta il database (`vetrina_per_concessionaria`) e
 * questo elenco serve **solo alle fotografie**. Il tetto resta, ma quello
 * che si perde superandolo e' una copertina, non un numero: una
 * concessionaria oltre il taglio compare lo stesso, con i suoi numeri giusti
 * e senza immagine.
 */
const COPERTINE_DA_SCARICARE = 240;

type DealerGroup = {
  dealerId: string;
  dealer: MarketplaceDealer | null;
  /** Solo per la copertina e per il collegamento "Primo veicolo". */
  vehicles: MarketplaceVehicle[];
  /** I numeri contati dal database. `null` se la vista non c'e' ancora. */
  numeri: NumeriVetrina | null;
};

type NumeriVetrina = {
  veicoli_pubblicati: number;
  prezzo_medio: number | null;
  prezzo_minimo: number | null;
};

/**
 * I numeri di ogni concessionaria, contati dal database.
 *
 * Torna `null` -- e non un elenco vuoto -- quando la vista non esiste
 * ancora: in questo progetto le modifiche al database le applica a mano il
 * titolare, quindi c'e' sempre una finestra fra il codice in linea e la
 * vista creata. Dentro quella finestra la pagina mostra le concessionarie
 * **senza numeri**, che e' la risposta onesta: meglio nessun numero che uno
 * sbagliato.
 */
async function numeriDellaVetrina(): Promise<Map<string, NumeriVetrina> | null> {
  const { data, error } = await publicSupabase
    .from("vetrina_per_concessionaria")
    .select("dealer_id, veicoli_pubblicati, prezzo_medio, prezzo_minimo");

  if (error) {
    if (tabellaNonAncoraCreata(error.message, "vetrina_per_concessionaria")) return null;
    logMarketplaceQueryError("dealers-list-numeri", error);
    return null;
  }

  const per = new Map<string, NumeriVetrina>();
  for (const riga of (data ?? []) as Array<Record<string, unknown>>) {
    const id = String(riga.dealer_id ?? "").trim();
    if (!id) continue;
    per.set(id, {
      veicoli_pubblicati: Number(riga.veicoli_pubblicati ?? 0),
      prezzo_medio: riga.prezzo_medio === null || riga.prezzo_medio === undefined ? null : Number(riga.prezzo_medio),
      prezzo_minimo: riga.prezzo_minimo === null || riga.prezzo_minimo === undefined ? null : Number(riga.prezzo_minimo),
    });
  }
  return per;
}

export default async function DealersListPage() {
  const numeri = await numeriDellaVetrina();
  const { data, error } = await publicSupabase
    .from("vehicles")
    .select("id, brand, model, version, year, mileage, price, fuel, transmission, city, status, created_at, dealer_id, dealers!inner(id, name, logo_url, legal_name, status, city, province), vehicle_images(image_url, position, is_cover)")
    .eq("published", true)
    .in("status", MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES)
    .in("dealers.status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES)
    .order("created_at", { ascending: false })
    .limit(COPERTINE_DA_SCARICARE);

  if (error) {
    logMarketplaceQueryError("dealers-list", error);
    return (
      <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[36px] border border-white/10 bg-gradient-to-b from-slate-800/80 to-slate-950 p-8 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)]">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-300">Concessionarie</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Elenco non disponibile</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">{error.message || "Non siamo riusciti a caricare l'elenco delle concessionarie."}</p>
        </div>
      </main>
    );
  }

  const vehicles = (data ?? []) as unknown as MarketplaceVehicle[];
  const groups = groupDealers(vehicles, numeri);

  return (
    <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <section className="relative overflow-hidden rounded-[36px] border border-white/10 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-6 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)] sm:p-8 lg:p-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(76,130,247,0.5), transparent 70%)" }}
          />
          <p className="relative text-sm font-semibold uppercase tracking-[0.32em] text-cyan-300">Concessionarie</p>
          <h1 className="relative mt-3 text-4xl font-extrabold tracking-tight" style={{ textWrap: "balance" }}>
            Le concessionarie presenti nel marketplace
          </h1>
          <p className="relative mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Una panoramica delle concessionarie che hanno almeno un veicolo pubblicato su KeyAuto.
          </p>
        </section>

        {groups.length === 0 ? (
          <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-8 text-center text-slate-400">
            Nessuna concessionaria pubblica al momento.
          </div>
        ) : (
          <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {groups.map((group) => (
              <DealerCard key={group.dealerId} group={group} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

async function DealerCard({ group }: { group: DealerGroup }) {
  const firstVehicle = group.vehicles[0];
  const cover = firstVehicle ? resolveVehicleImages(firstVehicle.vehicle_images)[0] ?? null : null;
  const coverUrl = cover ? await resolveVehicleImageUrl(cover) : null;
  const dealerName = group.dealer?.legal_name ?? group.dealer?.name ?? "Concessionaria";
  const dealerSlug = resolveDealerSlug(group.dealer ? [group.dealer] : null);
  // La sede della concessionaria, non le citta' scritte sui suoi veicoli:
  // erano compilate una per auto e potevano dire tutt'altro.
  const dealerLocality = resolveDealerLocality(group.dealer ? [group.dealer] : null);
  const cities = dealerLocality ? [dealerLocality] : [];
  // **Nessun numero si ricava piu' dalle automobili scaricate.** Se la vista
  // non c'e' ancora, la scheda non mostra numeri: meglio nessuno che uno
  // sbagliato, ed e' la stessa regola del costo totale e dello storico finto.
  const numeri = group.numeri;

  return (
    <article className="group overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/70 to-slate-900 transition hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_30px_90px_-40px_rgba(0,0,0,0.7)]">
      <div className="relative h-52 overflow-hidden bg-gradient-to-br from-slate-700 via-slate-900 to-slate-950">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={dealerName}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-600">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-14 w-14 fill-current opacity-40">
              <path d="M3 9.5 4.5 4h15L21 9.5" />
              <path d="M4 9.5V20h16V9.5" />
            </svg>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-950/80 to-transparent" />
      </div>
      <div className="space-y-4 p-5">
        <div>
          {numeri ? (
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
              {numeri.veicoli_pubblicati} {numeri.veicoli_pubblicati === 1 ? "veicolo pubblicato" : "veicoli pubblicati"}
            </p>
          ) : null}
          <h2 className="mt-2 text-xl font-bold text-white">{dealerName}</h2>
          <p className="mt-2 text-sm text-slate-400">{cities.length > 0 ? cities.join(" • ") : "Città non disponibile"}</p>
        </div>
        {numeri && (numeri.prezzo_medio !== null || numeri.prezzo_minimo !== null) ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Spec label="Prezzo medio" value={numeri.prezzo_medio === null ? "—" : formatPrice(numeri.prezzo_medio)} />
            <Spec label="Prezzo minimo" value={numeri.prezzo_minimo === null ? "—" : formatPrice(numeri.prezzo_minimo)} />
          </div>
        ) : null}
        <div className="flex gap-2 pt-1">
          <Link
            href={`/concessionarie/${dealerSlug}`}
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:brightness-105"
          >
            Apri profilo
          </Link>
          {firstVehicle ? (
            <Link
              href={`/auto/${firstVehicle.id}`}
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
            >
              Primo veicolo
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 font-semibold text-white">{value}</p>
    </div>
  );
}

function groupDealers(vehicles: MarketplaceVehicle[], numeri: Map<string, NumeriVetrina> | null) {
  const map = new Map<string, DealerGroup>();

  for (const vehicle of vehicles) {
    const dealer = Array.isArray(vehicle.dealers) ? vehicle.dealers[0] ?? null : vehicle.dealers ?? null;
    const dealerId = String(vehicle.dealer_id ?? dealer?.id ?? resolveDealerSlug(vehicle.dealers));
    if (!map.has(dealerId)) {
      map.set(dealerId, { dealerId, dealer, vehicles: [], numeri: numeri?.get(dealerId) ?? null });
    }

    map.get(dealerId)?.vehicles.push(vehicle);
  }

  // L'ordine segue **i numeri veri**, non quante automobili sono finite
  // nell'elenco delle copertine: con il tetto a 240 una concessionaria
  // grande poteva comparire dopo una piu' piccola.
  return [...map.values()].sort(
    (a, b) => (b.numeri?.veicoli_pubblicati ?? b.vehicles.length) - (a.numeri?.veicoli_pubblicati ?? a.vehicles.length),
  );
}
