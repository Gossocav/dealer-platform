import Link from "next/link";
import {
  formatMileage,
  formatPrice,
  formatText,
  normalizeVehicleDealerName,
  resolveDealerLogo,
  resolveDealerSlug,
  resolveVehicleImageUrl,
  resolveVehicleImages,
  resolveVehicleLabel,
  resolveVehicleRegistrationDate,
  type MarketplaceVehicle,
} from "@/lib/public-marketplace";

type VehicleCardProps = {
  vehicle: MarketplaceVehicle;
};

export async function VehicleCard({ vehicle }: VehicleCardProps) {
  const cover = resolveVehicleImages(vehicle.vehicle_images)[0] ?? null;
  const coverUrl = cover ? await resolveVehicleImageUrl(cover) : null;
  const dealerLogo = resolveDealerLogo(vehicle.dealers);
  const dealerName = formatText(normalizeVehicleDealerName(vehicle.dealers));
  const dealerSlug = resolveDealerSlug(vehicle.dealers);
  const vehicleLabel = resolveVehicleLabel(vehicle);
  const registrationDate = resolveVehicleRegistrationDate(vehicle);

  return (
    <article className="group overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-b from-slate-800/70 to-slate-900 transition hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_30px_90px_-40px_rgba(0,0,0,0.7)]">
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-slate-700 via-slate-900 to-slate-950">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={vehicleLabel} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-600">
            <svg viewBox="0 0 64 64" aria-hidden="true" className="h-14 w-14 fill-current opacity-40">
              <path d="M12 18a8 8 0 0 0-8 8v13a8 8 0 0 0 8 8h4a7 7 0 0 0 14 0h4a7 7 0 0 0 14 0h4a8 8 0 0 0 8-8V26a8 8 0 0 0-8-8h-4.6a3 3 0 0 1-2.5-1.3l-1.8-2.8A6 6 0 0 0 38 12H26a6 6 0 0 0-5 2.7l-1.8 2.8A3 3 0 0 1 16.6 19H12Zm10 25a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm20 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />
            </svg>
            <span className="text-xs font-medium tracking-wide">Immagine non disponibile</span>
          </div>
        )}
        {formatText(vehicle.fuel) !== "-" ? (
          <span className="absolute right-3 top-3 rounded-full bg-gradient-to-br from-emerald-300 to-cyan-300 px-3 py-1 text-xs font-bold text-slate-950">
            {formatText(vehicle.fuel)}
          </span>
        ) : null}
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="min-w-0 truncate text-lg font-bold text-white">{vehicleLabel}</h3>
        </div>

        <div className="flex flex-wrap gap-2">
          <Tag>{registrationDate}</Tag>
          <Tag>{formatMileage(vehicle.mileage)}</Tag>
          <Tag>{formatText(vehicle.transmission)}</Tag>
          <Tag>{formatText(vehicle.city)}</Tag>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-4">
          <div className="min-w-0">
            <span className="block text-xl font-extrabold tracking-tight text-white">{formatPrice(vehicle.price)}</span>
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded border border-white/10 bg-white/[0.04] text-[7px] font-bold text-slate-400">
                {dealerLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={dealerLogo} alt={dealerName} className="h-full w-full object-cover" />
                ) : (
                  "KA"
                )}
              </span>
              <span className="truncate">{dealerName}</span>
            </span>
          </div>
          <div className="flex flex-none gap-2">
            <Link
              href={`/auto/${vehicle.id}`}
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:brightness-105"
            >
              Vedi
            </Link>
            <Link
              href={`/concessionarie/${dealerSlug}`}
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
              aria-label={`Vai alla concessionaria ${dealerName}`}
              title={`Vai alla concessionaria ${dealerName}`}
            >
              <StoreIcon />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function StoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[2]" aria-hidden="true">
      <path d="M3 9.5 4.5 4h15L21 9.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 9.5V20h16V9.5M9 20v-6h6v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-slate-300">{children}</span>;
}
