import type { Metadata } from "next";
import Link from "next/link";
import { AnimatedCounter } from "@/components/marketplace/animated-counter";
import { CategoryRail, type MarketplaceCategory } from "@/components/marketplace/category-rail";
import { MarqueeBrands } from "@/components/marketplace/marquee-brands";
import { RevealOnScroll } from "@/components/marketplace/reveal-on-scroll";
import { SpecShowcase, type SpecShowcaseVehicle } from "@/components/marketplace/spec-showcase";
import {
  MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES,
  MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES,
  formatMileage,
  formatPrice,
  formatText,
  logMarketplaceQueryError,
  normalizeVehicleDealerName,
  publicSupabase,
  resolveDealerSlug,
  resolveVehicleImageUrl,
  resolveVehicleImages,
  resolveVehicleLabel,
  toAbsoluteUrl,
  type MarketplaceDealer,
  type MarketplaceVehicle,
} from "@/lib/public-marketplace";

export const dynamic = "force-dynamic";

type DealerCluster = {
  dealerId: string;
  dealer: MarketplaceDealer | null;
  vehicles: MarketplaceVehicle[];
};

const PRICE_BANDS = [
  { label: "Fino a 15.000 €", value: "15000" },
  { label: "Fino a 25.000 €", value: "25000" },
  { label: "Fino a 35.000 €", value: "35000" },
  { label: "Fino a 50.000 €", value: "50000" },
] as const;

export function generateMetadata(): Metadata {
  const description = "KeyAuto: il marketplace auto con concessionarie verificate. Esplora veicoli, confronta offerte e trova la tua prossima auto in tutta Italia.";
  const canonical = toAbsoluteUrl("/");

  return {
    title: "KeyAuto | Trova la tua prossima auto",
    description,
    alternates: { canonical },
    openGraph: {
      title: "KeyAuto | Trova la tua prossima auto",
      description,
      url: canonical,
      type: "website",
    },
  };
}

