import Link from "next/link";
import { headers } from "next/headers";
import ShareVehicleButton from "@/components/marketplace/share-vehicle-button";
import {
  buildTelLink,
  buildWhatsAppLink,
  formatMileage,
  formatPrice,
  formatText,
  publicSupabase,
  resolveDealerDisplayName,
  resolveDealerEmail,
  resolveDealerPhone,
  resolveDealerWebsite,
  resolveDealerWhatsAppPhone,
  resolveVehicleImageUrl,
  resolveVehicleImages,
  resolveVehicleLabel,
  type MarketplaceVehicle,
} from "@/lib/public-marketplace";
import RequestInformationForm from "./request-information-form";

export const dynamic = "force-dynamic";

type MarketplaceVehicleWithTechnical = MarketplaceVehicle & {
  engine_size?: string | number | null;
  interior_type?: string | null;
  power_kw?: number | null;
  registration_date?: string | null;
  vin?: string | null;
  equipment?: string[] | string | null;
};

function normalizeEquipment(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter((item) => item.length > 0);
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return [];
    return normalized
      .split(/[,\n;|]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
}

export default async function MarketplaceVehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestHeaders = await headers();
  const forwardedProto = requestHeaders.get("x-forwarded-proto") ?? "https";
  const forwardedHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : "";

  const { data, error } = await publicSupabase
    .from("vehicles")
    .select(
      "id, brand, model, version, year, mileage, price, fuel, transmission, description, body_type, engine_size, interior_type, power_kw, power_cv, doors, seats, warranty, availability, emission_class, registration_date, color, vin, equipment, province, city, status, created_at, dealer_id, dealers(id, name, company_name:legal_name, legal_name, city, province, email, phone, whatsapp_phone, website), vehicle_images(image_url, position, is_cover)"
    )
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

  const vehicle = data as MarketplaceVehicleWithTechnical;
  const images = resolveVehicleImages(vehicle.vehicle_images);
  const resolvedImages = (await Promise.all(images.map((image) => resolveVehicleImageUrl(image)))).filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );
  const coverUrl = resolvedImages[0] ?? null;
  const dealerDisplayName = resolveDealerDisplayName(vehicle.dealers);
  const dealerPhone = resolveDealerPhone(vehicle.dealers);
  const dealerWhatsAppPhone = resolveDealerWhatsAppPhone(vehicle.dealers);
  const dealerEmail = resolveDealerEmail(vehicle.dealers);
  const dealerWebsite = resolveDealerWebsite(vehicle.dealers);
  const dealerCity = [
    Array.isArray(vehicle.dealers) ? vehicle.dealers[0]?.city : vehicle.dealers?.city,
    Array.isArray(vehicle.dealers) ? vehicle.dealers[0]?.province : vehicle.dealers?.province,
  ]
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length > 0)
    .join(" • ");
  const dealerTelLink = buildTelLink(dealerPhone);
  const whatsappMessage = [
    "Buongiorno, sono interessato al veicolo:",
    resolveVehicleLabel(vehicle),
    "",
    "Visualizzato su KeyPlan Rental.",
  ].join("\n");
  const dealerWhatsAppLink = buildWhatsAppLink(dealerWhatsAppPhone, whatsappMessage);
  const contactUnavailableMessage = "Numero di telefono non disponibile.";
  const whatsappUnavailableMessage = "Numero WhatsApp non disponibile.";
  const dealershipLocality = [formatText(dealerCity), formatText(vehicle.city), formatText(vehicle.province)]
    .filter((value) => value !== "-")
    .join(" • ");
  const shareUrl = origin ? `${origin}/auto/${vehicle.id}` : `/auto/${vehicle.id}`;
  const shareTitle = resolveVehicleLabel(vehicle);
  const shareText = [
    `Marca: ${formatText(vehicle.brand)}`,
    `Modello: ${formatText(vehicle.model)}`,
    `Versione: ${formatText(vehicle.version)}`,
    `Prezzo: ${formatPrice(vehicle.price)}`,
    `Concessionaria: ${dealerDisplayName}`,
    `URL annuncio: ${shareUrl}`,
  ].join("\n");
  const source = vehicle as Record<string, unknown>;
  const equipmentList = normalizeEquipment(source.equipment);

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <section className="rounded-[36px] border border-slate-200 bg-slate-950 px-8 py-10 text-white shadow-[0_40px_120px_-40px_rgba(15,23,42,0.55)] sm:px-10 sm:py-12 lg:px-12 lg:py-14">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-white/70">Scheda veicolo pubblica</p>
          <h1 className="mt-4 max-w-4xl min-w-0 break-words text-4xl font-semibold tracking-tight sm:text-5xl">{resolveVehicleLabel(vehicle)}</h1>
          <p className="mt-4 min-w-0 break-words text-base leading-7 text-slate-300 sm:text-lg">
            {formatText(vehicle.year)} • {formatText(vehicle.fuel)} • {formatText(vehicle.transmission)} • {dealerDisplayName}
          </p>
        </section>

        <div className="grid min-w-0 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="min-w-0 space-y-6">
            <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
              <div className="h-[420px] max-w-full overflow-hidden bg-slate-200">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl} alt={resolveVehicleLabel(vehicle)} className="h-full w-full max-w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-500">
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-14 w-14 fill-current">
                      <path d="M5 6a3 3 0 0 0-3 3v5a3 3 0 0 0 3 3h1.5a2.5 2.5 0 1 0 5 0h1a2.5 2.5 0 1 0 5 0H19a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3h-1.35a1 1 0 0 1-.83-.45l-.64-.97A2 2 0 0 0 14.53 4h-5.1a2 2 0 0 0-1.65.88l-.64.97A1 1 0 0 1 6.31 6H5Zm4 9.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
                    </svg>
                  </div>
                )}
              </div>

              {resolvedImages.length > 1 ? (
                <div className="grid min-w-0 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  {resolvedImages.slice(0, 8).map((image, index) => (
                    <a
                      key={`${image}-${index}`}
                      href={image}
                      target="_blank"
                      rel="noreferrer"
                      className="max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
                      aria-label={`Apri immagine ${index + 1}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image} alt={`Immagine ${index + 1}`} className="h-32 w-full max-w-full object-cover" />
                    </a>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="min-w-0 rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
              <h2 className="text-2xl font-semibold text-slate-900">Dettagli veicolo</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Marca" value={formatText(vehicle.brand)} />
                <Field label="Modello" value={formatText(vehicle.model)} />
                <Field label="Versione" value={formatText(vehicle.version)} />
                <Field label="Anno" value={formatText(vehicle.year)} />
                <Field label="Alimentazione" value={formatText(vehicle.fuel)} />
                <Field label="Cambio" value={formatText(vehicle.transmission)} />
                <Field label="Cilindrata" value={formatText(vehicle.engine_size)} />
                <Field label="Potenza kW" value={formatText(vehicle.power_kw)} />
                <Field label="Potenza CV" value={formatText(vehicle.power_cv)} />
                <Field label="Porte" value={formatText(vehicle.doors)} />
                <Field label="Classe Euro" value={formatText(vehicle.emission_class)} />
                <Field label="Data immatricolazione" value={formatText(vehicle.registration_date)} />
                <Field label="Colore" value={formatText(vehicle.color)} />
                <Field label="Interni" value={formatText(vehicle.interior_type)} />
                <Field label="Telaio" value={formatText(vehicle.vin)} />
                <Field label="Km" value={formatMileage(vehicle.mileage)} />
                <Field label="Prezzo" value={formatPrice(vehicle.price)} />
              </div>

              <div className="mt-6 min-w-0 max-w-full overflow-hidden rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Descrizione</p>
                <p className="mt-3 min-w-0 max-w-full overflow-hidden whitespace-pre-wrap break-words text-sm leading-7 text-slate-700 [overflow-wrap:anywhere]">
                  {formatText(vehicle.description)}
                </p>
              </div>

              {equipmentList.length > 0 ? (
                <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Dotazioni</p>
                  <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                    {equipmentList.map((item) => (
                      <span key={item} className="max-w-full break-words rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 [overflow-wrap:anywhere]">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <aside className="min-w-0 space-y-6">
            <div className="sticky top-24 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                {dealerTelLink ? (
                  <a
                    href={dealerTelLink}
                    className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
                  >
                    Contatta il venditore
                  </a>
                ) : (
                  <span title={contactUnavailableMessage}>
                    <button
                      type="button"
                      disabled
                      aria-label={contactUnavailableMessage}
                      className="inline-flex cursor-not-allowed items-center justify-center rounded-3xl bg-slate-300 px-5 py-3 text-sm font-semibold text-white opacity-70"
                    >
                      Contatta il venditore
                    </button>
                  </span>
                )}
                {dealerWhatsAppLink ? (
                  <a
                    href={dealerWhatsAppLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-3xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700"
                  >
                    WhatsApp
                  </a>
                ) : (
                  <span title={whatsappUnavailableMessage}>
                    <button
                      type="button"
                      disabled
                      aria-label={whatsappUnavailableMessage}
                      className="inline-flex cursor-not-allowed items-center justify-center rounded-3xl bg-slate-300 px-5 py-3 text-sm font-semibold text-white opacity-70"
                    >
                      WhatsApp
                    </button>
                  </span>
                )}
                <ShareVehicleButton title={shareTitle} text={shareText} url={shareUrl} />
              </div>
              <div id="contatta-venditore">
                <RequestInformationForm vehicleId={vehicle.id} vehicleLabel={resolveVehicleLabel(vehicle)} />
              </div>
            </div>

            <div className="min-w-0 overflow-hidden rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-slate-500">Concessionaria</p>
              <div className="mt-3 flex min-w-0 items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-500">
                  DP
                </div>
                <h2 className="min-w-0 max-w-full break-words text-2xl font-semibold text-slate-900 [overflow-wrap:anywhere]">{dealerDisplayName}</h2>
              </div>
              <p className="mt-3 min-w-0 max-w-full break-words text-sm leading-7 text-slate-600 [overflow-wrap:anywhere]">{dealershipLocality || "-"}</p>
              <div className="mt-4 space-y-3">
                <InfoRow label="Nome" value={dealerDisplayName} />
                <InfoRow label="Citta" value={formatText(dealerCity)} />
                <InfoRow label="Telefono" value={formatText(dealerPhone)} />
                <InfoRow label="WhatsApp" value={formatText(dealerWhatsAppPhone)} />
                <InfoRow label="Email" value={formatText(dealerEmail)} />
                <InfoRow label="Sito web" value={formatText(dealerWebsite)} />
              </div>
            </div>

            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-slate-500">Scheda tecnica</p>
              <div className="mt-4 space-y-3">
                <InfoRow label="Alimentazione" value={formatText(vehicle.fuel)} />
                <InfoRow label="Cambio" value={formatText(vehicle.transmission)} />
                <InfoRow label="Cilindrata" value={formatText(vehicle.engine_size)} />
                <InfoRow label="Potenza kW" value={formatText(vehicle.power_kw)} />
                <InfoRow label="Potenza CV" value={formatText(vehicle.power_cv)} />
                <InfoRow label="Porte" value={formatText(vehicle.doors)} />
                <InfoRow label="Classe Euro" value={formatText(vehicle.emission_class)} />
                <InfoRow label="Immatricolazione" value={formatText(vehicle.registration_date)} />
                <InfoRow label="Colore" value={formatText(vehicle.color)} />
                <InfoRow label="Interni" value={formatText(vehicle.interior_type)} />
                <InfoRow label="Telaio" value={formatText(vehicle.vin)} />
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
    <div className="min-w-0 max-w-full overflow-hidden rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 min-w-0 max-w-full break-words font-semibold text-slate-900 [overflow-wrap:anywhere]">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 overflow-hidden rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="min-w-0 max-w-full break-words text-right text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">{value}</span>
    </div>
  );
}
