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
    <article className="group overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_90px_-40px_rgba(15,23,42,0.22)] transition hover:-translate-y-1 hover:shadow-[0_40px_120px_-40px_rgba(15,23,42,0.34)]">
      <div className="relative h-52 overflow-hidden bg-slate-200">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={vehicleLabel} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
            <svg viewBox="0 0 64 64" aria-hidden="true" className="h-14 w-14 fill-current opacity-40">
              <path d="M12 18a8 8 0 0 0-8 8v13a8 8 0 0 0 8 8h4a7 7 0 0 0 14 0h4a7 7 0 0 0 14 0h4a8 8 0 0 0 8-8V26a8 8 0 0 0-8-8h-4.6a3 3 0 0 1-2.5-1.3l-1.8-2.8A6 6 0 0 0 38 12H26a6 6 0 0 0-5 2.7l-1.8 2.8A3 3 0 0 1 16.6 19H12Zm10 25a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm20 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />
            </svg>
            <span className="text-xs font-medium tracking-wide">Immagine non disponibile</span>
          </div>
        )}
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            {dealerLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dealerLogo} alt={dealerName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[9px] font-bold text-slate-500">DP</div>
            )}
          </div>
          <p className="truncate text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">{dealerName}</p>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-slate-900">{vehicleLabel}</h3>
          <p className="mt-2 text-sm text-slate-600">{formatText(vehicle.city)}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Spec label="DATA IMM.NE" value={registrationDate} />
          <Spec label="PREZZO" value={formatPrice(vehicle.price)} />
          <Spec label="KM" value={formatMileage(vehicle.mileage)} />
          <Spec label="CAMBIO" value={formatText(vehicle.transmission)} />
        </div>

        <div className="flex gap-2 pt-1">
          <Link href={`/auto/${vehicle.id}`} className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">
            Visualizza
          </Link>
          <Link href={`/concessionarie/${dealerSlug}`} className="inline-flex items-center justify-center rounded-3xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
            Concessionaria
          </Link>
        </div>
      </div>
    </article>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-full min-h-[5.1rem] flex-col justify-start rounded-2xl bg-slate-50 px-4 py-2.5">
      <p className="text-[11px] font-semibold uppercase leading-tight tracking-[0.18em] whitespace-normal break-words text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold leading-tight break-words text-slate-900">{value}</p>
    </div>
  );
}
