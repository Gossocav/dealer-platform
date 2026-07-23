import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import ShareVehicleButton from "@/components/marketplace/share-vehicle-button";
import {
  buildTelLink,
  buildWhatsAppLink,
  formatMileage,
  formatPrice,
  formatText,
  logMarketplaceQueryError,
  MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES,
  MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES,
  publicSupabase,
  resolveDealerDisplayName,
  resolveDealerEmail,
  resolveDealerPhone,
  resolveDealerWebsite,
  resolveDealerWhatsAppPhone,
  toAbsoluteUrl,
  resolveVehicleImageUrl,
  resolveVehicleImages,
  resolveVehicleLabel,
  type MarketplaceVehicle,
} from "@/lib/public-marketplace";
import RequestInformationForm from "./request-information-form";

export const dynamic = "force-dynamic";

type MarketplaceVehicleWithTechnical = MarketplaceVehicle & {
  engine_size?: string | number | null;
  traction?: string | null;
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

async function fetchMarketplaceVehicleDetail(id: string) {
  return publicSupabase
    .from("vehicles")
    .select(
      "id, brand, model, version, year, mileage, price, fuel, transmission, traction, description, body_type, engine_size, interior_type, power_kw, power_cv, doors, seats, warranty, availability, emission_class, registration_date, color, vin, equipment, province, city, status, created_at, dealer_id, dealers!inner(id, name, company_name:legal_name, legal_name, city, province, email, phone, whatsapp_phone, website), vehicle_images(image_url, position, is_cover)"
    )
    .eq("id", id)
    .eq("published", true)
    .in("status", MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES)
    .in("dealers.status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES)
    .maybeSingle();
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const canonical = toAbsoluteUrl(`/auto/${id}`);
  const fallbackDescription = "Scheda dettagliata del veicolo pubblicato nel marketplace KeyAuto.";

  const { data } = await fetchMarketplaceVehicleDetail(id);

  if (!data) {
    return {
      title: "Veicolo non disponibile",
      description: fallbackDescription,
      alternates: {
        canonical,
      },
      openGraph: {
        title: "Veicolo non disponibile | KeyAuto",
        description: fallbackDescription,
        url: canonical,
        type: "website",
      },
    };
  }

  const vehicle = data as MarketplaceVehicleWithTechnical;
  const dealerName = resolveDealerDisplayName(vehicle.dealers);
  const title = resolveVehicleLabel(vehicle);
  const description = `${title} disponibile presso ${dealerName}. Prezzo: ${formatPrice(vehicle.price)}.`;

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title: `${title} | KeyAuto`,
      description,
      url: canonical,
      type: "website",
    },
  };
}

