import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ShareVehicleButton from "@/components/marketplace/share-vehicle-button";
import {
  buildWhatsAppLink,
  formatMileage,
  formatPrice,
  formatText,
  getAppBaseUrl,
  logMarketplaceQueryError,
  resolveDealerSlug,
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
  resolveVehicleRegistrationDate,
  type MarketplaceVehicle,
} from "@/lib/public-marketplace";
import { formatWebsiteForDisplay, resolveClickableWebsite } from "@/lib/website-url";
import { descrizioneSeoVeicolo, titoloSeoVeicolo } from "@/lib/vehicle-seo";
import { JsonLd } from "@/components/marketplace/json-ld";
import { WhatsAppContactButton } from "@/components/marketplace/whatsapp-contact-button";
import { buildBreadcrumbJsonLd, buildVehicleJsonLd } from "@/lib/structured-data";
import RequestInformationForm from "./request-information-form";
import VehicleGallery from "./vehicle-gallery";
import { AVVISO_FOTOGRAFIE } from "@/lib/avviso-fotografie";

// Prima era "force-dynamic": ogni singola visita ricalcolava la pagina e il
// browser riceveva l'ordine di non conservarne niente. Su una pagina
// d'atterraggio pubblicitaria significa pagare due volte, in tempo e in
// risorse, per mostrare a mille persone la stessa identica scheda.
//
// Un minuto di validita': un annuncio appena modificato compare entro un
// minuto, che e' meno di quanto ci mette un concessionario a ricaricare la
// pagina per controllare.
export const revalidate = 60;

/**
 * Perche' un elenco vuoto e non l'assenza di questa funzione: senza,
 * "revalidate" su una pagina a indirizzo variabile non ha effetto e ogni
 * visita ricalcola tutto -- e' scritto nella documentazione di Next.
 *
 * Vuoto e non pieno perche' il catalogo cambia di continuo: le pagine non si
 * costruiscono in anticipo, si costruiscono alla prima visita e da li' si
 * conservano per il minuto dichiarato sopra.
 */
export async function generateStaticParams() {
  return [];
}


type MarketplaceVehicleWithTechnical = MarketplaceVehicle & {
  vehicle_condition?: string | null;
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
      // vehicle_condition serve ai dati strutturati: e' la differenza fra
      // dichiarare a Google un'auto nuova e una usata.
      "id, brand, model, version, year, mileage, price, fuel, transmission, traction, description, body_type, vehicle_condition, engine_size, interior_type, power_kw, power_cv, doors, seats, warranty, availability, emission_class, registration_date, registration_month, color, vin, equipment, province, city, status, created_at, dealer_id, dealers!inner(id, name, company_name:legal_name, legal_name, city, province, email, phone, whatsapp_phone, website), vehicle_images(image_url, position, is_cover)"
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
    // Niente indirizzo canonico su una pagina che non esiste: dichiararlo
    // significherebbe chiedere a Google di considerarla la versione buona di
    // qualcosa. Qui la pagina va tolta dall'indice, non consolidata.
    return {
      title: "Veicolo non disponibile",
      description: fallbackDescription,
      robots: { index: false, follow: true },
    };
  }

  const vehicle = data as MarketplaceVehicleWithTechnical;
  const dealerName = resolveDealerDisplayName(vehicle.dealers);
  const etichetta = resolveVehicleLabel(vehicle);
  // Il titolo dei risultati di ricerca non e' l'intestazione della pagina: qui
  // il colore serve a distinguere schede altrimenti gemelle, sull'intestazione
  // sarebbe una ripetizione di cio' che la tabella dice due righe sotto.
  const title = titoloSeoVeicolo(etichetta, vehicle);
  const description = descrizioneSeoVeicolo(etichetta, vehicle, dealerName, formatPrice(vehicle.price));

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
      // La foto dell'auto, disegnata su misura: e' il motivo per cui uno
      // condivide una scheda veicolo.
      images: [{ url: `/og/veicolo/${id}`, width: 1200, height: 630, alt: etichetta }],
    },
  };
}