export default async function MarketplaceHomePage() {
  const [{ data, error }, { count: totalVehicleCount }, { data: dealerIdRows }] = await Promise.all([
    publicSupabase
      .from("vehicles")
      .select(
        "id, brand, model, version, year, mileage, price, fuel, transmission, city, status, created_at, dealer_id, dealers!inner(id, name, logo_url, legal_name, status), vehicle_images(image_url, position, is_cover)"
      )
      .eq("published", true)
      .in("status", MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES)
      .in("dealers.status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES)
      .order("created_at", { ascending: false })
      .limit(24),
    // Head-only count for the true "Veicoli pubblicati" total: the query
    // above is capped at 24 rows (the "latest arrivals" window), so
    // vehicles.length alone would understate the real number.
    publicSupabase
      .from("vehicles")
      .select("id, dealers!inner(status)", { count: "exact", head: true })
      .eq("published", true)
      .in("status", MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES)
      .in("dealers.status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES),
    // dealer_id only (not head-only): counting distinct dealers needs the
    // actual values. This deliberately counts dealers that have at least one
    // published vehicle, not just any dealer marked active/approved in the
    // system — a "partner" with zero live inventory isn't a real partner yet.
    publicSupabase
      .from("vehicles")
      .select("dealer_id, dealers!inner(status)")
      .eq("published", true)
      .in("status", MARKETPLACE_PUBLISHABLE_VEHICLE_STATUS_VALUES)
      .in("dealers.status", MARKETPLACE_PUBLISHABLE_DEALER_STATUS_VALUES),
  ]);

  const totalDealerCount = new Set((dealerIdRows ?? []).map((row) => row.dealer_id)).size;

  if (error) {
    logMarketplaceQueryError("home", error);
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

  const vehicles = (data ?? []) as unknown as MarketplaceVehicle[];
  const latestVehicles = [...vehicles].sort(byNewest).slice(0, 6);
  const featuredVehicles = [...vehicles].sort(byFeatured);
  const partnerDealers = groupDealers(vehicles).slice(0, 4);
  const brands = uniqueValues(vehicles.map((vehicle) => vehicle.brand));
  const fuels = uniqueValues(vehicles.map((vehicle) => vehicle.fuel));
  const transmissions = uniqueValues(vehicles.map((vehicle) => vehicle.transmission));
  const cities = uniqueValues(vehicles.map((vehicle) => vehicle.city));

  const latestVehicleCards = await Promise.all(latestVehicles.map((vehicle) => buildVehicleCard(vehicle)));
  const showcaseVehicle = await buildShowcaseVehicle(featuredVehicles[0] ?? vehicles[0] ?? null);

  const categories: MarketplaceCategory[] = [
    ...fuels.map((fuel) => ({
      label: fuel,
      description: `Veicoli alimentati a ${fuel.toLowerCase()}.`,
      href: `/ricerca?fuel=${encodeURIComponent(fuel)}`,
      count: vehicles.filter((vehicle) => formatText(vehicle.fuel) === fuel).length,
    })),
    ...transmissions.map((transmission) => ({
      label: `Cambio ${transmission.toLowerCase()}`,
      description: `Guida con cambio ${transmission.toLowerCase()}.`,
      href: `/ricerca?transmission=${encodeURIComponent(transmission)}`,
      count: vehicles.filter((vehicle) => formatText(vehicle.transmission) === transmission).length,
    })),
  ].filter((category) => category.count > 0);

  const quickChips = [
    ...fuels.slice(0, 3).map((fuel) => ({ label: fuel, href: `/ricerca?fuel=${encodeURIComponent(fuel)}` })),
    { label: "Sotto 15.000 €", href: "/ricerca?maxPrice=15000" },
    ...transmissions.slice(0, 1).map((transmission) => ({ label: transmission, href: `/ricerca?transmission=${encodeURIComponent(transmission)}` })),
  ];

  return (
    <main className="bg-slate-950">
      {/* ============ HERO — search-first ============ */}
      <section className="relative overflow-hidden px-4 pb-20 pt-16 sm:px-6 sm:pt-20 lg:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(60% 45% at 18% 0%, rgba(76,130,247,0.22), transparent 60%), radial-gradient(55% 40% at 88% 15%, rgba(55,224,232,0.14), transparent 62%), linear-gradient(180deg, #070a14 0%, #0a0e1a 55%, #070a14 100%)",
          }}
        />
        <div
          aria-hidden="true"
          className="marketplace-halo pointer-events-none absolute left-1/2 top-[38%] -z-10 aspect-square w-[min(72vw,760px)] -translate-x-1/2 -translate-y-1/2 rounded-full blur-md"
          style={{ background: "radial-gradient(circle, rgba(76,130,247,0.3), rgba(55,224,232,0.08) 45%, transparent 68%)" }}
        />

        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
          <span className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300">
            <CheckIcon className="text-cyan-300" />
            Solo concessionarie verificate · Km e storico certificati
          </span>

          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl" style={{ textWrap: "balance" }}>
            Trova la tua{" "}
            <span className="bg-gradient-to-r from-white via-blue-100 to-cyan-300 bg-clip-text text-transparent">prossima auto</span>
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-slate-400">
            Migliaia di veicoli usati, km 0 e a noleggio dalle migliori concessionarie d&apos;Italia. Un&apos;unica ricerca, zero rumore.
          </p>

          <form
            action="/ricerca"
            method="GET"
            className="mt-2 w-full max-w-3xl rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-2.5 shadow-[0_30px_80px_-30px_rgba(76,130,247,0.45)] backdrop-blur"
          >
            <div className="grid gap-1 sm:grid-cols-[1.1fr_1fr_1fr_auto]">
              <HeroField label="Marca" name="brand" options={brands} placeholder="Qualsiasi marca" />
              <HeroTextField label="Modello" name="model" placeholder="Es. Serie 3, Golf..." />
              <HeroField
                label="Prezzo max"
                name="maxPrice"
                placeholder="Nessun limite"
                options={PRICE_BANDS.map((band) => band.label)}
                values={PRICE_BANDS.map((band) => band.value)}
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-3xl bg-gradient-to-br from-white via-blue-100 to-blue-500 px-7 py-3.5 text-sm font-bold text-slate-950 shadow-[0_12px_30px_-10px_rgba(76,130,247,0.7)] transition hover:brightness-105"
              >
                <SearchIcon /> Cerca
              </button>
            </div>
          </form>

          {quickChips.length > 0 ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs text-slate-500">Ricerche popolari</span>
              {quickChips.map((chip) => (
                <Link
                  key={chip.label}
                  href={chip.href}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-white"
                >
                  {chip.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <MarqueeBrands brands={brands} />

      {/* ============ STATS ============ */}
      <section className="bg-slate-950 px-4 py-20 sm:px-6 lg:px-8">
        <RevealOnScroll className="mx-auto grid max-w-5xl grid-cols-2 gap-x-6 gap-y-10 text-center sm:grid-cols-4">
          <Stat value={totalVehicleCount ?? vehicles.length} label="Veicoli pubblicati" />
          <Stat value={totalDealerCount} label="Concessionarie partner" />
          <Stat value={cities.length} suffix="+" label="Città coperte" />
          <Stat value={brands.length} suffix="+" label="Marche disponibili" />
        </RevealOnScroll>
      </section>

      {/* ============ CATEGORIES ============ */}
      {categories.length > 0 ? (
        <section className="bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
          <RevealOnScroll className="mx-auto mb-8 max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Parti da qui</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Esplora per categoria</h2>
          </RevealOnScroll>
          <CategoryRail categories={categories} />
        </section>
      ) : null}

      {/* ============ SPEC SHOWCASE (real featured vehicle) ============ */}
      {showcaseVehicle ? <SpecShowcase vehicle={showcaseVehicle} /> : null}

      {/* ============ ULTIMI ARRIVI ============ */}
      <section className="bg-slate-950 px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <RevealOnScroll className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">In evidenza</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Gli ultimi arrivi</h2>
            </div>
            <Link href="/auto" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200">
              Vedi tutte le auto <ArrowIcon />
            </Link>
          </RevealOnScroll>

          {latestVehicleCards.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {latestVehicleCards.map((card, index) => (
                <RevealOnScroll key={card.id} delayMs={(index % 3) * 80}>
                  <DarkVehicleCard {...card} />
                </RevealOnScroll>
              ))}
            </div>
          ) : (
            <p className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">
              Nessun veicolo pubblicato al momento. Torna presto per vedere le nuove offerte.
            </p>
          )}
        </div>
      </section>

      {/* ============ CONCESSIONARIE PARTNER ============ */}
      {partnerDealers.length > 0 ? (
        <section className="bg-slate-950 px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <RevealOnScroll className="mb-10 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">La rete</p>
                <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Concessionarie partner</h2>
              </div>
              <Link href="/concessionarie" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200">
                Tutte le concessionarie <ArrowIcon />
              </Link>
            </RevealOnScroll>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {partnerDealers.map((group, index) => (
                <RevealOnScroll key={group.dealerId} delayMs={(index % 4) * 70}>
                  <PartnerDealerCard group={group} />
                </RevealOnScroll>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ============ TRUST ============ */}
      <section className="bg-slate-950 px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <RevealOnScroll>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Perché KeyAuto</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl" style={{ textWrap: "balance" }}>
              Comprare usato, senza ansia
            </h2>
            <p className="mt-4 max-w-lg text-slate-400">
              Ogni annuncio arriva da concessionarie verificate. Niente privati improvvisati, solo realtà con partita IVA e reputazione controllata.
            </p>
          </RevealOnScroll>
          <RevealOnScroll delayMs={80} className="grid gap-3">
            <TrustLine title="Concessionarie verificate" text="Partita IVA, sede e reputazione controllate prima della pubblicazione." />
            <TrustLine title="Km e storico dichiarati" text="Chilometraggio, alimentazione e cambio sempre indicati in scheda." />
            <TrustLine title="Contatto diretto" text="Parli con la concessionaria, senza intermediari nascosti." />
          </RevealOnScroll>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="bg-slate-950 px-4 pb-24 pt-4 sm:px-6 lg:px-8">
        <RevealOnScroll
          className="relative mx-auto max-w-5xl overflow-hidden rounded-[34px] border border-white/10 px-6 py-16 text-center sm:px-10"
          style={{ background: "linear-gradient(160deg, #12224a, #0b1120 70%)" }}
        >
          <h2 className="mx-auto max-w-lg text-3xl font-extrabold tracking-tight text-white sm:text-4xl" style={{ textWrap: "balance" }}>
            La tua prossima auto ti sta aspettando
          </h2>
          <p className="mx-auto mt-4 max-w-md text-slate-400">
            Inizia dalla ricerca. Sei una concessionaria? Pubblica il tuo stock e raggiungi migliaia di acquirenti.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/auto"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-7 py-3.5 text-sm font-bold text-slate-950 shadow-[0_16px_40px_-14px_rgba(76,130,247,0.8)] transition hover:brightness-105"
            >
              <SearchIcon /> Cerca un&apos;auto
            </Link>
            <Link
              href="/registrazione"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Sei una concessionaria?
            </Link>
          </div>
        </RevealOnScroll>
      </section>
    </main>
  );
}

/* ============================================================
   Server-side data shaping
   ============================================================ */

async function buildVehicleCard(vehicle: MarketplaceVehicle) {
  const cover = resolveVehicleImages(vehicle.vehicle_images)[0] ?? null;
  const imageUrl = cover ? await resolveVehicleImageUrl(cover) : null;

  return {
    id: vehicle.id,
    title: resolveVehicleLabel(vehicle),
    dealerName: normalizeVehicleDealerName(vehicle.dealers),
    dealerSlug: resolveDealerSlug(vehicle.dealers),
    city: formatText(vehicle.city),
    year: formatText(vehicle.year),
    mileage: formatMileage(vehicle.mileage),
    fuel: formatText(vehicle.fuel),
    transmission: formatText(vehicle.transmission),
    price: formatPrice(vehicle.price),
    imageUrl,
  };
}

async function buildShowcaseVehicle(vehicle: MarketplaceVehicle | null): Promise<SpecShowcaseVehicle | null> {
  if (!vehicle) return null;

  const cover = resolveVehicleImages(vehicle.vehicle_images)[0] ?? null;
  const imageUrl = cover ? await resolveVehicleImageUrl(cover) : null;

  return {
    id: vehicle.id,
    title: resolveVehicleLabel(vehicle),
    subtitle: [formatText(vehicle.city), normalizeVehicleDealerName(vehicle.dealers)].join(" · "),
    priceLabel: formatPrice(vehicle.price),
    imageUrl,
    rows: [
      { key: "year", label: "Anno", value: formatText(vehicle.year), icon: "calendar" },
      { key: "fuel", label: "Alimentazione", value: formatText(vehicle.fuel), icon: "fuel" },
      { key: "dealer", label: "Concessionaria", value: normalizeVehicleDealerName(vehicle.dealers), icon: "shield" },
      { key: "mileage", label: "Percorrenza", value: formatMileage(vehicle.mileage), icon: "gauge" },
      { key: "transmission", label: "Cambio", value: formatText(vehicle.transmission), icon: "gearbox" },
      { key: "city", label: "Città", value: formatText(vehicle.city), icon: "check" },
    ],
  };
}

/* ============================================================
   Presentational pieces
   ============================================================ */

function Stat({ value, label, suffix }: { value: number; label: string; suffix?: string }) {
  return (
    <div>
      <AnimatedCounter
        value={value}
        suffix={suffix}
        className="bg-gradient-to-b from-white to-blue-200 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl"
      />
      <p className="mt-2 text-sm text-slate-400">{label}</p>
    </div>
  );
}

function TrustLine({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
      <span className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-lg bg-cyan-400/15 text-cyan-300">
        <CheckIcon />
      </span>
      <div>
        <p className="font-semibold text-white">{title}</p>
        <p className="mt-0.5 text-sm text-slate-400">{text}</p>
      </div>
    </div>
  );
}

type VehicleCardData = Awaited<ReturnType<typeof buildVehicleCard>>;

function DarkVehicleCard(vehicle: VehicleCardData) {
  return (
    <Link
      href={`/auto/${vehicle.id}`}
      className="group block overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-b from-slate-800/70 to-slate-900 transition hover:-translate-y-1 hover:border-white/20"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-slate-700 via-slate-900 to-slate-950">
        {vehicle.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vehicle.imageUrl}
            alt={vehicle.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : null}
        {vehicle.fuel !== "-" ? (
          <span className="absolute right-3 top-3 rounded-full bg-gradient-to-br from-emerald-300 to-cyan-300 px-3 py-1 text-xs font-bold text-slate-950">
            {vehicle.fuel}
          </span>
        ) : null}
      </div>
      <div className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-semibold text-white">{vehicle.title}</h3>
          <span className="text-xs text-slate-500">{vehicle.year}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Tag>{vehicle.mileage}</Tag>
          <Tag>{vehicle.transmission}</Tag>
          <Tag>{vehicle.city}</Tag>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
          <span className="text-xl font-extrabold tracking-tight text-white">{vehicle.price}</span>
          <span className="text-right text-xs text-slate-500">{vehicle.dealerName}</span>
        </div>
      </div>
    </Link>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">{children}</span>;
}

function PartnerDealerCard({ group }: { group: DealerCluster }) {
  const dealerName = group.dealer?.legal_name ?? group.dealer?.name ?? "Concessionaria";
  const dealerSlug = resolveDealerSlug(group.dealer ? [group.dealer] : null);

  return (
    <Link
      href={`/concessionarie/${dealerSlug}`}
      className="block rounded-[26px] border border-white/10 bg-gradient-to-br from-slate-800 to-slate-950 p-5 transition hover:-translate-y-1 hover:border-cyan-300/40"
    >
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-white via-blue-100 to-blue-300 text-lg font-extrabold text-slate-950">
        {dealerName.charAt(0)}
      </div>
      <h3 className="mt-4 font-semibold text-white">{dealerName}</h3>
      <p className="mt-3 border-t border-white/10 pt-3 text-sm text-slate-400">
        <span className="font-semibold text-cyan-300">{group.vehicles.length}</span> veicoli disponibili
      </p>
    </Link>
  );
}

function HeroField({
  label,
  name,
  placeholder,
  options,
  values,
}: {
  label: string;
  name: string;
  placeholder: string;
  options: string[];
  values?: string[];
}) {
  const finalValues = values ?? options;

  // Colors are set inline (not via Tailwind classes) on purpose: globals.css
  // has an UNLAYERED `select { color: ... }` rule for the app's light forms,
  // and unlayered rules beat Tailwind's layered utilities regardless of
  // specificity — so `text-white` alone loses and the value renders dark on
  // this dark hero. Inline styles win, and colorScheme:dark makes the native
  // dropdown render dark so the light option text stays readable when open.
  return (
    <label className="block rounded-2xl px-4 py-2.5 transition hover:bg-white/[0.04]">
      <span className="block text-[0.65rem] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <select
        name={name}
        defaultValue=""
        style={{ color: "#f8fafc", colorScheme: "dark" }}
        className="mt-0.5 w-full appearance-none bg-transparent text-sm font-semibold outline-none"
      >
        <option value="" style={{ color: "#cbd5e1", backgroundColor: "#0f172a" }}>
          {placeholder}
        </option>
        {options.map((option, index) => (
          <option key={option} value={finalValues[index] ?? option} style={{ color: "#f8fafc", backgroundColor: "#0f172a" }}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function HeroTextField({ label, name, placeholder }: { label: string; name: string; placeholder: string }) {
  return (
    <label className="block rounded-2xl px-4 py-2.5 transition hover:bg-white/[0.04]">
      <span className="block text-[0.65rem] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <input
        name={name}
        placeholder={placeholder}
        autoComplete="off"
        suppressHydrationWarning
        // Inline color for the same unlayered-globals.css reason as HeroField:
        // the typed value would otherwise render dark on this dark hero.
        style={{ color: "#f8fafc" }}
        className="mt-0.5 w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-500 placeholder:font-medium"
      />
    </label>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[2.4]" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[2.2]" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 fill-none stroke-current stroke-[3] ${className ?? ""}`} aria-hidden="true">
      <path d="M20 7 9 18l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ============================================================
   Data helpers (unchanged logic from the previous home page)
   ============================================================ */

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

function uniqueValues(values: Array<string | number | null | undefined>) {
  return Array.from(new Set(values.map((value) => formatText(value)).filter((value) => value !== "-"))).sort((a, b) =>
    a.localeCompare(b, "it-IT")
  );
}

function byNewest(a: MarketplaceVehicle, b: MarketplaceVehicle) {
  return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
}

function byFeatured(a: MarketplaceVehicle, b: MarketplaceVehicle) {
  return Number(b.price ?? 0) - Number(a.price ?? 0) || byNewest(a, b);
}
