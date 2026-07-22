import Link from "next/link";
import { MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES, MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES, formatPrice, formatText, logMarketplaceQueryError, publicSupabase, resolveDealerSlug, resolveVehicleImageUrl, resolveVehicleImages, type MarketplaceDealer, type MarketplaceVehicle } from "@/lib/public-marketplace";

export const dynamic = "force-dynamic";

const MARKETPLACE_DEALERS_VEHICLES_LIMIT = 240;

type DealerGroup = {
  dealerId: string;
  dealer: MarketplaceDealer | null;
  vehicles: MarketplaceVehicle[];
};

export default async function DealersListPage() {
  const { data, error } = await publicSupabase
    .from("vehicles")
    .select("id, brand, model, version, year, mileage, price, fuel, transmission, city, status, created_at, dealer_id, dealers!inner(id, name, logo_url, legal_name, status), vehicle_images(image_url, position, is_cover)")
    .eq("published", true)
    .in("status", MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES)
    .in("dealers.status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES)
    .order("created_at", { ascending: false })
    .limit(MARKETPLACE_DEALERS_VEHICLES_LIMIT);

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
  const groups = groupDealers(vehicles);

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
  const cities = Array.from(new Set(group.vehicles.map((vehicle) => formatText(vehicle.city)).filter((value) => value !== "-")));
  const prices = group.vehicles.map((vehicle) => Number(vehicle.price ?? 0)).filter((price) => price > 0);
  const avgPrice = prices.length > 0 ? prices.reduce((sum, price) => sum + price, 0) / prices.length : 0;
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;

  return (
    <article className="group overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/70 to-slate-900 transition hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_30px_90px_-40px_rgba(0,0,0,0.7)]">
      <div className="relative h-52 overflow-hidden bg-gradient-to-br from-slate-700 via-slate-900 to-slate-950">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={dealerName} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
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
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">{group.vehicles.length} veicoli pubblicati</p>
          <h2 className="mt-2 text-xl font-bold text-white">{dealerName}</h2>
          <p className="mt-2 text-sm text-slate-400">{cities.length > 0 ? cities.join(" • ") : "Città non disponibile"}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Spec label="Prezzo medio" value={formatPrice(avgPrice)} />
          <Spec label="Prezzo minimo" value={formatPrice(minPrice)} />
        </div>
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

function groupDealers(vehicles: MarketplaceVehicle[]) {
  const map = new Map<string, DealerGroup>();

  for (const vehicle of vehicles) {
    const dealer = Array.isArray(vehicle.dealers) ? vehicle.dealers[0] ?? null : vehicle.dealers ?? null;
    const dealerId = String(vehicle.dealer_id ?? dealer?.id ?? resolveDealerSlug(vehicle.dealers));
    if (!map.has(dealerId)) {
      map.set(dealerId, { dealerId, dealer, vehicles: [] });
    }

    map.get(dealerId)?.vehicles.push(vehicle);
  }

  return [...map.values()].sort((a, b) => b.vehicles.length - a.vehicles.length);
}
