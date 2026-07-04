import Link from "next/link";
import { VehicleCard } from "@/components/marketplace/vehicle-card";
import { getMarketplaceStatusFilter, publicSupabase, type MarketplaceVehicle } from "@/lib/public-marketplace";

export const dynamic = "force-dynamic";

export default async function MarketplaceCatalogPage() {
  const { data, error } = await publicSupabase
    .from("vehicles")
    .select("id, brand, model, version, year, registration_date, mileage, price, fuel, transmission, city, status, created_at, dealer_id, dealers(id, name, logo_url, legal_name), vehicle_images(image_url, position, is_cover)")
    .or(getMarketplaceStatusFilter())
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[36px] border border-slate-200 bg-white p-8 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-blue-600">Catalogo</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">Catalogo non disponibile</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">{error.message || "Non siamo riusciti a caricare il catalogo."}</p>
        </div>
      </main>
    );
  }

  const vehicles = (data ?? []) as MarketplaceVehicle[];

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <section className="rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)] sm:p-8 lg:p-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-blue-600">Catalogo veicoli</p>
              <h1 className="mt-3 text-4xl font-semibold text-slate-900">Tutti i veicoli pubblicati</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                Una vista ordinata dei veicoli disponibili sul marketplace pubblico della Dealer Platform.
              </p>
            </div>
            <Link href="/ricerca" className="inline-flex items-center justify-center rounded-3xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/20 transition hover:bg-slate-800">
              Ricerca avanzata
            </Link>
          </div>
        </section>

        {vehicles.length === 0 ? (
          <div className="rounded-[32px] border border-slate-200 bg-white p-8 text-slate-600 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
            Nessun veicolo pubblicato al momento.
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((vehicle) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