export default async function MarketplaceVehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data, error } = await fetchMarketplaceVehicleDetail(id);

  // Un annuncio che non c'e' deve rispondere 404, non 200: finche' rispondeva
  // "va tutto bene" mostrando "non disponibile", Google lo teneva per buono e
  // continuava a ripassarci sopra. La grafica e' la stessa, sta in
  // not-found.tsx.
  //
  // L'errore del database e' un'altra cosa e non va confuso: li' il veicolo
  // magari esiste, e dichiararlo sparito lo farebbe togliere dall'indice per
  // un guasto momentaneo.
  if (error) {
    logMarketplaceQueryError("detail", error);
    throw new Error(`Impossibile caricare la scheda veicolo: ${error.message}`);
  }

  if (!data) {
    notFound();
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
  const whatsappMessage = [
    "Buongiorno, sono interessato al veicolo:",
    resolveVehicleLabel(vehicle),
    "",
    "Visualizzato su KeyAuto.",
  ].join("\n");
  const dealerWhatsAppLink = buildWhatsAppLink(dealerWhatsAppPhone, whatsappMessage);
  const whatsappUnavailableMessage = "Numero WhatsApp non disponibile.";
  // Solo la sede della concessionaria: la citta' scritta sul veicolo la
  // contraddiceva e non e' quella su cui la ricerca misura le distanze.
  const dealershipLocality = formatText(dealerCity) !== "-" ? formatText(dealerCity) : "";
  // Prima nasceva dall'intestazione della richiesta, cioe' dal nome host con
  // cui si era arrivati: chi apriva il sito senza "www" condivideva un
  // indirizzo diverso dallo stesso annuncio aperto con "www". Ora e' sempre
  // quello canonico -- e leggere le intestazioni impediva di tenere la pagina
  // in cache, che e' il motivo per cui ogni visita ripartiva da zero.
  const shareUrl = toAbsoluteUrl(`/auto/${vehicle.id}`);
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

  // Quello che Google legge senza dover interpretare la pagina: prezzo,
  // chilometri, condizioni e venditore. E' cio' che permette di comparire fra
  // i risultati con la scheda invece che con due righe di testo.
  const canonicalUrl = toAbsoluteUrl(`/auto/${vehicle.id}`);
  const dealerSlug = resolveDealerSlug(vehicle.dealers);
  const vehicleJsonLd = buildVehicleJsonLd({
    url: canonicalUrl,
    name: shareTitle,
    description: vehicle.description,
    // Le foto passano da indirizzi firmati che scadono: a Google si consegna
    // l'anteprima stabile, l'unica che rispondera' anche fra sei mesi.
    images: [`${getAppBaseUrl()}/og/veicolo/${vehicle.id}`],
    brand: vehicle.brand,
    model: vehicle.model,
    version: vehicle.version,
    vin: vehicle.vin ?? null,
    year: vehicle.year,
    registrationDate: vehicle.registration_date ?? null,
    mileage: vehicle.mileage,
    price: vehicle.price,
    condition: vehicle.vehicle_condition ?? null,
    fuel: vehicle.fuel,
    transmission: vehicle.transmission,
    bodyType: vehicle.body_type,
    color: vehicle.color,
    doors: vehicle.doors,
    seats: vehicle.seats,
    powerKw: vehicle.power_kw ?? null,
    dealerName: dealerDisplayName,
    dealerUrl: toAbsoluteUrl(`/concessionarie/${dealerSlug}`),
    dealerCity: dealerNode?.city ?? null,
    dealerProvince: dealerNode?.province ?? null,
  });

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", url: toAbsoluteUrl("/") },
    { name: "Catalogo", url: toAbsoluteUrl("/auto") },
    { name: shareTitle, url: canonicalUrl },
  ]);

  // The 5 specs a buyer scans first — shown as icon chips right under the
  // gallery. Everything else (still all present, nothing dropped) moves to
  // the quieter technical spec list further down.
  const heroSpecs: Array<{ key: string; label: string; value: string; icon: SpecIconName }> = [
    { key: "registration_date", label: "Immatricolazione", value: resolveVehicleRegistrationDate(vehicle), icon: "calendar" },
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
      <JsonLd data={vehicleJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
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
            <VehicleGallery images={resolvedImages} label={resolveVehicleLabel(vehicle)} />

            {/* Attaccato alle foto, non in fondo alla pagina: chi guarda le
                immagini deve leggerlo mentre le guarda. Nei Termini c'era gia'
                (sezione 4), ma li' non ci arriva nessuno mentre sceglie
                un'automobile. */}
            <p className="px-1 text-xs leading-6 text-slate-500">{AVVISO_FOTOGRAFIE}</p>

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
                <a
                  href="#contatta-venditore"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_30px_-10px_rgba(76,130,247,0.7)] transition hover:brightness-105"
                >
                  <PhoneIcon /> Contatta il venditore
                </a>
                {dealerWhatsAppLink ? (
                  <WhatsAppContactButton href={dealerWhatsAppLink} vehicleLabel={shareTitle} vehicleId={vehicle.id} />
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
                <WebsiteRow website={dealerWebsite} />
              </div>

              {/* Il nome di chi vende l'auto era testo morto: si leggeva e non
                  portava da nessuna parte, cosi' per vedere cos'altro ha in
                  vetrina quella concessionaria bisognava cercarla a mano
                  nell'elenco. Il collegamento esisteva gia' -- ma solo dentro i
                  dati strutturati, cioe' Google sapeva arrivarci e il
                  visitatore no.

                  La pagina di destinazione esiste sempre: la si raggiunge da un
                  veicolo pubblicato, quindi quella concessionaria ha almeno un
                  veicolo in vetrina, che e' la condizione perche' la sua pagina
                  risponda. */}
              <Link
                href={`/concessionarie/${dealerSlug}`}
                className="mt-5 block break-words rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm font-semibold text-slate-200 transition [overflow-wrap:anywhere] hover:bg-white/[0.08] hover:text-white"
              >
                Vedi tutti i veicoli di {dealerDisplayName}
              </Link>
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

/**
 * Il sito della concessionaria, cliccabile quando c'e' davvero.
 *
 * Se l'indirizzo salvato non e' valido resta scritto in chiaro, com'era
 * prima: peggio di un link che manca c'e' solo un link che porta altrove.
 *
 * "nofollow" perche' e' un indirizzo che scrive il concessionario: senza,
 * il marketplace regalerebbe peso SEO a qualsiasi cosa venga incollata in
 * quel campo, e il campo diventerebbe un posto interessante da riempire.
 */
function WebsiteRow({ website }: { website: string | null }) {
  const href = resolveClickableWebsite(website);
  const label = formatWebsiteForDisplay(website);

  if (!href || !label) {
    return <InfoRow label="Sito web" value={formatText(website)} />;
  }

  return (
    <div className="flex min-w-0 items-center justify-between gap-4 border-b border-white/5 pb-2.5">
      <span className="text-sm text-slate-500">Sito web</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="min-w-0 max-w-[60%] truncate text-right text-sm font-semibold text-cyan-300 underline decoration-cyan-300/40 underline-offset-4 transition hover:text-cyan-200 hover:decoration-cyan-200"
      >
        {label}
      </a>
    </div>
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
