import Link from "next/link";
import {
  formatMileage,
  formatPrice,
  formatText,
  normalizeVehicleDealerName,
  resolveDealerLocality,
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
    <article className="group relative overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-b from-slate-800/70 to-slate-900 transition hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_30px_90px_-40px_rgba(0,0,0,0.7)]">
      <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-slate-700 via-slate-900 to-slate-950">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={vehicleLabel} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
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
          {/* line-clamp-2 (not a single-line truncate) so a longer brand +
              model + version combination stays readable across two lines
              instead of getting cut off after only a few words. min-h keeps
              every card the same height regardless of whether the title
              actually needs one line or two. */}
          <h3 className="min-h-[3.5rem] min-w-0 line-clamp-2 text-lg font-bold text-white">
            <Link href={`/auto/${vehicle.id}`} className="after:absolute after:inset-0 after:content-['']">
              {vehicleLabel}
            </Link>
          </h3>
        </div>

        <div className="flex flex-wrap gap-2">
          <Tag>{registrationDate}</Tag>
          <Tag>{formatMileage(vehicle.mileage)}</Tag>
          <Tag>{formatText(vehicle.transmission)}</Tag>
          <Tag>{formatText(resolveDealerLocality(vehicle.dealers))}</Tag>
        </div>

        <div className="border-t border-white/10 pt-4">
          <span className="block text-xl font-extrabold tracking-tight text-white">{formatPrice(vehicle.price)}</span>

          {/* Il nome della concessionaria e' il collegamento alla sua vetrina.
              Prima c'era un'iconcina a forma di negozio: funzionava, ma nessuno
              poteva indovinarlo. Il suggerimento del browser che la spiegava
              compare solo tenendoci sopra il puntatore, cosa che su telefono
              non esiste -- quindi su mobile era una scorciatoia invisibile.
              Toccare il nome di un venditore e' invece una convenzione che non
              ha bisogno di spiegazioni.

              z-10 la tiene sopra il collegamento che copre tutta la scheda:
              senza, il tocco aprirebbe l'auto e questa non si raggiungerebbe.
              py-1.5 allarga l'area toccabile, che sul solo testo sarebbe alta
              16 px -- troppo poco per un dito. */}
          <Link
            href={`/concessionarie/${dealerSlug}`}
            className="relative z-10 mt-0.5 inline-flex max-w-full items-center gap-1.5 py-1.5 text-xs text-slate-400 transition hover:text-white"
            title={`Vai alla concessionaria ${dealerName}`}
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded border border-white/10 bg-white/[0.04] text-[7px] font-bold text-slate-400">
              {dealerLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={dealerLogo} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              ) : (
                "KA"
              )}
            </span>
            <span className="truncate underline decoration-white/25 underline-offset-2">{dealerName}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}


function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-slate-300">{children}</span>;
}
