import type { Metadata } from "next";
import Link from "next/link";
import { formatMileage, formatPrice, formatText, getMarketplaceStatusFilter, normalizeVehicleDealerName, publicSupabase, resolveDealerSlug, resolveVehicleImageUrl, resolveVehicleImages, resolveVehicleLabel, toAbsoluteUrl, type MarketplaceDealer, type MarketplaceVehicle } from "@/lib/public-marketplace";

export const dynamic = "force-dynamic";

type DealerCluster = {
  dealerId: string;
  dealer: MarketplaceDealer | null;
  vehicles: MarketplaceVehicle[];
};

const PRICE_BANDS = [
  { label: "Fino a 15.000 €", value: "0-15000" },
  { label: "15.000 - 25.000 €", value: "15000-25000" },
  { label: "25.000 - 40.000 €", value: "25000-40000" },
  { label: "Oltre 40.000 €", value: "40000-99999999" },
] as const;

export function generateMetadata(): Metadata {
  const description = "Marketplace auto pubblico: esplora veicoli, confronta offerte e scopri concessionarie partner in tutta Italia.";
  const canonical = toAbsoluteUrl("/");

  return {
    title: "Marketplace Auto",
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title: "Marketplace Auto | Dealer Platform",
      description,
      url: canonical,
      type: "website",
    },
  };
}

