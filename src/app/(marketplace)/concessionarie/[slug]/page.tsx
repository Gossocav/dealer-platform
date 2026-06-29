import Link from "next/link";
import { notFound } from "next/navigation";
import { createMarketplaceSlug, formatMileage, formatPrice, formatText, normalizeVehicleDealerName, publicSupabase, resolveDealerSlug, resolveVehicleImageUrl, resolveVehicleImages, resolveVehicleLabel, type MarketplaceVehicle } from "@/lib/public-marketplace";

export const dynamic = "force-dynamic";

export default async function DealerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const { data, error } = await publicSupabase
    .from("vehicles")
    .select("id, brand, model, version, year, mileage, price, fuel, transmission, city, status, created_at, dealer_id, dealers(id, name, logo_url, legal_name), vehicle_images(image_url, position, is_cover)")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) {
    notFound();
  }

  const vehicles = (data ?? []) as MarketplaceVehicle[];
  const dealerVehicles = vehicles.filter((vehicle) => resolveDealerSlug(vehicle.dealers) === slug || createMarketplaceSlug(normalizeVehicleDealerName(vehicle.dealers)) === slug);

  if (dealerVehicles.length === 0) {
    notFound();
  }

  const dealer = Array.isArray(dealerVehicles[0].dealers) ? dealerVehicles[0].dealers[0] ?? null : dealerVehicles[0].dealers ?? null;
  const dealerName = dealer?.name ?? dealer?.legal_name ?? "Concessionaria";
  const cities = Array.from(new Set(dealerVehicles.map((vehicle) => formatText(vehicle.city)).filter((value) => value !== "-")));
  const totalVehicles = dealerVehicles.length;

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <section className="rounded-[36px] border border-slate-200 bg-slate-950 px-8 py-10 text-white shadow-[0_40px_120px_-40px_rgba(15,23,42,0.55)] sm:px-10 sm:py-12 lg:px-12 lg:py-14">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-white/70">Concessionaria pubblica</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">{dealerName}</h1>
          <p className="mt-4 text-base leading-7 text-slate-300 sm:text-lg">
            {totalVehicles} veicoli pubblicati{cities.length > 0 ? ` • ${cities.join(" • ")}` : ""}
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-slate-500">Profilo concessionaria</p>
            <div className="mt-4 space-y-3">
              <InfoRow label="Slug" value={slug} />
              <InfoRow label="Veicoli pubblicati" value={String(totalVehicles)} />
              <InfoRow label="Città" value={cities.length > 0 ? cities.join(", ") : "-"} />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/concessionarie" className="inline-flex items-center justify-center rounded-3xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
                Tutte le concessionarie
              </Link>
              <Link href="/auto" className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700">
                Catalogo auto
              </Link>
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-slate-500">Veicoli della concessionaria</p>
            <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {dealerVehicles.map((vehicle) => (
                <DealerVehicleCard key={vehicle.id} vehicle={vehicle} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

async function DealerVehicleCard({ vehicle }: { vehicle: MarketplaceVehicle }) {
  const cover = resolveVehicleImages(vehicle.vehicle_images)[0] ?? null;
  const coverUrl = cover ? await resolveVehicleImageUrl(cover) : null;

  return (
    <article className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 transition hover:-translate-y-1 hover:bg-white hover:shadow-lg">
      <div className="h-44 bg-slate-200">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={resolveVehicleLabel(vehicle)} className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="space-y-3 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">{formatText(vehicle.city)}</p>
        <h2 className="text-lg font-semibold text-slate-900">{resolveVehicleLabel(vehicle)}</h2>
        <p className="text-sm text-slate-600">{formatText(vehicle.year)} • {formatText(vehicle.fuel)}</p>
        <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
          <span>{formatMileage(vehicle.mileage)}</span>
          <span>{formatPrice(vehicle.price)}</span>
        </div>
        <Link href={`/auto/${vehicle.id}`} className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">
          Visualizza
        </Link>
      </div>
    </article>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}
