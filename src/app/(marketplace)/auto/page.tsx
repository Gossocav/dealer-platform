import Link from "next/link";
import { formatMileage, formatPrice, formatText, getMarketplaceStatusFilter, normalizeVehicleDealerName, publicSupabase, resolveDealerLogo, resolveVehicleImageUrl, resolveVehicleImages, resolveVehicleLabel, resolveVehicleRegistrationDate, type MarketplaceVehicle } from "@/lib/public-marketplace";

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
              <CatalogVehicleCard key={vehicle.id} vehicle={vehicle} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

async function CatalogVehicleCard({ vehicle }: { vehicle: MarketplaceVehicle }) {
  // Ordina: is_cover prima, poi per posizione. Il primo elemento è già la copertina
  // o la prima immagine disponibile se nessuna è marcata is_cover.
  const images = resolveVehicleImages(vehicle.vehicle_images);
  const coverUrl = images[0] ? await resolveVehicleImageUrl(images[0]) : null;
  const dealerLogo = resolveDealerLogo(vehicle.dealers);
  const dealerName = formatText(normalizeVehicleDealerName(vehicle.dealers));
  const label = resolveVehicleLabel(vehicle);
  const registrationDate = resolveVehicleRegistrationDate(vehicle);

  return (
    <article className="group overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_-20px_rgba(15,23,42,0.22)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_80px_-20px_rgba(15,23,42,0.32)]">
      {/* Immagine copertina */}
      <div className="relative h-44 overflow-hidden bg-slate-100">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={label}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
            <svg viewBox="0 0 64 64" aria-hidden="true" className="h-14 w-14 fill-current opacity-40">
              <path d="M12 18a8 8 0 0 0-8 8v13a8 8 0 0 0 8 8h4a7 7 0 0 0 14 0h4a7 7 0 0 0 14 0h4a8 8 0 0 0 8-8V26a8 8 0 0 0-8-8h-4.6a3 3 0 0 1-2.5-1.3l-1.8-2.8A6 6 0 0 0 38 12H26a6 6 0 0 0-5 2.7l-1.8 2.8A3 3 0 0 1 16.6 19H12Zm10 25a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm20 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />
            </svg>
            <span className="text-xs font-medium tracking-wide">Immagine non disponibile</span>
          </div>
        )}
        {/* Badge prezzo */}
        <div className="absolute left-3 top-3 rounded-full bg-slate-950/85 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
          {formatPrice(vehicle.price)}
        </div>
      </div>

      {/* Contenuto card */}
      <div className="space-y-3 p-4">
        {/* Dealer */}
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            {dealerLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dealerLogo} alt={dealerName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[9px] font-bold text-slate-500">DP</div>
            )}
          </div>
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-600">{dealerName}</p>
        </div>

        {/* Titolo */}
        <div>
          <h2 className="text-base font-semibold leading-snug text-slate-900">{label}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{formatText(vehicle.city)}</p>
        </div>

        {/* Specifiche */}
        <div className="grid grid-cols-2 gap-2">
          <Spec label="DATA IMM.NE" value={registrationDate} />
          <Spec label="Km" value={formatMileage(vehicle.mileage)} />
          <Spec label="Carb." value={formatText(vehicle.fuel)} />
          <Spec label="Cambio" value={formatText(vehicle.transmission)} />
        </div>

        {/* CTA */}
        <div className="border-t border-slate-100 pt-3">
          <Link
            href={`/auto/${vehicle.id}`}
            className="inline-flex w-full items-center justify-center rounded-3xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700"
          >
            Visualizza
          </Link>
        </div>
      </div>
    </article>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-1 text-xs font-semibold text-slate-800 truncate">{value}</p>
    </div>
  );
}