export default async function MarketplaceHomePage() {
  const { data, error } = await publicSupabase
    .from("vehicles")
    .select("id, brand, model, version, year, mileage, price, fuel, transmission, city, status, created_at, dealer_id, dealers!inner(id, name, logo_url, legal_name), vehicle_images(image_url, position, is_cover)")
    .or(getMarketplaceStatusFilter())
    .eq("dealers.status", "approved")
    .order("created_at", { ascending: false })
    .limit(24);

  if (error) {
    return (
      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[36px] border border-slate-200 bg-white p-8 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-blue-600">Marketplace</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">Marketplace non disponibile</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">{error.message || "Non siamo riusciti a caricare il marketplace."}</p>
        </div>
      </main>
    );
  }

  const vehicles = (data ?? []) as MarketplaceVehicle[];
  const latestVehicles = [...vehicles].sort(byNewest).slice(0, 8);
  const featuredVehicles = [...vehicles].sort(byFeatured).slice(0, 4);
  const partnerDealers = groupDealers(vehicles).slice(0, 4);
  const brands = uniqueValues(vehicles.map((vehicle) => vehicle.brand));
  const fuels = uniqueValues(vehicles.map((vehicle) => vehicle.fuel));
  const transmissions = uniqueValues(vehicles.map((vehicle) => vehicle.transmission));

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <section className="overflow-hidden rounded-[40px] border border-slate-200 bg-slate-950 shadow-[0_40px_120px_-40px_rgba(15,23,42,0.55)]">
          <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="px-8 py-10 sm:px-10 sm:py-12 lg:px-12 lg:py-16">
              <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold tracking-[0.18em] text-white/90">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xs font-bold text-slate-950">DP</span>
                MARKETPLACE
              </div>
              <h1 className="mt-8 max-w-4xl text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
                Trova la tua prossima auto
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                Un marketplace pubblico, moderno e veloce per esplorare veicoli pubblicati da concessionarie reali con un linguaggio visivo coerente alla Dealer Platform.
              </p>

              <form action="/ricerca" method="GET" className="mt-8 rounded-[32px] border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/10 backdrop-blur sm:p-5">
                <div className="grid gap-4 lg:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))_auto]">
                  <HeroField label="Cerca" name="q" placeholder="Marca, modello, città o versione" />
                  <HeroSelect label="Marca" name="brand" options={brands} />
                  <HeroSelect label="Prezzo" name="priceBand" options={PRICE_BANDS.map((band) => band.label)} values={PRICE_BANDS.map((band) => band.value)} />
                  <HeroSelect label="Carburante" name="fuel" options={fuels} />
                  <HeroSelect label="Cambio" name="transmission" options={transmissions} />
                  <button type="submit" className="inline-flex items-center justify-center rounded-3xl bg-white px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-black/10 transition hover:bg-slate-100">
                    Cerca
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <QuickLink href="/auto">Catalogo completo</QuickLink>
                  <QuickLink href="/ricerca">Ricerca avanzata</QuickLink>
                  <QuickLink href="/concessionarie">Concessionarie partner</QuickLink>
                </div>
              </form>
            </div>

            <div className="relative min-h-[420px] bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.28),_transparent_45%),linear-gradient(180deg,_rgba(15,23,42,0.75)_0%,_rgba(15,23,42,0.95)_100%)] px-8 py-10 sm:px-10 sm:py-12 lg:px-12 lg:py-16">
              <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:32px_32px]" />
              <div className="relative flex h-full flex-col justify-between gap-6">
                <div className="space-y-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.32em] text-white/70">Mercato reale</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Metric label="Veicoli pubblicati" value={String(vehicles.length)} />
                    <Metric label="Concessionarie partner" value={String(groupDealers(vehicles).length)} />
                    <Metric label="Disponibilità" value="Aggiornata" />
                    <Metric label="Accesso" value="Pubblico" />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoPill title="Ultimi arrivi" text="Stock sempre aggiornato dai dealer." />
                  <InfoPill title="Schede chiare" text="Foto, km, cambio, alimentazione e prezzo." />
                  <InfoPill title="Partner verificati" text="Concessionarie pubbliche con pagine dedicate." />
                  <InfoPill title="Esperienza veloce" text="Navigazione immediata, senza login." />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)] sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.32em] text-blue-600">Ultimi arrivi</p>
                <h2 className="mt-3 text-3xl font-semibold text-slate-900">I veicoli appena pubblicati</h2>
              </div>
              <Link href="/auto" className="rounded-3xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
                Vedi tutti
              </Link>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {latestVehicles.map((vehicle) => (
                <HomeVehicleCard key={vehicle.id} vehicle={vehicle} />
              ))}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-[32px] border border-slate-200 bg-slate-950 p-6 text-white shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-white/70">Perché scegliere Dealer Platform</p>
              <h2 className="mt-3 text-2xl font-semibold">Una piattaforma pensata per vendere meglio.</h2>
              <div className="mt-5 space-y-3 text-sm leading-7 text-slate-300">
                <p>• Stile coerente tra marketplace e gestionale dealer.</p>
                <p>• Navigazione mobile-first e struttura editoriale moderna.</p>
                <p>• Concessionarie e veicoli pubblicati con contenuti chiari e leggibili.</p>
                <p>• Base pronta per evoluzioni SaaS future senza cambiare impianto UX.</p>
              </div>
            </div>

            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)]">
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-slate-500">Percorso rapido</p>
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <Link href="/auto" className="block rounded-3xl bg-slate-50 px-4 py-3 font-semibold transition hover:bg-slate-100">Vai al catalogo</Link>
                <Link href="/ricerca" className="block rounded-3xl bg-slate-50 px-4 py-3 font-semibold transition hover:bg-slate-100">Ricerca avanzata</Link>
                <Link href="/concessionarie" className="block rounded-3xl bg-slate-50 px-4 py-3 font-semibold transition hover:bg-slate-100">Elenco concessionarie</Link>
              </div>
            </div>
          </aside>
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)] sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-blue-600">Veicoli in evidenza</p>
              <h2 className="mt-3 text-3xl font-semibold text-slate-900">Le opportunità più interessanti</h2>
            </div>
            <Link href="/auto" className="rounded-3xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
              Apri catalogo
            </Link>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
            {featuredVehicles.map((vehicle) => (
              <FeaturedVehicleCard key={vehicle.id} vehicle={vehicle} />
            ))}
          </div>
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.28)] sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-blue-600">Concessionarie partner</p>
              <h2 className="mt-3 text-3xl font-semibold text-slate-900">I dealer più presenti nel marketplace</h2>
            </div>
            <Link href="/concessionarie" className="rounded-3xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
              Tutte le concessionarie
            </Link>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {partnerDealers.map((group) => (
              <PartnerDealerCard key={group.dealerId} group={group} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-white/5 p-5 ring-1 ring-white/10">
      <p className="text-sm font-medium text-slate-300">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
    </div>
  );
}

function InfoPill({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{text}</p>
    </div>
  );
}

function HeroField({ label, name, placeholder }: { label: string; name: string; placeholder: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">{label}</span>
      <input
        name={name}
        placeholder={placeholder}
        className="w-full rounded-3xl border border-white/10 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function HeroSelect({ label, name, options, values }: { label: string; name: string; options: string[]; values?: string[] }) {
  const finalValues = values ?? options;

  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">{label}</span>
      <select
        name={name}
        className="w-full rounded-3xl border border-white/10 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      >
        <option value="">Tutti</option>
        {options.map((option, index) => (
          <option key={`${name}-${option}-${index}`} value={finalValues[index] ?? option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function QuickLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10">
      {children}
    </Link>
  );
}

async function HomeVehicleCard({ vehicle }: { vehicle: MarketplaceVehicle }) {
  const cover = resolveVehicleImages(vehicle.vehicle_images)[0] ?? null;
  const coverUrl = cover ? await resolveVehicleImageUrl(cover) : null;
  const dealerSlug = resolveDealerSlug(vehicle.dealers);

  return (
    <article className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 transition hover:-translate-y-1 hover:bg-white hover:shadow-lg">
      <div className="h-44 bg-slate-200">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={resolveVehicleLabel(vehicle)} className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="space-y-3 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">{normalizeVehicleDealerName(vehicle.dealers)}</p>
        <h3 className="text-lg font-semibold text-slate-900">{resolveVehicleLabel(vehicle)}</h3>
        <p className="text-sm text-slate-600">{formatText(vehicle.city)} • {formatPrice(vehicle.price)}</p>
        <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
          <span>{formatText(vehicle.year)}</span>
          <span>{formatMileage(vehicle.mileage)}</span>
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

async function FeaturedVehicleCard({ vehicle }: { vehicle: MarketplaceVehicle }) {
  const cover = resolveVehicleImages(vehicle.vehicle_images)[0] ?? null;
  const coverUrl = cover ? await resolveVehicleImageUrl(cover) : null;
  const dealerSlug = resolveDealerSlug(vehicle.dealers);

  return (
    <article className="overflow-hidden rounded-[30px] border border-slate-200 bg-slate-50 transition hover:-translate-y-1 hover:bg-white hover:shadow-lg">
      <div className="h-52 bg-slate-200">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={resolveVehicleLabel(vehicle)} className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">In evidenza</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">{resolveVehicleLabel(vehicle)}</h3>
          </div>
          <p className="text-sm font-semibold text-slate-900">{formatPrice(vehicle.price)}</p>
        </div>
        <p className="text-sm text-slate-600">{formatText(normalizeVehicleDealerName(vehicle.dealers))}</p>
        <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
          <span>{formatText(vehicle.year)}</span>
          <span>{formatMileage(vehicle.mileage)}</span>
          <span>{formatText(vehicle.fuel)}</span>
          <span>{formatText(vehicle.transmission)}</span>
        </div>
        <div className="flex gap-2 pt-1">
          <Link href={`/auto/${vehicle.id}`} className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">
            Visualizza
          </Link>
          <Link href={`/concessionarie/${dealerSlug}`} className="inline-flex items-center justify-center rounded-3xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
            Partner
          </Link>
        </div>
      </div>
    </article>
  );
}

function PartnerDealerCard({ group }: { group: DealerCluster }) {
  const dealerName = group.dealer?.legal_name ?? group.dealer?.name ?? "Concessionaria";
  const dealerSlug = resolveDealerSlug(group.dealer ? [group.dealer] : null);
  const priceAverage = averagePrice(group.vehicles);
  const cities = uniqueValues(group.vehicles.map((vehicle) => vehicle.city));

  return (
    <article className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.24)] transition hover:-translate-y-1 hover:shadow-[0_30px_80px_-35px_rgba(15,23,42,0.32)]">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">Partner</p>
      <h3 className="mt-2 text-xl font-semibold text-slate-900">{dealerName}</h3>
      <p className="mt-2 text-sm text-slate-600">{group.vehicles.length} veicoli pubblicati</p>
      <div className="mt-4 space-y-2 text-sm text-slate-600">
        <p>Città: {cities.length > 0 ? cities.join(" • ") : "-"}</p>
        <p>Prezzo medio: {priceAverage}</p>
      </div>
      <div className="mt-5 flex gap-2">
        <Link href={`/concessionarie/${dealerSlug}`} className="inline-flex items-center justify-center rounded-3xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
          Apri profilo
        </Link>
        {group.vehicles[0] ? (
          <Link href={`/auto/${group.vehicles[0].id}`} className="inline-flex items-center justify-center rounded-3xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
            Primo veicolo
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function groupDealers(vehicles: MarketplaceVehicle[]) {
  const map = new Map<string, DealerCluster>();

  for (const vehicle of vehicles) {
    const dealer = Array.isArray(vehicle.dealers) ? vehicle.dealers[0] ?? null : vehicle.dealers ?? null;
    const dealerId = String(vehicle.dealer_id ?? dealer?.id ?? resolveDealerSlug(vehicle.dealers));

    if (!map.has(dealerId)) {
      map.set(dealerId, { dealerId, dealer, vehicles: [] });
    }

    map.get(dealerId)?.vehicles.push(vehicle);
  }

  return [...map.values()].sort((a, b) => b.vehicles.length - a.vehicles.length);
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => formatText(value)).filter((value) => value !== "-"))).sort((a, b) => a.localeCompare(b, "it-IT"));
}

function averagePrice(vehicles: MarketplaceVehicle[]) {
  const numericValues = vehicles
    .map((vehicle) => Number(vehicle.price ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (numericValues.length === 0) {
    return "-";
  }

  const average = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(average);
}

function byNewest(a: MarketplaceVehicle, b: MarketplaceVehicle) {
  return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
}

function byFeatured(a: MarketplaceVehicle, b: MarketplaceVehicle) {
  return Number(b.price ?? 0) - Number(a.price ?? 0) || byNewest(a, b);
}