export default async function MarketplaceVehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestHeaders = await headers();
  const forwardedProto = requestHeaders.get("x-forwarded-proto") ?? "https";
  const forwardedHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : "";

  const { data, error } = await fetchMarketplaceVehicleDetail(id);

  if (error || !data) {
    logMarketplaceQueryError("detail", error);
    return (
      <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <section className="rounded-[36px] border border-white/10 bg-gradient-to-b from-slate-800/80 to-slate-950 px-8 py-10 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)] sm:px-10 sm:py-12">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-300">Scheda veicolo</p>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight">Veicolo non disponibile</h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-400">
              {error ? error.message : "Il veicolo che cerchi non è più disponibile o potrebbe non essere ancora pubblicato."}
            </p>
          </section>
          <div className="rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-8">
            <div className="flex flex-col items-center gap-5 py-8 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/5 text-slate-500">
                <svg viewBox="0 0 64 64" aria-hidden="true" className="h-10 w-10 fill-current opacity-60">
                  <path d="M12 18a8 8 0 0 0-8 8v13a8 8 0 0 0 8 8h4a7 7 0 0 0 14 0h4a7 7 0 0 0 14 0h4a8 8 0 0 0 8-8V26a8 8 0 0 0-8-8h-4.6a3 3 0 0 1-2.5-1.3l-1.8-2.8A6 6 0 0 0 38 12H26a6 6 0 0 0-5 2.7l-1.8 2.8A3 3 0 0 1 16.6 19H12Zm10 25a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm20 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-semibold text-white">Annuncio non trovato</p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
                  Il veicolo potrebbe essere stato rimosso, venduto o il link non è più valido.
                </p>
              </div>
              <Link
                href="/auto"
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-6 py-3 text-sm font-bold text-slate-950 shadow-[0_16px_40px_-14px_rgba(76,130,247,0.8)] transition hover:brightness-105"
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
  const dealerNode = Array.isArray(vehicle.dealers) ? vehicle.dealers[0] : vehicle.dealers;

  if (!vehicle.dealer_id || !dealerNode?.id) {
    console.error("Marketplace vehicle detail has incomplete dealer association", {
      vehicleId: vehicle.id,
      dealerId: vehicle.dealer_id,
      dealerNode,
    });
  }

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
    "Visualizzato su KeyAuto.",
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

  // The 5 specs a buyer scans first — shown as icon chips right under the
  // gallery. Everything else (still all present, nothing dropped) moves to
  // the quieter technical spec list further down.
  const heroSpecs: Array<{ key: string; label: string; value: string; icon: SpecIconName }> = [
    { key: "registration_date", label: "Immatricolazione", value: formatText(vehicle.registration_date), icon: "calendar" },
    { key: "mileage", label: "Percorrenza", value: formatMileage(vehicle.mileage), icon: "gauge" },
    { key: "fuel", label: "Alimentazione", value: formatText(vehicle.fuel), icon: "fuel" },
    { key: "transmission", label: "Cambio", value: formatText(vehicle.transmission), icon: "gearbox" },
    { key: "power_cv", label: "Potenza", value: vehicle.power_cv ? `${formatText(vehicle.power_cv)} CV` : "-", icon: "bolt" },
  ];

  const technicalSpecs: Array<{ label: string; value: string }> = [
    { label: "Marca", value: formatText(vehicle.brand) },
    { label: "Modello", value: formatText(vehicle.model) },
    { label: "Versione", value: formatText(vehicle.version) },
    { label: "Trazione", value: formatText(vehicle.traction) },
    { label: "Cilindrata", value: formatText(vehicle.engine_size) },
    { label: "Potenza kW", value: formatText(vehicle.power_kw) },
    { label: "Porte", value: formatText(vehicle.doors) },
    { label: "Classe Euro", value: formatText(vehicle.emission_class) },
    { label: "Colore", value: formatText(vehicle.color) },
    { label: "Interni", value: formatText(vehicle.interior_type) },
    { label: "Telaio", value: formatText(vehicle.vin) },
  ];

  return (
    <main className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        {/* ============ HERO ============ */}
        <section className="relative overflow-hidden rounded-[36px] border border-white/10 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 px-6 py-8 text-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)] sm:px-10 sm:py-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(76,130,247,0.5), transparent 70%)" }}
          />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0 max-w-2xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
                <CheckIcon /> Concessionaria verificata
              </p>
              <h1 className="mt-4 min-w-0 break-words text-3xl font-extrabold tracking-tight sm:text-5xl">{resolveVehicleLabel(vehicle)}</h1>
              <p className="mt-3 min-w-0 break-words text-base text-slate-400">
                {formatText(vehicle.fuel)} • {formatText(vehicle.transmission)} • {dealerDisplayName}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Prezzo</p>
              <p className="mt-1 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">{formatPrice(vehicle.price)}</p>
            </div>
          </div>
        </section>

        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
          <section className="order-1 min-w-0 space-y-6">
            {/* ============ GALLERY ============ */}
            <div className="overflow-hidden rounded-[32px] border border-white/10 bg-slate-900 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)]">
              <div className="relative h-[460px] max-w-full overflow-hidden bg-gradient-to-br from-slate-700 via-slate-900 to-slate-950">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl} alt={resolveVehicleLabel(vehicle)} className="h-full w-full max-w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-600">
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-16 w-16 fill-current opacity-50">
                      <path d="M5 6a3 3 0 0 0-3 3v5a3 3 0 0 0 3 3h1.5a2.5 2.5 0 1 0 5 0h1a2.5 2.5 0 1 0 5 0H19a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3h-1.35a1 1 0 0 1-.83-.45l-.64-.97A2 2 0 0 0 14.53 4h-5.1a2 2 0 0 0-1.65.88l-.64.97A1 1 0 0 1 6.31 6H5Zm4 9.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
                    </svg>
                  </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/70 to-transparent" />
              </div>

              {resolvedImages.length > 1 ? (
                <div className="grid min-w-0 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  {resolvedImages.slice(0, 8).map((image, index) => (
                    <a
                      key={`${image}-${index}`}
                      href={image}
                      target="_blank"
                      rel="noreferrer"
                      className="max-w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-800 transition hover:border-blue-400/40"
                      aria-label={`Apri immagine ${index + 1}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image} alt={`Immagine ${index + 1}`} className="h-32 w-full max-w-full object-cover" />
                    </a>
                  ))}
                </div>
              ) : null}
            </div>

            {/* ============ HERO SPEC STRIP ============ */}
            <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {heroSpecs.map((spec) => (
                <div
                  key={spec.key}
                  className="min-w-0 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-800/80 to-slate-900 px-4 py-3.5"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-400/15 text-cyan-300">
                    <SpecIcon name={spec.icon} />
                  </span>
                  <p className="mt-2.5 min-w-0 truncate text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{spec.label}</p>
                  <p className="mt-0.5 min-w-0 truncate text-sm font-bold text-white">{spec.value}</p>
                </div>
              ))}
            </div>

            {/* ============ DESCRIPTION + TECHNICAL SPECS ============ */}
            <div className="min-w-0 rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)] sm:p-8">
              <div className="min-w-0 max-w-full overflow-hidden rounded-2xl bg-white/[0.03] px-5 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Descrizione</p>
                <p className="mt-3 min-w-0 max-w-full overflow-hidden whitespace-pre-wrap break-words text-sm leading-7 text-slate-300 [overflow-wrap:anywhere]">
                  {formatText(vehicle.description)}
                </p>
              </div>

              <h2 className="mt-7 text-lg font-bold tracking-tight text-white">Scheda tecnica</h2>
              <div className="mt-4 grid gap-x-8 sm:grid-cols-2">
                <dl className="divide-y divide-white/5">
                  {technicalSpecs.filter((_, i) => i % 2 === 0).map((spec) => (
                    <div key={spec.label} className="flex items-center justify-between gap-4 py-3 first:pt-0">
                      <dt className="text-sm text-slate-500">{spec.label}</dt>
                      <dd className="min-w-0 max-w-[60%] truncate text-right text-sm font-semibold text-white">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
                <dl className="divide-y divide-white/5">
                  {technicalSpecs.filter((_, i) => i % 2 === 1).map((spec) => (
                    <div key={spec.label} className="flex items-center justify-between gap-4 py-3 first:pt-0 sm:first:pt-3">
                      <dt className="text-sm text-slate-500">{spec.label}</dt>
                      <dd className="min-w-0 max-w-[60%] truncate text-right text-sm font-semibold text-white">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {equipmentList.length > 0 ? (
                <div className="mt-7">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Dotazioni</p>
                  <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                    {equipmentList.map((item) => (
                      <span
                        key={item}
                        className="max-w-full break-words rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-300 [overflow-wrap:anywhere]"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          {/* ============ SIDEBAR ============ */}
          <aside className="order-2 min-w-0 space-y-6 lg:sticky lg:top-6 lg:self-start">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                {dealerTelLink ? (
                  <a
                    href={dealerTelLink}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_30px_-10px_rgba(76,130,247,0.7)] transition hover:brightness-105"
                  >
                    <PhoneIcon /> Contatta il venditore
                  </a>
                ) : (
                  <span title={contactUnavailableMessage}>
                    <button
                      type="button"
                      disabled
                      aria-label={contactUnavailableMessage}
                      className="inline-flex cursor-not-allowed items-center justify-center rounded-full bg-white/10 px-5 py-3 text-sm font-semibold text-slate-500"
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
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-emerald-300 to-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_30px_-10px_rgba(55,224,232,0.5)] transition hover:brightness-105"
                  >
                    WhatsApp
                  </a>
                ) : (
                  <span title={whatsappUnavailableMessage}>
                    <button
                      type="button"
                      disabled
                      aria-label={whatsappUnavailableMessage}
                      className="inline-flex cursor-not-allowed items-center justify-center rounded-full bg-white/10 px-5 py-3 text-sm font-semibold text-slate-500"
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

            <div className="min-w-0 overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)]">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Concessionaria</p>
              <div className="mt-3 flex min-w-0 items-center gap-3">
                <div className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-gradient-to-br from-white via-blue-100 to-blue-300 text-lg font-extrabold text-slate-950">
                  {dealerDisplayName.charAt(0)}
                </div>
                <h2 className="min-w-0 max-w-full break-words text-xl font-bold text-white [overflow-wrap:anywhere]">{dealerDisplayName}</h2>
              </div>
              <p className="mt-3 min-w-0 max-w-full break-words text-sm leading-7 text-slate-400 [overflow-wrap:anywhere]">{dealershipLocality || "-"}</p>
              <div className="mt-4 space-y-2.5">
                <InfoRow label="Città" value={formatText(dealerCity)} />
                <InfoRow label="Telefono" value={formatText(dealerPhone)} />
                <InfoRow label="WhatsApp" value={formatText(dealerWhatsAppPhone)} />
                <InfoRow label="Email" value={formatText(dealerEmail)} />
                <InfoRow label="Sito web" value={formatText(dealerWebsite)} />
              </div>
            </div>

            <Link
              href="/auto"
              className="flex items-center justify-center rounded-[32px] border border-white/10 bg-white/[0.03] px-5 py-4 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
            >
              Torna al catalogo
            </Link>
          </aside>
        </div>
      </div>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 border-b border-white/5 pb-2.5">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="min-w-0 max-w-[60%] truncate text-right text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

type SpecIconName = "calendar" | "gauge" | "fuel" | "gearbox" | "bolt";

function SpecIcon({ name }: { name: SpecIconName }) {
  const common = "h-4 w-4 fill-none stroke-current stroke-[2]";
  switch (name) {
    case "calendar":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "gauge":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 13V9M5 6l1.5 1.5" strokeLinecap="round" />
        </svg>
      );
    case "fuel":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <path d="M14 7h3a2 2 0 0 1 2 2v7a1.5 1.5 0 0 0 3 0v-6l-3-3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 20V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14M3 20h13M4 11h10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "gearbox":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "bolt":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
          <path d="M13 2 4 14h7l-1 8 9-12h-7z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-current stroke-[3]" aria-hidden="true">
      <path d="M20 7 9 18l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[2.2]" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
