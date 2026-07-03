import Link from "next/link";
import { formatMileage, formatPrice, formatText, publicSupabase, resolveDealerSlug, resolveVehicleImageUrl, resolveVehicleImages, resolveVehicleLabel, type MarketplaceDealer, type MarketplaceVehicle } from "@/lib/public-marketplace";

export const dynamic = "force-dynamic";

type DealerGroup = {
  dealerId: string;
  dealer: MarketplaceDealer | null;
  vehicles: MarketplaceVehicle[];
};

export default async function DealersListPage() {
  const { data, error } = await publicSupabase
    .from("vehicles")
    .select("id, brand, model, version, year, mileage, price, fuel, transmission, city, status, created_at, dealer_id, dealers(id, name, logo_url, legal_name), vehicle_images(image_url, position, is_cover)")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[36px] border border-slate-200 bg-white p-8 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-blue-600">Concessionarie</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">Elenco non disponibile</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">{error.message || "Non siamo riusciti a caricare l'elenco delle concessionarie."}</p>
        </div>
      </main>
    );
  }

  const vehicles = (data ?? []) as MarketplaceVehicle[];
  const groups = groupDealers(vehicles);

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <section className="rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)] sm:p-8 lg:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-blue-600">Concessionarie</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-900">Le concessionarie presenti nel marketplace</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Una panoramica delle concessionarie che hanno almeno un veicolo pubblicato.
          </p>
        </section>

        {groups.length === 0 ? (
          <div className="rounded-[32px] border border-slate-200 bg-white p-8 text-slate-600 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
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

  return (
    <article className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_90px_-40px_rgba(15,23,42,0.24)] transition hover:-translate-y-1 hover:shadow-[0_40px_120px_-40px_rgba(15,23,42,0.34)]">
      <div className="h-52 bg-slate-200">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={dealerName} className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="space-y-4 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-600">{group.vehicles.length} veicoli pubblicati</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">{dealerName}</h2>
          <p className="mt-2 text-sm text-slate-600">{cities.length > 0 ? cities.join(" • ") : "Città non disponibile"}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Spec label="Auto in vendita" value={String(group.vehicles.length)} />
          <Spec label="Prezzo minimo" value={formatPrice(Math.min(...group.vehicles.map((vehicle) => Number(vehicle.price ?? 0))))} />
          <Spec label="Km minimi" value={formatMileage(Math.min(...group.vehicles.map((vehicle) => Number(vehicle.mileage ?? 0))))} />
          <Spec label="Slug" value={dealerSlug} />
        </div>
        <div className="flex gap-2 pt-1">
          <Link href={`/concessionarie/${dealerSlug}`} className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">
            Apri
          </Link>
          {firstVehicle ? (
            <Link href={`/auto/${firstVehicle.id}`} className="inline-flex items-center justify-center rounded-3xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
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
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 font-semibold text-slate-900">{value}</p>
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
