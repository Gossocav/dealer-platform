import Link from "next/link";
import {
  formatMileage,
  formatPrice,
  formatText,
  publicSupabase,
  resolveVehicleImageUrl,
  resolveVehicleImages,
  resolveVehicleLabel,
  type MarketplaceVehicle,
} from "@/lib/public-marketplace";
import RequestInformationForm from "./request-information-form";

export const dynamic = "force-dynamic";

export default async function MarketplaceVehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data, error } = await publicSupabase
    .from("vehicles")
    .select("id, brand, model, version, year, mileage, price, fuel, transmission, description, body_type, color, power_cv, doors, seats, warranty, availability, emission_class, province, city, status, created_at, dealer_id, vehicle_images(image_url, position, is_cover)")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();

  if (error || !data) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl space-y-6">
          <section className="rounded-[36px] border border-slate-200 bg-slate-950 px-8 py-10 text-white shadow-[0_40px_120px_-40px_rgba(15,23,42,0.55)] sm:px-10 sm:py-12">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-white/60">Scheda veicolo</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">Veicolo non disponibile</h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-400">
              {error ? error.message : "Il veicolo che cerchi non è più disponibile o potrebbe non essere ancora pubblicato."}
            </p>
          </section>
          <div className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.22)]">
            <div className="flex flex-col items-center gap-5 py-8 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <svg viewBox="0 0 64 64" aria-hidden="true" className="h-10 w-10 fill-current opacity-60">
                  <path d="M12 18a8 8 0 0 0-8 8v13a8 8 0 0 0 8 8h4a7 7 0 0 0 14 0h4a7 7 0 0 0 14 0h4a8 8 0 0 0 8-8V26a8 8 0 0 0-8-8h-4.6a3 3 0 0 1-2.5-1.3l-1.8-2.8A6 6 0 0 0 38 12H26a6 6 0 0 0-5 2.7l-1.8 2.8A3 3 0 0 1 16.6 19H12Zm10 25a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm20 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-900">Annuncio non trovato</p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                  Il veicolo potrebbe essere stato rimosso, venduto o il link non è più valido.
                </p>
              </div>
              <Link
                href="/auto"
                className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
              >
                Sfoglia il catalogo
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const vehicle = data as MarketplaceVehicle;
  const images = resolveVehicleImages(vehicle.vehicle_images);
  const resolvedImages = (await Promise.all(images.map((image) => resolveVehicleImageUrl(image)))).filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );
  const coverUrl = resolvedImages[0] ?? null;
  const dealerDisplayName = "TEST AUTO";
  const dealerCity = "Milano";
  const dealerPhone = "non disponibile";
  const dealerEmail = "non disponibile";
  const dealershipLocality = [formatText(vehicle.city), formatText(vehicle.province)]
    .filter((value) => value !== "-")
    .join(" • ");
  const equipmentList = [
    vehicle.body_type ? `Carrozzeria ${vehicle.body_type}` : null,
    vehicle.color ? `Colore ${vehicle.color}` : null,
    typeof vehicle.power_cv === "number" ? `${vehicle.power_cv} CV` : null,
    typeof vehicle.doors === "number" ? `${vehicle.doors} porte` : null,
    typeof vehicle.seats === "number" ? `${vehicle.seats} posti` : null,
    vehicle.warranty ? `Garanzia ${vehicle.warranty}` : null,
    vehicle.availability ? `Disponibilita ${vehicle.availability}` : null,
    vehicle.emission_class ? `Classe ${vehicle.emission_class}` : null,
  ].filter(Boolean) as string[];

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <section className="rounded-[36px] border border-slate-200 bg-slate-950 px-8 py-10 text-white shadow-[0_40px_120px_-40px_rgba(15,23,42,0.55)] sm:px-10 sm:py-12 lg:px-12 lg:py-14">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-white/70">Scheda veicolo pubblica</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">{resolveVehicleLabel(vehicle)}</h1>
          <p className="mt-4 text-base leading-7 text-slate-300 sm:text-lg">
            {formatText(vehicle.year)} • {formatText(vehicle.fuel)} • {formatText(vehicle.transmission)} • {dealerDisplayName}
          </p>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-6">
            <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
              <div className="h-[420px] bg-slate-200">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl} alt={resolveVehicleLabel(vehicle)} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-500">
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-14 w-14 fill-current">
                      <path d="M5 6a3 3 0 0 0-3 3v5a3 3 0 0 0 3 3h1.5a2.5 2.5 0 1 0 5 0h1a2.5 2.5 0 1 0 5 0H19a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3h-1.35a1 1 0 0 1-.83-.45l-.64-.97A2 2 0 0 0 14.53 4h-5.1a2 2 0 0 0-1.65.88l-.64.97A1 1 0 0 1 6.31 6H5Zm4 9.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
                    </svg>
                  </div>
                )}
              </div>

              {resolvedImages.length > 1 ? (
                <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  {resolvedImages.slice(0, 8).map((image, index) => (
                    <a
                      key={`${image}-${index}`}
                      href={image}
                      target="_blank"
                      rel="noreferrer"
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
                      aria-label={`Apri immagine ${index + 1}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image} alt={`Immagine ${index + 1}`} className="h-32 w-full object-cover" />
                    </a>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
              <h2 className="text-2xl font-semibold text-slate-900">Dettagli veicolo</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Marca" value={formatText(vehicle.brand)} />
                <Field label="Modello" value={formatText(vehicle.model)} />
                <Field label="Versione" value={formatText(vehicle.version)} />
                <Field label="Anno" value={formatText(vehicle.year)} />
                <Field label="Alimentazione" value={formatText(vehicle.fuel)} />
                <Field label="Cambio" value={formatText(vehicle.transmission)} />
                <Field label="Km" value={formatMileage(vehicle.mileage)} />
                <Field label="Prezzo" value={formatPrice(vehicle.price)} />
              </div>

              <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Descrizione</p>
                <p className="mt-3 text-sm leading-7 text-slate-700">{formatText(vehicle.description)}</p>
              </div>

              <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Dotazioni</p>
                {equipmentList.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {equipmentList.map((item) => (
                      <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                        {item}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">-</p>
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="sticky top-24">
              <RequestInformationForm vehicleId={vehicle.id} vehicleLabel={resolveVehicleLabel(vehicle)} />
            </div>

            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-slate-500">Concessionaria</p>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-500">
                  DP
                </div>
                <h2 className="text-2xl font-semibold text-slate-900">{dealerDisplayName}</h2>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-600">{dealershipLocality || "-"}</p>
              <div className="mt-4 space-y-3">
                <InfoRow label="Nome" value={dealerDisplayName} />
                <InfoRow label="Citta" value={dealerCity} />
                <InfoRow label="Telefono" value={dealerPhone} />
                <InfoRow label="Email" value={dealerEmail} />
              </div>
            </div>

            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-slate-500">Scheda tecnica</p>
              <div className="mt-4 space-y-3">
                <InfoRow label="Alimentazione" value={formatText(vehicle.fuel)} />
                <InfoRow label="Cambio" value={formatText(vehicle.transmission)} />
                <InfoRow label="Chilometri" value={formatMileage(vehicle.mileage)} />
                <InfoRow label="Prezzo" value={formatPrice(vehicle.price)} />
                <InfoRow label="Stato annuncio" value="Pubblicato" />
              </div>
            </div>

            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
              <Link href="/auto" className="inline-flex items-center justify-center rounded-3xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
                Torna al catalogo
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 font-semibold text-slate-900">{value}</p>
    </div>
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
